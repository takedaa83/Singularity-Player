// Aggregated search service pulling from YouTube, Deezer, and iTunes.

import { searchYouTube } from './youtubeService';

export interface ExternalTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
  previewUrl: string | null;
  streamUrl: string | null;
  source: 'youtube' | 'deezer' | 'itunes';
  quality: string;
  bitrate: number | null;
  videoId?: string;
}

export class SearchService {
  private static cache = new Map<string, { data: ExternalTrack[]; expiry: number }>();
  private static CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  private static CACHE_MAX_SIZE = 200; // Maximum cached queries

  public static clearSearchCache(): void {
    this.cache.clear();
    this.suggestionsCache.clear();
  }

  private static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Prune expired cache entries and evict oldest if over the size limit.
   */
  private static pruneCache(): void {
    const now = Date.now();

    // 1. Remove all expired entries
    for (const [key, value] of this.cache) {
      if (value.expiry <= now) {
        this.cache.delete(key);
      }
    }

    // 2. If still over limit, evict oldest entries by expiry
    if (this.cache.size > this.CACHE_MAX_SIZE) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].expiry - b[1].expiry);
      
      const toRemove = this.cache.size - this.CACHE_MAX_SIZE;
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  private static queryCounts = new Map<string, number>([
    ['pop', 12],
    ['rock', 10],
    ['electronic', 8],
    ['lo-fi', 7],
    ['ed sheeran', 6],
    ['chill', 5],
    ['workout', 4],
    ['taylor swift', 3],
  ]);

  public static getTrendingSearches(): string[] {
    return Array.from(this.queryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([query]) => query)
      .slice(0, 8);
  }

  /**
   * Main search method pulling from YouTube, Deezer, and iTunes in parallel.
   * YouTube results are placed first since they have full playback capability.
   */
  public static async search(query: string): Promise<ExternalTrack[]> {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      const lower = trimmed.toLowerCase();
      this.queryCounts.set(lower, (this.queryCounts.get(lower) || 0) + 1);
    }

    const cacheKey = this.normalizeString(query);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const settled = await Promise.allSettled([
        this.fetchYouTube(query),
        this.fetchDeezer(query),
        this.fetchITunes(query)
      ]);

      const youtubeResults = settled[0].status === 'fulfilled' ? settled[0].value : [];
      const deezerResults = settled[1].status === 'fulfilled' ? settled[1].value : [];
      const itunesResults = settled[2].status === 'fulfilled' ? settled[2].value : [];

      const aggregated = this.mergeAndDeduplicate(youtubeResults, deezerResults, itunesResults);

      this.pruneCache();

      this.cache.set(cacheKey, {
        data: aggregated,
        expiry: Date.now() + this.CACHE_TTL
      });

      return aggregated;
    } catch (error) {
      console.error('Error executing aggregated search:', error);
      return [];
    }
  }

  private static suggestionsCache = new Map<string, { data: string[]; expiry: number }>();
  private static SUGGESTIONS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  private static MAX_SUGGESTIONS_CACHE = 200;

  /**
   * Search autocompletion suggestions
   */
  public static async getSuggestions(query: string): Promise<string[]> {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = this.normalizeString(query);
    const cached = this.suggestionsCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const json = await res.json() as any;
      if (json && Array.isArray(json.data)) {
        const suggestions = new Set<string>();
        for (const item of json.data) {
          suggestions.add(item.title);
          if (suggestions.size >= 5) break;
        }
        const result = Array.from(suggestions);
        // Bound cache size
        if (this.suggestionsCache.size >= this.MAX_SUGGESTIONS_CACHE) {
          const oldest = this.suggestionsCache.keys().next().value;
          if (oldest) this.suggestionsCache.delete(oldest);
        }
        this.suggestionsCache.set(cacheKey, {
          data: result,
          expiry: Date.now() + this.SUGGESTIONS_CACHE_TTL
        });
        return result;
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Error fetching suggestions:', e);
      }
    }
    return [];
  }

  /**
   * Fetch from YouTube Music via youtubei.js
   */
  private static async fetchYouTube(query: string): Promise<ExternalTrack[]> {
    try {
      const results = await searchYouTube(query);
      return results.map(item => ({
        id: `yt-${item.videoId}`,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        coverArtUrl: item.coverArtUrl,
        previewUrl: null,
        streamUrl: `/api/yt/stream/${item.videoId}`,
        source: 'youtube' as const,
        quality: 'YouTube Audio (Full)',
        bitrate: null,
        videoId: item.videoId,
      }));
    } catch (e) {
      console.error('YouTube search error:', e);
      return [];
    }
  }

  private static async fetchDeezer(query: string): Promise<ExternalTrack[]> {
    try {
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json() as any;
      if (!json || !Array.isArray(json.data)) return [];

      return json.data.map((item: any) => ({
        id: `deezer-${item.id}`,
        title: item.title,
        artist: item.artist.name,
        album: item.album.title,
        duration: item.duration,
        coverArtUrl: item.album.cover_medium || item.album.cover_big || null,
        previewUrl: item.preview || null,
        streamUrl: item.preview || null,
        source: 'deezer' as const,
        quality: '128kbps MP3 (30s Preview)',
        bitrate: 128
      }));
    } catch (e) {
      console.error('Deezer search error:', e);
      return [];
    }
  }

  private static async fetchITunes(query: string): Promise<ExternalTrack[]> {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=15`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json() as any;
      if (!json || !Array.isArray(json.results)) return [];

      return json.results.map((item: any) => {
        let artwork = item.artworkUrl100 || null;
        if (artwork) {
          artwork = artwork.replace('100x100bb.jpg', '500x500bb.jpg');
        }

        return {
          id: `itunes-${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || 'Single',
          duration: Math.round(item.trackTimeMillis / 1000),
          coverArtUrl: artwork,
          previewUrl: item.previewUrl || null,
          streamUrl: item.previewUrl || null,
          source: 'itunes' as const,
          quality: 'AAC 256kbps (30s Preview)',
          bitrate: 256
        };
      });
    } catch (e) {
      console.error('iTunes search error:', e);
      return [];
    }
  }

  private static mergeAndDeduplicate(
    youtube: ExternalTrack[],
    deezer: ExternalTrack[],
    itunes: ExternalTrack[]
  ): ExternalTrack[] {
    // YouTube results first (prioritized), then Deezer, then iTunes
    const list = [...youtube, ...deezer, ...itunes];
    const seen = new Map<string, number>(); // key -> index in results
    const results: ExternalTrack[] = [];

    for (const track of list) {
      const normTitle = this.normalizeString(track.title);
      const normArtist = this.normalizeString(track.artist);
      const key = `${normTitle}_${normArtist}`;

      const existingIdx = seen.get(key);
      if (existingIdx === undefined) {
        seen.set(key, results.length);
        results.push(track);
      } else {
        // Favor YouTube (full playback) over preview-only sources
        if (track.source === 'youtube' && results[existingIdx].source !== 'youtube') {
          results[existingIdx] = track;
        }
      }
    }

    return results;
  }
}
