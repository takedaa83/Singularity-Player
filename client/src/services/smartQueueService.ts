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

export function areGenresRelated(genreA: string, genreB: string): boolean {
  const gA = (genreA || '').toLowerCase().trim();
  const gB = (genreB || '').toLowerCase().trim();
  if (!gA || !gB) return false;
  return gA === gB;
}

export function isHighQualityTrack(track: Track): boolean {
  return passesQualityFilter(track);
}

export const SMART_QUEUE_CONFIG = {
  MAX_QUEUE_THRESHOLD: 50,
  BATCH_TARGET_COUNT: 5,
  MAX_ARTIST_PER_BATCH: 2,
  MIN_TRACK_DURATION_SEC: 60,
  MAX_TRACK_DURATION_SEC: 900,
  RECENT_HISTORY_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 days history check for frequency penalties
  SKIP_SESSION_WINDOW_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  MAX_SKIPS_THRESHOLD: 2,
  FALLBACK_LIBRARY_LIMIT: 20,
  TEMPERATURE: 0.55, // Boltzmann exploration temperature (0.5 - 0.6 = sweet spot for pleasing harmony + zero static repetition)
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

export function passesQualityFilter(track: Track): boolean {
  const title = (track.title || '').trim();
  const artist = (track.artist || '').trim();
  if (!title || title.length < 2) return false;
  if (!artist || artist.length < 1) return false;
  if (track.duration !== undefined && track.duration !== null && track.duration !== 0) {
    if (
      track.duration < SMART_QUEUE_CONFIG.MIN_TRACK_DURATION_SEC ||
      track.duration > SMART_QUEUE_CONFIG.MAX_TRACK_DURATION_SEC
    ) {
      return false;
    }
  }
  for (const pattern of QUALITY_BLACKLIST_PATTERNS) {
    if (pattern.test(title) || pattern.test(artist)) return false;
  }
  return true;
}

// In-session track exposure tracker (prevents loop repetition during active continuous listening)
const sessionExposureCounts = new Map<string, number>();

/**
 * Stochastic Boltzmann / Softmax Temperature Sampler without replacement.
 * Uses probability weights derived from acoustic affinity, popularity, and penalty scores.
 * Guarantees that playing Song A in different sessions produces varied, ear-pleasing tracks.
 */
function sampleWithTemperature(
  scoredCandidates: Array<{ track: Track; score: number }>,
  targetCount: number,
  temperature: number = SMART_QUEUE_CONFIG.TEMPERATURE,
  maxPerArtist: number = SMART_QUEUE_CONFIG.MAX_ARTIST_PER_BATCH
): Track[] {
  if (scoredCandidates.length === 0) return [];

  const pool = [...scoredCandidates];
  const selected: Track[] = [];
  const artistCounts = new Map<string, number>();

  while (selected.length < targetCount && pool.length > 0) {
    // 1. Filter candidates violating artist cap
    let eligibleIndices: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      const artist = (pool[i].track.artist || '').toLowerCase().trim();
      const count = artistCounts.get(artist) || 0;
      if (count < maxPerArtist) {
        eligibleIndices.push(i);
      }
    }

    if (eligibleIndices.length === 0) {
      // Relax artist cap if needed to fill batch
      if (maxPerArtist < 3) {
        maxPerArtist++;
        continue;
      }
      break;
    }

    // 2. Numerical stability: compute softmax relative to maxScore
    let maxScore = -Infinity;
    for (const idx of eligibleIndices) {
      if (pool[idx].score > maxScore) maxScore = pool[idx].score;
    }

    const expWeights: number[] = [];
    let sumWeights = 0;
    for (const idx of eligibleIndices) {
      const w = Math.exp((pool[idx].score - maxScore) / Math.max(0.1, temperature));
      expWeights.push(w);
      sumWeights += w;
    }

    // 3. Roulette wheel selection
    let randomVal = Math.random() * sumWeights;
    let chosenEligibleIdx = 0;
    for (let j = 0; j < expWeights.length; j++) {
      randomVal -= expWeights[j];
      if (randomVal <= 0) {
        chosenEligibleIdx = j;
        break;
      }
    }

    const chosenPoolIdx = eligibleIndices[chosenEligibleIdx];
    const chosen = pool[chosenPoolIdx].track;
    selected.push(chosen);

    const artist = (chosen.artist || '').toLowerCase().trim();
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);

    // Track session exposure
    sessionExposureCounts.set(chosen.id, (sessionExposureCounts.get(chosen.id) || 0) + 1);

    // Remove chosen from candidate pool
    pool.splice(chosenPoolIdx, 1);
  }

  return selected;
}

let inFlightPromise: Promise<void> | null = null;

export const SmartQueueService = {
  /**
   * Thread-safe, Concurrent-Safe Auto-Queue Engine (YouTube Music Logic):
   * - In-flight re-entrancy lock prevents duplicate background runs.
   * - Boltzmann temperature sampling (tau = 0.55) eliminates deterministic repetition.
   * - Session exposure and historical frequency penalty ensures continuous freshness.
   * - Tags auto-queued tracks with `isAutoQueued: true` for clean eviction on user actions.
   * - Responds immediately to `forceReanchor` when user manually enqueues new songs.
   */
  async triggerAutoQueue(
    anchorTrack: Track,
    options: { forceReanchor?: boolean } = {},
    deps = { store: usePlayerStore, getDb: initDB, apiClient: api }
  ): Promise<void> {
    if (inFlightPromise && !options.forceReanchor) {
      return inFlightPromise;
    }

    inFlightPromise = (async () => {
      try {
        await this._executeAutoQueue(anchorTrack, options, deps);
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  },

  async _executeAutoQueue(
    anchorTrack: Track,
    options: { forceReanchor?: boolean } = {},
    deps: { store: typeof usePlayerStore; getDb: typeof initDB; apiClient: typeof api }
  ): Promise<void> {
    const playerStoreState = deps.store.getState();
    if (playerStoreState.queue.length >= SMART_QUEUE_CONFIG.MAX_QUEUE_THRESHOLD) return;

    const initialTrackId = anchorTrack.id;
    const videoId =
      anchorTrack.videoId ||
      (anchorTrack.id.startsWith('yt-') ? anchorTrack.id.replace('yt-', '') : undefined);

    console.log(
      `[SmartQueueEngine] Fetching YouTube Music radio candidates (Anchor: "${anchorTrack.artist} - ${anchorTrack.title}")`
    );

    const db = await deps.getDb();
    let radioResults: Track[] = [];

    // Primary: Query YouTube Music Radio Continuation Graph
    try {
      const results = await deps.apiClient.ytRadio(videoId, anchorTrack.title, anchorTrack.artist);
      if (results && results.length > 0) {
        radioResults = results.filter(
          (t) => !t.id.startsWith('demo-') && t.artist !== 'SoundHelix' && passesQualityFilter(t)
        );
      }
    } catch (err) {
      console.warn('[SmartQueueEngine] YouTube Radio endpoint error, attempting fallback:', err);
    }

    // Secondary: Search artist mix / acoustic cluster if radio results are sparse
    if (radioResults.length < 15 && anchorTrack.artist) {
      try {
        const hits = await deps.apiClient.search(`${anchorTrack.artist} ${anchorTrack.genre || 'mix'}`);
        const parsedHits = hits
          .map((item: any): Track => ({
            id: `yt-${item.videoId}`,
            title: item.title,
            artist: item.artist,
            album: item.album || 'Single',
            genre: anchorTrack.genre || '',
            year: null,
            trackNumber: null,
            duration: item.duration || 200,
            bitrate: null,
            sampleRate: null,
            fileSize: 0,
            mimeType: 'audio/mp4',
            coverArtUrl: item.coverArtUrl || null,
            source: 'youtube',
            streamUrl: `/api/yt/stream/${item.videoId}`,
            filePath: null,
            videoId: item.videoId,
            popularity: 0.82,
            addedAt: Date.now(),
          }))
          .filter(passesQualityFilter);

        // Merge without duplicates
        for (const hit of parsedHits) {
          if (!radioResults.some((r) => r.id === hit.id || isDuplicateTrack(r, hit))) {
            radioResults.push(hit);
          }
        }
      } catch (e) {
        console.warn('[SmartQueueEngine] Fallback artist mix search failed:', e);
      }
    }

    // Tertiary: Local IndexedDB Bounded Query if offline or no network results
    if (radioResults.length === 0) {
      const localTracks = await db.getAll('tracks');
      radioResults = localTracks
        .filter(passesQualityFilter)
        .slice(0, SMART_QUEUE_CONFIG.FALLBACK_LIBRARY_LIMIT);
    }

    if (radioResults.length === 0) {
      console.warn('[SmartQueueEngine] No candidate tracks returned from any source.');
      return;
    }

    // ─── ANCHOR DRIFT CANCELLATION GUARD ─────────────────────────────────────
    // If not forced and the user skipped tracks while async fetches ran, abort stale commit!
    if (!options.forceReanchor) {
      const liveCurrentTrack = deps.store.getState().currentTrack;
      if (liveCurrentTrack && liveCurrentTrack.id !== initialTrackId) {
        console.log(
          '[SmartQueueEngine] Playback state changed during fetch. Aborting stale auto-queue insertion.'
        );
        return;
      }
    }

    // ─── HISTORY, SKIPS & FREQUENCY LOOKUPS ───────────────────────────────────
    const historyStartTime = Date.now() - SMART_QUEUE_CONFIG.RECENT_HISTORY_WINDOW_MS;
    const thirtyDaysAgo = Date.now() - SMART_QUEUE_CONFIG.SKIP_SESSION_WINDOW_MS;

    const recentHistory = await db.getAllFromIndex(
      'history',
      'playedAt',
      IDBKeyRange.lowerBound(historyStartTime)
    );
    const historyPlayCounts = new Map<string, number>();
    const historyLastPlayed = new Map<string, number>();
    for (const entry of recentHistory) {
      historyPlayCounts.set(entry.trackId, (historyPlayCounts.get(entry.trackId) || 0) + 1);
      const prev = historyLastPlayed.get(entry.trackId) || 0;
      if (entry.playedAt > prev) historyLastPlayed.set(entry.trackId, entry.playedAt);
    }

    const recentSessions = await db.getAllFromIndex(
      'playSessions',
      'startTime',
      IDBKeyRange.lowerBound(thirtyDaysAgo)
    );
    const skippedTrackIds = new Set<string>(
      recentSessions.filter((s) => s.skipped).map((s) => s.trackId)
    );

    const liveState = deps.store.getState();
    const liveQueue = liveState.queue;
    const queueIds = new Set<string>(liveQueue.map((t) => t.id));

    // Exclude current track and immediate duplicates from candidates
    const cleanCandidates = radioResults.filter((track) => {
      if (track.id === anchorTrack.id) return false;
      if (queueIds.has(track.id)) return false;
      if (isDuplicateTrack(track, anchorTrack)) return false;
      if (liveQueue.some((q) => isDuplicateTrack(q, track))) return false;
      if (track.skipCount && track.skipCount >= SMART_QUEUE_CONFIG.MAX_SKIPS_THRESHOLD) return false;
      return true;
    });

    if (cleanCandidates.length === 0) return;

    // ─── FAVORITES LOOKUP FOR AFFINITY BOOST ────────────────────────────────
    const favorites = await db.getAll('favorites');
    const favoriteTrackIds = new Set(favorites.map((f) => f.trackId));

    // ─── BOLTZMANN TEMPERATURE SCORING ENGINE ──────────────────────────────
    const now = Date.now();
    const anchorArtist = (anchorTrack.artist || '').toLowerCase().trim();

    const scoredCandidates = cleanCandidates.map((track) => {
      let score = (track.popularity || 0.85) * 1.5;

      // Artist affinity / collaborator bonus
      const candArtist = (track.artist || '').toLowerCase().trim();
      if (candArtist && anchorArtist && (candArtist.includes(anchorArtist) || anchorArtist.includes(candArtist))) {
        score += 0.35;
      }

      // User favorite boost
      if (favoriteTrackIds.has(track.id)) {
        score += 0.40;
      }

      // 1. Session Exposure Penalty (Prevents identical auto-queue repetition)
      const sessionExposures = sessionExposureCounts.get(track.id) || 0;
      if (sessionExposures > 0) {
        score -= sessionExposures * 0.45;
      }

      // 2. Play History Frequency Penalty
      const playCount = historyPlayCounts.get(track.id) || 0;
      if (playCount > 0) {
        score -= Math.log2(1 + playCount) * 0.30;
      }

      // 3. Recency Decay Penalty (Played in last 2 hours vs last 24h)
      const lastPlayed = historyLastPlayed.get(track.id);
      if (lastPlayed) {
        const hoursAgo = (now - lastPlayed) / (1000 * 60 * 60);
        if (hoursAgo < 2) score -= 0.80;
        else if (hoursAgo < 24) score -= 0.40;
        else if (hoursAgo < 72) score -= 0.20;
      }

      // 4. Skip penalty
      if (skippedTrackIds.has(track.id)) {
        score -= 0.70;
      }

      return {
        track,
        score: Math.max(0.05, score)
      };
    });

    // Sample 5 tracks using Boltzmann temperature distribution
    const sampledTracks = sampleWithTemperature(
      scoredCandidates,
      SMART_QUEUE_CONFIG.BATCH_TARGET_COUNT,
      SMART_QUEUE_CONFIG.TEMPERATURE,
      SMART_QUEUE_CONFIG.MAX_ARTIST_PER_BATCH
    );

    if (sampledTracks.length === 0) return;

    // Tag all chosen items as auto-queued
    const finalQueueTracks: Track[] = sampledTracks.map((t) => ({
      ...t,
      isAutoQueued: true,
      queuedBy: 'auto',
    }));

    console.log(
      `[SmartQueueEngine] Committing ${finalQueueTracks.length} fresh dynamic auto-queue tracks (tau=${SMART_QUEUE_CONFIG.TEMPERATURE}):`,
      finalQueueTracks.map((t) => `${t.artist} - ${t.title}`)
    );

    // ─── ATOMIC DB TRANSACTION ──────────────────────────────────────────────
    try {
      const tx = db.transaction('tracks', 'readwrite');
      await Promise.all([...finalQueueTracks.map((t) => tx.store.put(t)), tx.done]);
    } catch (dbErr) {
      console.warn('[SmartQueueEngine] DB track put failed silently:', dbErr);
    }

    // ─── FUNCTIONAL STATE UPDATE WITH CLEAN EVICTION ────────────────────────
    deps.store.setState((state) => {
      const activeIdx = state.activeQueueIndex;
      // Head: all played tracks up to and including the current active track
      const head = state.queue.slice(0, activeIdx + 1);
      // Upcoming: keep any manual user-added tracks, evict old auto-queued tracks
      const upcomingManual = state.queue
        .slice(activeIdx + 1)
        .filter((t) => !t.isAutoQueued && t.queuedBy !== 'auto');

      return {
        queue: [...head, ...upcomingManual, ...finalQueueTracks],
      };
    });

    // ─── STREAM PREFETCHING ──────────────────────────────────────────────────
    const upcomingVideoIds = finalQueueTracks
      .map((t) => t.videoId || (t.id.startsWith('yt-') ? t.id.replace('yt-', '') : undefined))
      .filter((v): v is string => !!v)
      .slice(0, 3);

    if (upcomingVideoIds.length > 0) {
      deps.apiClient.ytPrefetch(upcomingVideoIds);
    }
  },
};
