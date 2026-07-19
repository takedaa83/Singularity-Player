import { api } from './api';

/**
 * Fast client-side validation of a stream or tunnel URL using a 2-byte ranged fetch.
 * Returns true if the URL is reachable and streams media; false if blocked or returning text errors.
 */
async function validateClientMediaUrl(url: string, timeoutMs: number = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok && res.status !== 206) {
      console.warn(`[Client Stream Resolver] Validation failed for URL: ${url.substring(0, 80)}... Status: ${res.status}`);
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      console.warn(`[Client Stream Resolver] Validation failed (invalid content-type ${contentType}) for URL: ${url.substring(0, 80)}...`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Client Stream Resolver] Validation request failed for URL: ${url.substring(0, 80)}... Error:`, err?.message || err);
    return false;
  }
}

/**
 * Resolves a YouTube stream URL entirely on the client browser using public Cobalt and Piped instances.
 * This bypasses datacenter IP blocks on cloud-hosted backends (like Render) since the request is made
 * from the user's residential IP, which matches the IP signature of the resolved tunnel URL.
 */
export async function resolveStreamOnClient(
  videoId: string,
  quality: 'high' | 'medium' | 'low',
  excludedUrls: string[] = []
): Promise<string | null> {
  let cobaltInstances = [
    'https://rue-cobalt.xenon.zone',
    'https://cobaltapi.kittycat.boo'
  ];

  // Try to fetch dynamic instances from backend
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${api.baseUrl}/api/yt/instances`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as any;
      if (data && Array.isArray(data.cobalt) && data.cobalt.length > 0) {
        const dynamicList = data.cobalt
          .map((u: string) => u.replace(/\/$/, ''))
          .filter((u: string) => !u.includes('co.wuk.sh') && !u.includes('api.cobalt.tools'));
        cobaltInstances = Array.from(new Set([...dynamicList, ...cobaltInstances]));
        console.log('[Client Stream Resolver] Fetched dynamic Cobalt instances:', dynamicList);
      }
    }
  } catch (err: any) {
    console.warn('[Client Stream Resolver] Failed to fetch dynamic instances from backend:', err?.message || err);
  }

  // Filter excluded instances
  if (excludedUrls && excludedUrls.length > 0) {
    cobaltInstances = cobaltInstances.filter(inst => !excludedUrls.some(exc => inst.includes(exc)));
  }

  // Define Cobalt Tasks
  const cobaltTasks = cobaltInstances.map((instance) => async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout for Cobalt tunnels
      const res = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          alwaysProxy: true
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && data.url) {
        console.log(`[Client Stream Resolver] Resolved via Cobalt (${instance}):`, data.url);
        const isValid = await validateClientMediaUrl(data.url);
        if (isValid) {
          return data.url;
        }
        throw new Error("Resolved Cobalt URL failed content-type or availability validation");
      }
      throw new Error("No URL returned");
    } catch (err: any) {
      console.warn(`[Client Stream Resolver] Failed via Cobalt (${instance}):`, err?.message || err);
      return null;
    }
  });

  const rawResolvedUrl = await raceFirstSuccessful(cobaltTasks, 3);
  if (rawResolvedUrl) {
    // Return same-origin backend relay proxy URL instead of raw third-party URL
    const backendRelayUrl = `${api.baseUrl}/api/yt/proxy?url=${encodeURIComponent(rawResolvedUrl)}&videoId=${videoId}`;
    return backendRelayUrl;
  }

  console.log('[Client Stream Resolver] All Cobalt instances failed. Trying Piped instances in parallel...');

  // Fallback: Try Piped instances in parallel
  let pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.r4fo.com',
    'https://watchapi.whatever.social',
    'https://api.piped.privacydev.net'
  ];

  if (excludedUrls && excludedUrls.length > 0) {
    pipedInstances = pipedInstances.filter(inst => !excludedUrls.some(exc => inst.includes(exc)));
  }

  const pipedTasks = pipedInstances.map((instance) => async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && data.audioStreams && data.audioStreams.length > 0) {
        let streams = data.audioStreams.filter((s: any) => s.url);
        streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        let selected = streams[0];
        if (quality === 'low') {
          selected = streams[streams.length - 1];
        } else if (quality === 'medium') {
          selected = streams[Math.floor(streams.length / 2)];
        }
        if (selected && selected.url) {
          console.log(`[Client Stream Resolver] Resolved via Piped (${instance}):`, selected.url);
          const isValid = await validateClientMediaUrl(selected.url);
          if (isValid) {
            return selected.url;
          }
          throw new Error("Resolved Piped URL failed content-type or availability validation");
        }
      }
      throw new Error("No streams returned");
    } catch (err: any) {
      console.warn(`[Client Stream Resolver] Failed via Piped (${instance}):`, err?.message || err);
      return null;
    }
  });

  const rawPipedUrl = await raceFirstSuccessful(pipedTasks, 3);
  if (rawPipedUrl) {
    const backendRelayUrl = `${api.baseUrl}/api/yt/proxy?url=${encodeURIComponent(rawPipedUrl)}&videoId=${videoId}`;
    return backendRelayUrl;
  }

  return null;
}

export function isBackendCloudHosted(): boolean {
  const url = api.baseUrl.toLowerCase();
  return !url.includes('localhost') && 
         !url.includes('127.0.0.1') && 
         !url.includes('192.168.');
}

/**
 * Fetches the duration of a video directly from public Invidious or Piped instances on the client side.
 * This bypasses the blocked cloud backend server.
 */
export async function fetchDurationOnClient(videoId: string): Promise<number | null> {
  // Try Piped instances first
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.r4fo.com',
    'https://watchapi.whatever.social',
    'https://api.piped.privacydev.net'
  ];

  const pipedPromises = pipedInstances.map(async (instance) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && typeof data.duration === 'number' && data.duration > 0) {
        console.log(`[Duration Resolver] Resolved duration via Piped (${instance}):`, data.duration);
        return data.duration;
      }
      throw new Error("No duration in response");
    } catch (err: any) {
      throw err;
    }
  });

  try {
    const resolvedDuration = await Promise.any(pipedPromises);
    if (resolvedDuration) return resolvedDuration;
  } catch (err) {
    console.warn('[Duration Resolver] Failed to fetch duration via Piped. Trying Invidious...');
  }

  // Fallback to Invidious instances
  const invidiousInstances = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
    'https://yewtu.be'
  ];

  const invidiousPromises = invidiousInstances.map(async (instance) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=lengthSeconds`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && typeof data.lengthSeconds === 'number' && data.lengthSeconds > 0) {
        console.log(`[Duration Resolver] Resolved duration via Invidious (${instance}):`, data.lengthSeconds);
        return data.lengthSeconds;
      }
      throw new Error("No duration in response");
    } catch (err: any) {
      throw err;
    }
  });

  try {
    const resolvedDuration = await Promise.any(invidiousPromises);
    if (resolvedDuration) return resolvedDuration;
  } catch (err) {
    console.error('[Duration Resolver] Failed to fetch duration from all client-side sources.');
  }

  return null;
}

/**
 * Concurrency-capped parallel racing function. Runs up to `concurrencyLimit` tasks in parallel.
 * Resolves with the FIRST non-null result. If all tasks finish and none return a non-null value,
 * resolves with null.
 */
async function raceFirstSuccessful<T>(
  tasks: (() => Promise<T | null>)[],
  concurrencyLimit: number
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let resolved = false;
    let activeCount = 0;
    let nextIndex = 0;
    let completedCount = 0;

    if (tasks.length === 0) {
      resolve(null);
      return;
    }

    const runNext = async () => {
      if (resolved) return;

      if (nextIndex >= tasks.length) {
        if (activeCount === 0 && !resolved) {
          resolved = true;
          resolve(null);
        }
        return;
      }

      const currentIndex = nextIndex++;
      activeCount++;

      try {
        const result = await tasks[currentIndex]();
        if (result !== null && !resolved) {
          resolved = true;
          resolve(result);
          return;
        }
      } catch (err) {
        // Ignore and continue racing
      } finally {
        activeCount--;
        completedCount++;
        
        if (!resolved) {
          if (completedCount === tasks.length) {
            resolved = true;
            resolve(null);
          } else {
            runNext();
          }
        }
      }
    };

    const initialBatch = Math.min(concurrencyLimit, tasks.length);
    for (let i = 0; i < initialBatch; i++) {
      runNext();
    }
  });
}
