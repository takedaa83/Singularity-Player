import { api } from './api';

/**
 * Fast client-side validation of a stream or tunnel URL using a 2-byte ranged fetch.
 * Returns true if the URL is reachable and streams media; false if blocked or returning text errors.
 */
async function validateClientMediaUrl(url: string, timeoutMs: number = 3000): Promise<boolean> {
  let res: Response | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(`validation timeout after ${timeoutMs}ms`), timeoutMs);
    // Simple HEAD request without custom headers (like Range) so browser does not trigger an OPTIONS CORS preflight check
    res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok || res.status === 206 || res.status === 302 || res.status === 304) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        console.warn(`[Client Stream Resolver] Validation failed (invalid content-type ${contentType}) for URL: ${url.substring(0, 80)}...`);
        return false;
      }
      return true;
    }
  } catch {
    // If HEAD is blocked by CDN CORS policy, try a simple GET without custom headers
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 206) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) return false;
        return true;
      }
    } catch (err: any) {
      console.warn(`[Client Stream Resolver] Validation request failed for URL: ${url.substring(0, 80)}... Error:`, err?.message || err);
      return false;
    }
  } finally {
    if (res?.body && !res.bodyUsed) {
      res.body.cancel().catch(() => {});
    }
  }
  return false;
}

/**
 * Wires an externally-supplied "race" AbortSignal together with a per-request timeout, so a
 * candidate stops fetching either when it times out OR when a faster candidate already won.
 */
function withTimeoutAndRaceSignal(raceSignal: AbortSignal, timeoutMs: number, label: string) {
  const controller = new AbortController();
  const onRaceAbort = () => controller.abort(raceSignal.reason ?? `${label}: superseded`);
  if (raceSignal.aborted) {
    onRaceAbort();
  } else {
    raceSignal.addEventListener('abort', onRaceAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(`${label} timed out after ${timeoutMs}ms`), timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
    raceSignal.removeEventListener('abort', onRaceAbort);
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Concurrency-capped parallel racing function. Runs up to `concurrencyLimit` tasks in parallel.
 * Resolves with the FIRST non-null result. Once a winner is found, every other in-flight
 * candidate's AbortSignal is aborted — losers stop immediately instead of running to
 * completion in the background (which used to waste bandwidth/battery on every load).
 */
async function raceFirstSuccessful<T>(
  taskFactories: ((signal: AbortSignal) => Promise<T | null>)[],
  concurrencyLimit: number
): Promise<T | null> {
  if (taskFactories.length === 0) return null;

  const controllers = taskFactories.map(() => new AbortController());
  const tasks = taskFactories.map((factory, i) => () => factory(controllers[i].signal));

  return new Promise<T | null>((resolve) => {
    let resolved = false;
    let nextIndex = 0;
    let completedCount = 0;

    const settle = (result: T | null, winnerIndex?: number) => {
      if (resolved) return;
      resolved = true;
      controllers.forEach((c, i) => {
        if (i !== winnerIndex) c.abort('a faster candidate already resolved');
      });
      resolve(result);
    };

    const runNext = async () => {
      if (resolved || nextIndex >= tasks.length) return;

      const currentIndex = nextIndex++;

      try {
        const result = await tasks[currentIndex]();
        if (result !== null) {
          settle(result, currentIndex);
          return;
        }
      } catch {
        // Ignore and continue racing
      } finally {
        completedCount++;
        if (!resolved) {
          if (completedCount === tasks.length) {
            settle(null);
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
    const timeout = setTimeout(() => controller.abort('instance list fetch timeout'), 4000);
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
  const cobaltTasks = cobaltInstances.map((instance) => async (raceSignal: AbortSignal) => {
    const { signal, cleanup } = withTimeoutAndRaceSignal(raceSignal, 8000, `Cobalt (${instance})`);
    try {
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
        signal
      });
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
    } finally {
      cleanup();
    }
  });

  const rawResolvedUrl = await raceFirstSuccessful(cobaltTasks, 3);
  if (rawResolvedUrl) {
    // Return same-origin backend relay proxy URL instead of raw third-party URL
    const backendRelayUrl = `${api.baseUrl}/api/yt/proxy?url=${encodeURIComponent(rawResolvedUrl)}&videoId=${videoId}`;
    return backendRelayUrl;
  }

  console.log('[Client Stream Resolver] All Cobalt instances failed. Trying Piped instances in parallel...');

  let pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.tokhmi.xyz'
  ];

  if (excludedUrls && excludedUrls.length > 0) {
    pipedInstances = pipedInstances.filter(inst => !excludedUrls.some(exc => inst.includes(exc)));
  }

  const pipedTasks = pipedInstances.map((instance) => async (raceSignal: AbortSignal) => {
    const { signal, cleanup } = withTimeoutAndRaceSignal(raceSignal, 4000, `Piped (${instance})`);
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, { signal });
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
    } finally {
      cleanup();
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

const PIPED_DURATION_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.tokhmi.xyz'
];

const INVIDIOUS_DURATION_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.drgns.space',
  'https://yewtu.be',
  'https://invidious.projectsegfau.lt'
];

/**
 * Fetches the duration of a video directly from public Invidious or Piped instances on the client side.
 * This bypasses the blocked cloud backend server.
 */
export async function fetchDurationOnClient(videoId: string): Promise<number | null> {
  // Try Piped instances first
  const pipedPromises = PIPED_DURATION_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(`Piped duration lookup timed out (${instance})`), 4000);
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && typeof data.duration === 'number' && data.duration > 0) {
        console.log(`[Duration Resolver] Resolved duration via Piped (${instance}):`, data.duration);
        return data.duration;
      }
      throw new Error("No duration in response");
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    const resolvedDuration = await Promise.any(pipedPromises);
    if (resolvedDuration) return resolvedDuration;
  } catch (err) {
    console.warn('[Duration Resolver] Failed to fetch duration via Piped. Trying Invidious...');
  }

  // Fallback to Invidious instances
  const invidiousPromises = INVIDIOUS_DURATION_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(`Invidious duration lookup timed out (${instance})`), 4000);
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=lengthSeconds`, {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json() as any;
      if (data && typeof data.lengthSeconds === 'number' && data.lengthSeconds > 0) {
        console.log(`[Duration Resolver] Resolved duration via Invidious (${instance}):`, data.lengthSeconds);
        return data.lengthSeconds;
      }
      throw new Error("No duration in response");
    } finally {
      clearTimeout(timeout);
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
