/**
 * Typed API client for communicating with the Singularity Player server.
 * - Uses environment variable for base URL (no hardcoded localhost)
 * - Request deduplication for identical concurrent requests
 * - AbortController integration for cancellable requests
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// In-flight request deduplication
const pendingRequests = new Map<string, Promise<any>>();

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const cacheKey = `${options?.method || 'GET'}:${fullUrl}`;

  // Deduplicate identical concurrent requests (GET only)
  if (!options?.method || options.method === 'GET') {
    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const promise = (async () => {
    try {
      const res = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, errorBody.error || res.statusText, errorBody);
      }

      return await res.json() as T;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  if (!options?.method || options.method === 'GET') {
    pendingRequests.set(cacheKey, promise);
  }

  return promise;
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
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ─── API Methods ──────────────────────────────────────────────────────

export const api = {
  /** Base URL for constructing stream/download URLs */
  baseUrl: API_BASE,

  /** Search tracks across all sources */
  search(query: string, signal?: AbortSignal) {
    return fetchJSON<any[]>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  },

  /** Get search autocomplete suggestions */
  suggestions(query: string, signal?: AbortSignal) {
    return fetchJSON<string[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal });
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
    return `${API_BASE}/api/yt/stream/${videoId}`;
  },

  /** Get the download URL (constructs a URL, does not fetch) */
  downloadUrl(videoId: string, name?: string): string {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    return `${API_BASE}/api/yt/download/${videoId}${params}`;
  },

  /** Local file stream URL */
  localStreamUrl(filename: string): string {
    return `${API_BASE}/api/stream/${filename}`;
  },

  /** Health check */
  health(signal?: AbortSignal) {
    return fetchJSON<{ status: string; message: string }>('/api/health', { signal });
  },

  /** Upload tracks (multipart form data) */
  async upload(formData: FormData, signal?: AbortSignal) {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!res.ok) throw new ApiError(res.status, 'Upload failed');
    return res.json();
  },

  /** Batch download (returns ZIP stream URL) */
  batchDownloadUrl(): string {
    return `${API_BASE}/api/download/batch`;
  },

  /** Server cover art URL */
  coverUrl(path: string | null | undefined, videoId?: string): string | null {
    if (!path) {
      if (videoId) {
        return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
      return null;
    }
    if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
    if (path.startsWith('//')) return `https:${path}`;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  },

  /** Generic POST helper */
  post<T = any>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
    return fetchJSON<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  },
};
