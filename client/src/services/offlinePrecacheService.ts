/**
 * Offline Auto-Pre-Cache Service Worker Manager
 * Pre-fetches upcoming queued audio streams when connected to Wi-Fi
 * into CacheStorage for uninterrupted offline playback.
 */

import { Track } from '../types';

const CACHE_NAME = 'singularity-audio-precache-v1';

export async function precacheUpcomingQueue(queue: Track[], activeIndex: number) {
  if (!('caches' in window)) return;
  if (!navigator.onLine) return;

  const upcoming = queue.slice(activeIndex + 1, activeIndex + 6);
  if (upcoming.length === 0) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    for (const track of upcoming) {
      if (track.streamUrl) {
        const match = await cache.match(track.streamUrl);
        if (!match) {
          console.log(`[OfflinePrecache] Pre-caching audio stream: ${track.title}`);
          fetch(track.streamUrl).then((res) => {
            if (res.ok) cache.put(track.streamUrl, res);
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[OfflinePrecache] Pre-cache error:', err);
  }
}
