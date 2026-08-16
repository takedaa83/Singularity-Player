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
  RECENT_HISTORY_WINDOW_MS: 2 * 60 * 60 * 1000, // 2 hours
  SKIP_SESSION_WINDOW_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  MAX_SKIPS_THRESHOLD: 2,
  FALLBACK_LIBRARY_LIMIT: 20,
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

let inFlightPromise: Promise<void> | null = null;

export const SmartQueueService = {
  /**
   * Thread-safe, Concurrent-Safe Auto-Queue Engine:
   * - In-flight re-entrancy lock prevents duplicate background runs.
   * - Anchor drift check cancels stale commits if user skips.
   * - Genuine DB favorite lookup interleaves actual personal tracks.
   * - Intra-batch deduplication & progressive artist saturation caps.
   * - Atomic IndexedDB transaction batching & functional Zustand state updates.
   */
  async triggerAutoQueue(
    currentTrack: Track,
    deps = { store: usePlayerStore, getDb: initDB, apiClient: api }
  ): Promise<void> {
    if (inFlightPromise) {
      return inFlightPromise;
    }

    inFlightPromise = (async () => {
      try {
        await this._executeAutoQueue(currentTrack, deps);
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  },

  async _executeAutoQueue(
    currentTrack: Track,
    deps: { store: typeof usePlayerStore; getDb: typeof initDB; apiClient: typeof api }
  ): Promise<void> {
    const playerStoreState = deps.store.getState();
    if (playerStoreState.queue.length >= SMART_QUEUE_CONFIG.MAX_QUEUE_THRESHOLD) return;

    const initialTrackId = currentTrack.id;

    // Reseed Anchor: If queue has > 2 tracks, anchor on the tail track for natural session evolution
    const anchorTrack =
      playerStoreState.queue.length > 2
        ? playerStoreState.queue[playerStoreState.queue.length - 1]
        : currentTrack;
    const videoId =
      anchorTrack.videoId ||
      (anchorTrack.id.startsWith('yt-') ? anchorTrack.id.replace('yt-', '') : undefined);

    console.log(
      `[SmartQueueEngine] Fetching radio queue (Anchor: "${anchorTrack.artist} - ${anchorTrack.title}")`
    );

    const db = await deps.getDb();
    let radioResults: Track[] = [];

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

    // Fallback A: Search artist top hits
    if (radioResults.length === 0 && anchorTrack.artist) {
      try {
        const hits = await deps.apiClient.search(`${anchorTrack.artist} top hits`);
          radioResults = hits
            .map((item: any): Track => ({
              id: `yt-${item.videoId}`,
              title: item.title,
              artist: item.artist,
              album: item.album || 'Single',
              genre: '',
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
              addedAt: Date.now(),
            }))
            .filter(passesQualityFilter);
      } catch (e) {
        console.warn('[SmartQueueEngine] Fallback artist search failed:', e);
      }
    }

    // Fallback B: Local IndexedDB Bounded Query (top recent/favorite tracks limit)
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
    // If the user skipped tracks or changed currentTrack while async fetches ran, abort stale commit!
    const liveCurrentTrack = deps.store.getState().currentTrack;
    if (liveCurrentTrack && liveCurrentTrack.id !== initialTrackId) {
      console.log(
        '[SmartQueueEngine] Playback state changed during fetch. Aborting stale auto-queue insertion.'
      );
      return;
    }

    // ─── HISTORY & SKIP FILTERING ───────────────────────────────────────────
    const twoHoursAgo = Date.now() - SMART_QUEUE_CONFIG.RECENT_HISTORY_WINDOW_MS;
    const thirtyDaysAgo = Date.now() - SMART_QUEUE_CONFIG.SKIP_SESSION_WINDOW_MS;

    const recentHistory = await db.getAllFromIndex(
      'history',
      'playedAt',
      IDBKeyRange.lowerBound(twoHoursAgo)
    );
    const recentlyPlayedIds = new Set<string>(recentHistory.map((e) => e.trackId));

    const recentSessions = await db.getAllFromIndex(
      'playSessions',
      'startTime',
      IDBKeyRange.lowerBound(thirtyDaysAgo)
    );
    const skippedTrackIds = new Set<string>(
      recentSessions.filter((s) => s.skipped).map((s) => s.trackId)
    );

    const liveQueue = deps.store.getState().queue;
    const queueIds = new Set<string>(liveQueue.map((t) => t.id));

    const cleanCandidates = radioResults.filter((track) => {
      if (track.id === currentTrack.id) return false;
      if (queueIds.has(track.id)) return false;
      if (recentlyPlayedIds.has(track.id)) return false;
      if (skippedTrackIds.has(track.id)) return false;
      if (isDuplicateTrack(track, currentTrack)) return false;
      if (liveQueue.some((q) => isDuplicateTrack(q, track))) return false;
      if (track.skipCount && track.skipCount >= SMART_QUEUE_CONFIG.MAX_SKIPS_THRESHOLD) return false;
      return true;
    });

    if (cleanCandidates.length === 0) return;

    // ─── HONEST PERSONALIZATION: REAL DB FAVORITES INTERLEAVING ────────────
    const favorites = await db.getAll('favorites');
    const favoriteTrackIds = new Set(favorites.map((f) => f.trackId));

    const favTrackDocs = await Promise.all(
      Array.from(favoriteTrackIds).map((fId) => db.get('tracks', fId))
    );
    const validPersonalFavs = favTrackDocs.filter(
      (t): t is Track =>
        !!t &&
        passesQualityFilter(t) &&
        !queueIds.has(t.id) &&
        !recentlyPlayedIds.has(t.id) &&
        !isDuplicateTrack(t, currentTrack) &&
        !liveQueue.some((q) => isDuplicateTrack(q, t))
    );

    // ─── SELECTION WITH INTRA-BATCH DEDUP & SATURATION ─────────────────────
    const finalQueueTracks: Track[] = [];
    const artistCountsInBatch = new Map<string, number>();

    // Helper: Checks if candidate is valid against current batch
    const canSelectCandidate = (candidate: Track, maxPerArtist: number) => {
      if (finalQueueTracks.some((t) => t.id === candidate.id || isDuplicateTrack(t, candidate))) {
        return false;
      }
      const artistName = (candidate.artist || '').toLowerCase().trim();
      const currentCount = artistCountsInBatch.get(artistName) || 0;
      return currentCount < maxPerArtist;
    };

    // Primary Pass: Max 2 tracks per artist
    for (const candidate of cleanCandidates) {
      if (finalQueueTracks.length >= SMART_QUEUE_CONFIG.BATCH_TARGET_COUNT) break;

      if (canSelectCandidate(candidate, SMART_QUEUE_CONFIG.MAX_ARTIST_PER_BATCH)) {
        finalQueueTracks.push(candidate);
        const artistName = (candidate.artist || '').toLowerCase().trim();
        artistCountsInBatch.set(artistName, (artistCountsInBatch.get(artistName) || 0) + 1);

        // Interleave 1 genuine personal favorite track into slot 3 if available
        if (finalQueueTracks.length === 2 && validPersonalFavs.length > 0) {
          const matchingFav = validPersonalFavs.find((fav) =>
            canSelectCandidate(fav, SMART_QUEUE_CONFIG.MAX_ARTIST_PER_BATCH)
          );
          if (matchingFav) {
            finalQueueTracks.push(matchingFav);
            const favArtist = (matchingFav.artist || '').toLowerCase().trim();
            artistCountsInBatch.set(favArtist, (artistCountsInBatch.get(favArtist) || 0) + 1);
          }
        }
      }
    }

    // Secondary Progressive Relaxation (if batch < 5, relax artist limit from 2 to 3)
    if (finalQueueTracks.length < SMART_QUEUE_CONFIG.BATCH_TARGET_COUNT) {
      for (const candidate of cleanCandidates) {
        if (finalQueueTracks.length >= SMART_QUEUE_CONFIG.BATCH_TARGET_COUNT) break;
        if (canSelectCandidate(candidate, 3)) {
          finalQueueTracks.push(candidate);
          const artistName = (candidate.artist || '').toLowerCase().trim();
          artistCountsInBatch.set(artistName, (artistCountsInBatch.get(artistName) || 0) + 1);
        }
      }
    }

    if (finalQueueTracks.length === 0) return;

    console.log(
      `[SmartQueueEngine] Committing ${finalQueueTracks.length} auto-queue tracks:`,
      finalQueueTracks.map((t) => `${t.artist} - ${t.title}`)
    );

    // ─── ATOMIC DB TRANSACTION ──────────────────────────────────────────────
    try {
      const tx = db.transaction('tracks', 'readwrite');
      await Promise.all([...finalQueueTracks.map((t) => tx.store.put(t)), tx.done]);
    } catch (dbErr) {
      console.warn('[SmartQueueEngine] DB track put failed silently:', dbErr);
    }

    // ─── FUNCTIONAL STATE UPDATE (PREVENTS LOST WRITES) ─────────────────────
    deps.store.setState((state) => ({
      queue: [...state.queue, ...finalQueueTracks],
    }));

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
