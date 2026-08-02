import { usePlayerStore } from '../stores/playerStore';
import { initDB } from '../lib/db';
import { Track } from '../types';
import { api } from '../utils/api';
import {
  hasRealAudioFeatures,
  getAudioFeatures,
  cosineSimilarity,
  getFeatureVector
} from '../utils/musicMath';
import {
  cleanString,
  normalizeTitleForDuplication,
  isDuplicateTrack
} from '../utils/trackUtils';

export {
  cleanString,
  normalizeTitleForDuplication,
  isDuplicateTrack
};

export interface AudioFeatures {
  bpm: number;
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  genre: string;
  year: number;
}

const GENRE_FAMILIES: Record<string, string[]> = {
  rock: ['rock', 'alternative rock', 'indie rock', 'punk rock', 'metal', 'grunge', 'hard rock', 'soft rock', 'alt-rock', 'indie-rock'],
  pop: ['pop', 'dance', 'synthpop', 'indie pop', 'electro-pop', 'bedroom pop', 'k-pop', 'j-pop'],
  hiphop: ['hip hop', 'rap', 'trap', 'r&b', 'soul', 'hip-hop', 'lofi hip hop'],
  electronic: ['electronic', 'edm', 'house', 'techno', 'ambient', 'chillout', 'downtempo', 'synthwave'],
  classical: ['classical', 'instrumental', 'orchestral', 'piano', 'ambient classical'],
  jazz: ['jazz', 'blues', 'soul', 'funk']
};

const QUALITY_BLACKLIST_PATTERNS = [
  /^untitled/i,
  /test\s*track/i,
  /no\s*title/i,
  /unknown\s*track/i,
  /10\s*hours?/i,
  /ringtone/i,
  /whatsapp\s*status/i,
  /earrape/i,
  /bass\s*boost(ed)?/i,
  /low\s*quality/i,
  /soundhelix/i,
  /demo\s*track/i,
];

export function areGenresRelated(genreA: string, genreB: string): boolean {
  const gA = (genreA || '').toLowerCase().trim();
  const gB = (genreB || '').toLowerCase().trim();
  if (!gA || !gB) return false;
  if (gA === gB) return true;
  for (const family in GENRE_FAMILIES) {
    const list = GENRE_FAMILIES[family];
    const hasA = list.some(g => gA.includes(g) || g.includes(gA));
    const hasB = list.some(g => gB.includes(g) || g.includes(gB));
    if (hasA && hasB) return true;
  }
  return false;
}

export function passesQualityFilter(track: Track): boolean {
  const title = (track.title || '').trim();
  const artist = (track.artist || '').trim();
  if (!title || title.length < 2) return false;
  if (!artist || artist.length < 1) return false;
  if (track.duration !== undefined && track.duration !== null && track.duration !== 0) {
    if (track.duration < 60 || track.duration > 900) return false;
  }
  for (const pattern of QUALITY_BLACKLIST_PATTERNS) {
    if (pattern.test(title) || pattern.test(artist)) return false;
  }
  return true;
}

export function isHighQualityTrack(track: Track): boolean {
  return passesQualityFilter(track);
}

interface ScoredCandidate {
  track: Track;
  compositeScore: number;
  confidence: number;
  popularityScore: number;
  userAffinityScore: number;
  sessionRelevanceScore: number;
  artistAffinityScore: number;
  skipPenalty: number;
}

export const SmartQueueService = {
  /**
   * Enterprise Multi-Stage Auto-Queue Pipeline:
   * Stage 1: Candidate Generation (YouTube Radio + Artist Hits + Library)
   * Stage 2: Intelligent Filtering (Quality + Dupes + Skips + Saturation)
   * Stage 3: Multi-Factor Weighted Scoring (Popularity 30% + User 25% + Session 20% + Artist 15% - Skip 15%)
   * Stage 4: Confidence Thresholding & Dynamic Queue Insertion
   */
  async triggerAutoQueue(currentTrack: Track): Promise<void> {
    try {
      const playerStore = usePlayerStore.getState();
      if (playerStore.queue.length >= 50) return;

      const db = await initDB();
      const videoId = currentTrack.videoId || (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined);

      console.log(`[SmartQueuePipeline] Initiating multi-stage recommendation for seed track: "${currentTrack.artist} - ${currentTrack.title}"`);

      // ─── STAGE 1: CANDIDATE GENERATION ────────────────────────────────────
      const candidateMap = new Map<string, Track>();

      // Source A: YouTube Music Watch Next / Radio Candidates
      try {
        const radioResults = await api.ytRadio(videoId, currentTrack.title, currentTrack.artist);
        if (radioResults && radioResults.length > 0) {
          radioResults.forEach((t, idx) => {
            if (passesQualityFilter(t)) {
              // Attach default popularity score if not present
              t.popularity = t.popularity || Math.max(0.65, 0.95 - idx * 0.02);
              candidateMap.set(t.id, t);
            }
          });
        }
      } catch (err) {
        console.warn('[SmartQueuePipeline] Primary YouTube Radio fetch failed, trying fallback pools:', err);
      }

      // Source B: Artist Top Hits (if candidates are sparse or confidence check needs famous tracks)
      if (candidateMap.size < 12 && currentTrack.artist) {
        try {
          const artistHits = await api.search(`${currentTrack.artist} top hits`);
          if (artistHits && artistHits.length > 0) {
            artistHits.forEach((item, idx) => {
              const mapped: Track = {
                id: `yt-${item.videoId}`,
                title: item.title,
                artist: item.artist,
                album: item.album || 'Single',
                duration: item.duration || 200,
                coverArtUrl: item.coverArtUrl || null,
                source: 'youtube',
                streamUrl: `/api/yt/stream/${item.videoId}`,
                videoId: item.videoId,
                popularity: Math.max(0.70, 0.98 - idx * 0.03),
                addedAt: Date.now(),
              };
              if (passesQualityFilter(mapped) && !candidateMap.has(mapped.id)) {
                candidateMap.set(mapped.id, mapped);
              }
            });
          }
        } catch (err) {
          console.warn('[SmartQueuePipeline] Artist top hits fallback failed:', err);
        }
      }

      // Source C: High-Affinity Local DB Tracks
      const localTracks = await db.getAll('tracks');
      localTracks.filter(passesQualityFilter).forEach((t) => {
        if (!candidateMap.has(t.id)) {
          t.popularity = t.popularity || 0.75;
          candidateMap.set(t.id, t);
        }
      });

      const rawCandidates = Array.from(candidateMap.values());
      if (rawCandidates.length === 0) {
        console.warn('[SmartQueuePipeline] No candidates available from any source.');
        return;
      }

      // ─── STAGE 2: INTELLIGENT FILTERING ───────────────────────────────────
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      // Filter recent plays
      const recentHistory = await db.getAllFromIndex('history', 'playedAt', IDBKeyRange.lowerBound(twoHoursAgo));
      const recentlyPlayedIds = new Set<string>(recentHistory.map((e) => e.trackId));

      // Filter recent skips from playSessions (< 30s listen)
      const recentSessions = await db.getAllFromIndex('playSessions', 'startTime', IDBKeyRange.lowerBound(thirtyDaysAgo));
      const skippedTrackIds = new Set<string>(recentSessions.filter((s) => s.skipped).map((s) => s.trackId));
      const completedTrackIds = new Set<string>(recentSessions.filter((s) => s.completed).map((s) => s.trackId));

      // User favorites & high play count tracks
      const favorites = await db.getAll('favorites');
      const favoriteTrackIds = new Set(favorites.map((f) => f.trackId));

      const queueIds = new Set<string>(playerStore.queue.map((t) => t.id));

      const filteredCandidates = rawCandidates.filter((candidate) => {
        // Exclude current track
        if (candidate.id === currentTrack.id) return false;
        // Exclude tracks already in current queue
        if (queueIds.has(candidate.id)) return false;
        // Exclude recent play history (last 2 hours)
        if (recentlyPlayedIds.has(candidate.id)) return false;
        // Exclude duplicate titles
        if (isDuplicateTrack(candidate, currentTrack)) return false;
        if (playerStore.queue.some((q) => isDuplicateTrack(q, candidate))) return false;
        // Hard-filter tracks skipped repeatedly (> 2 skips)
        if (candidate.skipCount && candidate.skipCount > 2) return false;
        return true;
      });

      // ─── STAGE 3: MULTI-FACTOR WEIGHTED SCORING ENGINE ────────────────────
      const currentArtist = (currentTrack.artist || '').toLowerCase().trim();
      const currentGenre = (currentTrack.genre || '').toLowerCase().trim();
      const currentFeatures = getAudioFeatures(currentTrack);
      const currentVector = getFeatureVector(currentFeatures);

      const scoredCandidates: ScoredCandidate[] = filteredCandidates.map((candidate) => {
        const candArtist = (candidate.artist || '').toLowerCase().trim();
        const candGenre = (candidate.genre || '').toLowerCase().trim();

        // 1. Popularity Score (Weight: 0.35) - Recognizable Hits
        const popularityScore = candidate.popularity || 0.80;

        // 2. User Affinity Score (Weight: 0.20)
        let userAffinityScore = 0.65;
        if (favoriteTrackIds.has(candidate.id)) userAffinityScore = 1.0;
        else if (completedTrackIds.has(candidate.id)) userAffinityScore = 0.85;

        // 3. Session Relevance & Smooth Flow Score (Weight: 0.25)
        let sessionRelevanceScore = 0.70;
        if (hasRealAudioFeatures(candidate)) {
          const candFeatures = getAudioFeatures(candidate);
          const candVector = getFeatureVector(candFeatures);
          sessionRelevanceScore = cosineSimilarity(currentVector, candVector);
          const bpmDiff = Math.abs(candFeatures.bpm - currentFeatures.bpm) / currentFeatures.bpm;
          if (bpmDiff <= 0.12) sessionRelevanceScore += 0.10;
        } else {
          if (candGenre && candGenre === currentGenre && candGenre !== 'unknown') {
            sessionRelevanceScore = 0.90;
          } else if (areGenresRelated(candGenre, currentGenre)) {
            sessionRelevanceScore = 0.80;
          }
        }

        // 4. Artist Affinity & Relationship (Weight: 0.20)
        let artistAffinityScore = 0.60;
        if (candArtist && candArtist === currentArtist) {
          artistAffinityScore = 1.0;
        } else if (candArtist && currentArtist.includes(candArtist)) {
          artistAffinityScore = 0.85; // Collaborator
        }

        // 5. Skip Penalty (Weight: -0.20)
        let skipPenalty = 0;
        if (skippedTrackIds.has(candidate.id)) skipPenalty = 0.70;

        // Composite Weighted Formula
        const compositeScore =
          0.35 * popularityScore +
          0.20 * userAffinityScore +
          0.25 * sessionRelevanceScore +
          0.20 * artistAffinityScore -
          0.20 * skipPenalty;

        const confidence = Math.max(0.0, Math.min(1.0, compositeScore));

        return {
          track: candidate,
          compositeScore,
          confidence,
          popularityScore,
          userAffinityScore,
          sessionRelevanceScore,
          artistAffinityScore,
          skipPenalty,
        };
      });

      // Sort by composite score descending
      scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

      // ─── STAGE 4: CONFIDENCE THRESHOLD & ARTIST SATURATION GUARD ──────────
      const CONFIDENCE_THRESHOLD = 0.45;
      const TARGET_COUNT = 5;

      const finalQueueTracks: Track[] = [];
      const artistCountsInBatch = new Map<string, number>();

      for (const candidate of scoredCandidates) {
        if (finalQueueTracks.length >= TARGET_COUNT) break;

        // Skip candidates below confidence threshold
        if (candidate.confidence < CONFIDENCE_THRESHOLD) {
          console.warn(`[SmartQueuePipeline] Candidate "${candidate.track.artist} - ${candidate.track.title}" fell below confidence threshold (${candidate.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`);
          continue;
        }

        const artist = (candidate.track.artist || '').toLowerCase().trim();
        const currentArtistCount = artistCountsInBatch.get(artist) || 0;

        // Strict Artist Saturation Guard: Max 2 tracks per artist in auto-queue batch
        if (currentArtistCount >= 2) continue;

        finalQueueTracks.push(candidate.track);
        artistCountsInBatch.set(artist, currentArtistCount + 1);
      }

      // If top candidate confidence was insufficient, fallback to top artist hits
      if (finalQueueTracks.length === 0 && scoredCandidates.length > 0) {
        console.log('[SmartQueuePipeline] High confidence threshold fallback: Selecting top popular tracks.');
        finalQueueTracks.push(scoredCandidates[0].track);
      }

      if (finalQueueTracks.length > 0) {
        console.log(
          `[SmartQueuePipeline] Successfully generated ${finalQueueTracks.length} high-confidence auto-queue tracks:`,
          finalQueueTracks.map((t) => `${t.artist} - ${t.title}`)
        );

        // Store selected tracks in IndexedDB DB cache for fast replay
        const tx = db.transaction('tracks', 'readwrite');
        for (const t of finalQueueTracks) {
          await tx.store.put(t);
        }
        await tx.done;

        // Append to Zustand player queue
        usePlayerStore.setState({ queue: [...playerStore.queue, ...finalQueueTracks] });
      }
    } catch (e) {
      console.error('[SmartQueuePipeline] Auto-queue multi-stage pipeline failed:', e);
    }
  },
};
