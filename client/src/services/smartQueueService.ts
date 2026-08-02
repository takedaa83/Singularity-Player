import { usePlayerStore } from '../stores/playerStore';
import { initDB } from '../lib/db';
import { Track } from '../types';
import { api } from '../utils/api';
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
  return gA === gB;
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

export const SmartQueueService = {
  /**
   * Metrolist-Style YouTube Music Radio Auto-Queue Pipeline:
   * 1. Fetch YouTube Music Radio recommendations (RDAMVM + videoId).
   * 2. Filter out active queue tracks, recently played tracks (last 2h), skipped tracks, and low-quality titles.
   * 3. Apply Artist Saturation Guard (max 2 tracks per artist per batch).
   * 4. Direct Queue Insertion of YouTube Music's top-ranked radio tracks!
   */
  async triggerAutoQueue(currentTrack: Track): Promise<void> {
    try {
      const playerStore = usePlayerStore.getState();
      if (playerStore.queue.length >= 50) return;

      const db = await initDB();
      const videoId = currentTrack.videoId || (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined);

      console.log(`[SmartQueuePipeline] Triggering Metrolist-style radio queue for seed track: "${currentTrack.artist} - ${currentTrack.title}"`);

      let radioResults: Track[] = [];
      try {
        const results = await api.ytRadio(videoId, currentTrack.title, currentTrack.artist);
        if (results && results.length > 0) {
          radioResults = results.filter(t => !t.id.startsWith('demo-') && t.artist !== 'SoundHelix' && passesQualityFilter(t));
        }
      } catch (err) {
        console.warn('[SmartQueuePipeline] YouTube Radio fetch failed:', err);
      }

      // Fallback: If online radio returned nothing, search top hits for the seed artist or pull from local DB
      if (radioResults.length === 0) {
        if (currentTrack.artist) {
          try {
            const hits = await api.search(`${currentTrack.artist} top hits`);
            if (hits && hits.length > 0) {
              radioResults = hits.map(item => ({
                id: `yt-${item.videoId}`,
                title: item.title,
                artist: item.artist,
                album: item.album || 'Single',
                duration: item.duration || 200,
                coverArtUrl: item.coverArtUrl || null,
                source: 'youtube',
                streamUrl: `/api/yt/stream/${item.videoId}`,
                videoId: item.videoId,
                addedAt: Date.now(),
              })).filter(passesQualityFilter);
            }
          } catch (e) {
            console.warn('[SmartQueuePipeline] Fallback search failed:', e);
          }
        }

        if (radioResults.length === 0) {
          const localTracks = await db.getAll('tracks');
          radioResults = localTracks.filter(passesQualityFilter);
        }
      }

      if (radioResults.length === 0) {
        console.warn('[SmartQueuePipeline] No candidate tracks available.');
        return;
      }

      // Filter recent plays & skips
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const recentHistory = await db.getAllFromIndex('history', 'playedAt', IDBKeyRange.lowerBound(twoHoursAgo));
      const recentlyPlayedIds = new Set<string>(recentHistory.map((e) => e.trackId));

      const recentSessions = await db.getAllFromIndex('playSessions', 'startTime', IDBKeyRange.lowerBound(thirtyDaysAgo));
      const skippedTrackIds = new Set<string>(recentSessions.filter((s) => s.skipped).map((s) => s.trackId));

      const queueIds = new Set<string>(playerStore.queue.map((t) => t.id));

      const cleanCandidates = radioResults.filter((track) => {
        if (track.id === currentTrack.id) return false;
        if (queueIds.has(track.id)) return false;
        if (recentlyPlayedIds.has(track.id)) return false;
        if (skippedTrackIds.has(track.id)) return false;
        if (isDuplicateTrack(track, currentTrack)) return false;
        if (playerStore.queue.some((q) => isDuplicateTrack(q, track))) return false;
        if (track.skipCount && track.skipCount > 2) return false;
        return true;
      });

      // Apply Artist Saturation Guard (max 2 tracks per artist in batch of 5)
      const TARGET_COUNT = 5;
      const finalQueueTracks: Track[] = [];
      const artistCountsInBatch = new Map<string, number>();

      for (const track of cleanCandidates) {
        if (finalQueueTracks.length >= TARGET_COUNT) break;

        const artist = (track.artist || '').toLowerCase().trim();
        const currentArtistCount = artistCountsInBatch.get(artist) || 0;

        if (currentArtistCount >= 2) continue;

        finalQueueTracks.push(track);
        artistCountsInBatch.set(artist, currentArtistCount + 1);
      }

      // Safety fallback: If artist saturation was too restrictive, allow remaining clean candidates
      if (finalQueueTracks.length < TARGET_COUNT) {
        for (const track of cleanCandidates) {
          if (finalQueueTracks.length >= TARGET_COUNT) break;
          if (!finalQueueTracks.some(t => t.id === track.id)) {
            finalQueueTracks.push(track);
          }
        }
      }

      if (finalQueueTracks.length > 0) {
        console.log(
          `[SmartQueuePipeline] Appending ${finalQueueTracks.length} Metrolist-style YouTube Radio tracks to queue:`,
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
      console.error('[SmartQueuePipeline] Auto-queue generation failed:', e);
    }
  },
};
