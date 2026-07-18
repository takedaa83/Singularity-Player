import { api } from './api';

/**
 * Resolves a YouTube stream URL entirely on the client browser using public Cobalt and Piped instances.
 * This bypasses datacenter IP blocks on cloud-hosted backends (like Render) since the request is made
 * from the user's residential IP, which matches the IP signature of the resolved tunnel URL.
 */
export async function resolveStreamOnClient(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<string | null> {
  let cobaltInstances = [
    'https://api.cobalt.tools',
    'https://rue-cobalt.xenon.zone',
    'https://cobaltapi.kittycat.boo',
    'https://co.wuk.sh'
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
        const dynamicList = data.cobalt.map((u: string) => u.replace(/\/$/, ''));
        cobaltInstances = Array.from(new Set([...dynamicList, ...cobaltInstances]));
        console.log('[Client Stream Resolver] Fetched dynamic Cobalt instances:', dynamicList);
      }
    }
  } catch (err: any) {
    console.warn('[Client Stream Resolver] Failed to fetch dynamic instances from backend:', err?.message || err);
  }

  // Query Cobalt instances in parallel for faster startup
  const cobaltPromises = cobaltInstances.map(async (instance) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout for parallel queries
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
        return data.url;
      }
      throw new Error("No URL returned");
    } catch (err: any) {
      console.warn(`[Client Stream Resolver] Failed via Cobalt (${instance}):`, err?.message || err);
      throw err;
    }
  });

  try {
    const resolvedUrl = await Promise.any(cobaltPromises);
    if (resolvedUrl) return resolvedUrl;
  } catch (raceErr) {
    console.log('[Client Stream Resolver] All Cobalt instances failed. Trying Piped instances in parallel...');
  }

  // Fallback: Try Piped instances in parallel
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.r4fo.com',
    'https://watchapi.whatever.social',
    'https://api.piped.privacydev.net'
  ];

  const pipedPromises = pipedInstances.map(async (instance) => {
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
          return selected.url;
        }
      }
      throw new Error("No streams returned");
    } catch (err: any) {
      console.warn(`[Client Stream Resolver] Failed via Piped (${instance}):`, err?.message || err);
      throw err;
    }
  });

  try {
    const resolvedUrl = await Promise.any(pipedPromises);
    if (resolvedUrl) return resolvedUrl;
  } catch (raceErr) {
    console.log('[Client Stream Resolver] All Piped instances failed.');
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
