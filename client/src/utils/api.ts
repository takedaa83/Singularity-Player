/**
 * Typed API client for communicating with the Singularity Player server.
 * - Uses environment variable for base URL (no hardcoded localhost)
 * - Request deduplication for identical concurrent requests
 * - AbortController integration for cancellable requests
 */

// Tracks whether the custom localStorage URL has been validated this session.
// Once validated (or cleared), we don't re-check until the next page load.
let _customUrlValidated = false;

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('singularity_server_url');

    if (custom && custom.trim()) {
      const trimmed = custom.trim().replace(/\/$/, '');
      return trimmed;
    }

    if (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes(':5173')) {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  return (import.meta.env.VITE_API_URL || 'https://wild-adore-takedaa83-8a8c2611.koyeb.app').replace(/\/$/, '');
}

/**
 * Probes the current base URL's /api/health endpoint once per session.
 * If the stored localStorage URL is unreachable, clears it and falls back
 * to VITE_API_URL so the app self-heals without user intervention.
 */
export async function validateAndRepairBaseUrl(): Promise<void> {
  if (_customUrlValidated) return;
  _customUrlValidated = true;

  const custom = typeof window !== 'undefined' ? localStorage.getItem('singularity_server_url') : null;
  if (!custom || !custom.trim()) return; // nothing custom to validate

  const trimmed = custom.trim().replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${trimmed}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return; // healthy, keep using it
  } catch {
    // unreachable — fall through to clear
  }

  console.warn(`[API] Custom server URL unreachable, clearing: ${trimmed}`);
  localStorage.removeItem('singularity_server_url');
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('singularity_server_url', url.trim().replace(/\/$/, ''));
    } else {
      localStorage.removeItem('singularity_server_url');
    }
  }
}

// In-flight request deduplication
const pendingRequests = new Map<string, Promise<any>>();

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;
  const isGet = !options?.method || options.method === 'GET';
  const cacheKey = `${options?.method || 'GET'}:${fullUrl}`;

  const callerSignal = options?.signal;
  const sharedFetchOptions = { ...options };
  delete sharedFetchOptions.signal;

  let sharedPromise: Promise<T>;

  if (isGet && pendingRequests.has(cacheKey)) {
    sharedPromise = pendingRequests.get(cacheKey)!;
  } else {
    sharedPromise = (async () => {
      try {
        const res = await fetch(fullUrl, {
          ...sharedFetchOptions,
          headers: {
            'Content-Type': 'application/json',
            ...sharedFetchOptions?.headers,
          },
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: res.statusText }));
          throw new ApiError(res.status, errorBody.error || res.statusText, errorBody);
        }

        return (await res.json()) as T;
      } finally {
        if (isGet) {
          pendingRequests.delete(cacheKey);
        }
      }
    })();

    if (isGet) {
      pendingRequests.set(cacheKey, sharedPromise);
    }
  }

  // Safely race caller's AbortSignal against shared request without cancelling shared fetch for other callers
  if (callerSignal) {
    if (callerSignal.aborted) {
      return Promise.reject(callerSignal.reason || new Error('Request aborted'));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        callerSignal.removeEventListener('abort', onAbort);
        reject(callerSignal.reason || new Error('Request aborted'));
      };
      callerSignal.addEventListener('abort', onAbort);
      sharedPromise
        .then((res) => {
          callerSignal.removeEventListener('abort', onAbort);
          resolve(res);
        })
        .catch((err) => {
          callerSignal.removeEventListener('abort', onAbort);
          reject(err);
        });
    });
  }

  return sharedPromise;
}

export class ApiError extends Error {
  public status: number;
  public body?: any;

  constructor(
    status: number,
    message: string,
    body?: any
  ) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'ApiError';
  }
}

// ─── API Methods ──────────────────────────────────────────────────────

export const api = {
  /** Base URL for constructing stream/download URLs */
  get baseUrl(): string {
    return getApiBaseUrl();
  },

  /** Search tracks across all sources */
  search(query: string, signal?: AbortSignal) {
    return fetchJSON<any[]>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  },

  /** Get search autocomplete suggestions */
  suggestions(query: string, signal?: AbortSignal) {
    return fetchJSON<string[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal });
  },

  /** Get similar artists */
  similarArtists(name: string, limit = 3, signal?: AbortSignal) {
    return fetchJSON<{ artists: string[] }>(`/api/search/similar-artists?name=${encodeURIComponent(name)}&limit=${limit}`, { signal });
  },

  /** Get lyrics for a track */
  lyrics(track: string, artist: string, album?: string, duration?: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ track, artist });
    if (album) params.set('album', album);
    if (duration) params.set('duration', duration.toString());
    return fetchJSON<{ syncedLyrics: string | null; plainLyrics: string | null }>(
      `/api/lyrics?${params.toString()}`,
      { signal }
    );
  },

  /** Get YouTube video info/metadata */
  ytInfo(videoId: string, signal?: AbortSignal) {
    return fetchJSON<{ title: string; artist: string; album: string; duration: number; coverArtUrl: string }>(
      `/api/yt/info/${videoId}`,
      { signal }
    );
  },

  /** Get YouTube radio recommendations (related tracks) */
  ytRadio(videoId?: string, title?: string, artist?: string, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (videoId) params.set('videoId', videoId);
    if (title) params.set('title', title);
    if (artist) params.set('artist', artist);
    return fetchJSON<any[]>(`/api/yt/radio?${params.toString()}`, { signal });
  },

  /** Get the streaming URL (constructs a proxy URL, does not fetch) */
  streamUrl(videoId: string): string {
    return `${getApiBaseUrl()}/api/yt/stream/${videoId}`;
  },

  /** Get the download URL (constructs a URL, does not fetch) */
  downloadUrl(videoId: string, name?: string): string {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    return `${getApiBaseUrl()}/api/yt/download/${videoId}${params}`;
  },

  /** Local file stream URL */
  localStreamUrl(filename: string): string {
    return `${getApiBaseUrl()}/api/stream/${filename}`;
  },

  /** Health check */
  health(signal?: AbortSignal) {
    return fetchJSON<{ status: string; message: string }>('/api/health', { signal });
  },

  /** Upload tracks (multipart form data) */
  async upload(formData: FormData, signal?: AbortSignal) {
    const res = await fetch(`${getApiBaseUrl()}/api/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!res.ok) throw new ApiError(res.status, 'Upload failed');
    return res.json();
  },

  /** Batch download (returns ZIP stream URL) */
  batchDownloadUrl(): string {
    return `${getApiBaseUrl()}/api/download/batch`;
  },

  /** Server cover art URL */
  coverUrl(path: string | null | undefined, videoId?: string): string | null {
    let resolvedUrl: string | null = null;
    if (!path) {
      if (videoId) {
        resolvedUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      } else {
        return null;
      }
    } else if (path.startsWith('//')) {
      resolvedUrl = `https:${path}`;
    } else if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) {
      resolvedUrl = path;
    } else {
      resolvedUrl = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
    }

    if (resolvedUrl) {
      // 1. Upgrade Google usercontent/ggpht image sizing parameters to ultra-high-resolution (1200x1200 px)
      if (resolvedUrl.includes('googleusercontent.com') || resolvedUrl.includes('ggpht.com')) {
        if (resolvedUrl.includes('=')) {
          resolvedUrl = resolvedUrl.replace(/=[ws]\d+[^&]*/, '=w1200-h1200-l90-rj');
          if (!resolvedUrl.includes('=w1200-h1200-l90-rj')) {
            resolvedUrl = resolvedUrl.replace(/=[^&]*$/, '=w1200-h1200-l90-rj');
          }
        } else {
          resolvedUrl = `${resolvedUrl}=w1200-h1200-l90-rj`;
        }
      }
      
      // 2. Upgrade YouTube standard thumbnail to maxresdefault for clean rendering
      if (resolvedUrl.includes('ytimg.com/vi/')) {
        resolvedUrl = resolvedUrl.replace(/\/(default|mqdefault|hqdefault)\.jpg/, '/maxresdefault.jpg');
      }
    }

    return resolvedUrl;
  },

  /** Generic POST helper */
  post<T = any>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
    return fetchJSON<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  },

  /** Push library sync data to server */
  async pushSync(data: any): Promise<{ success: boolean; syncedAt: number }> {
    return this.post('/api/sync/push', data);
  },

  /** Pull library sync data from server */
  async pullSync(): Promise<any> {
    return fetchJSON<any>('/api/sync/pull');
  },

  /** Retrieve library sync status from server */
  async getSyncStatus(): Promise<{ exists: boolean; syncedAt?: number; sizeBytes?: number; trackCount?: number; playlistCount?: number }> {
    return fetchJSON<any>('/api/sync/status');
  },
};
