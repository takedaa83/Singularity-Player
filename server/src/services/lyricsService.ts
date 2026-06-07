// Lyrics service using LRCLIB.net — free, open, no-auth lyrics API

export interface LyricsResult {
  syncedLyrics: string | null;  // LRC format with timestamps
  plainLyrics: string | null;   // Plain text lyrics
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
}

class LyricsCache {
  private cache = new Map<string, { data: LyricsResult | null; expiry: number }>();
  private TTL = 60 * 60 * 1000; // 1 hour
  private MAX_SIZE = 500;

  private makeKey(track: string, artist: string): string {
    return `${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
  }

  get(track: string, artist: string): LyricsResult | null | undefined {
    const key = this.makeKey(track, artist);
    const entry = this.cache.get(key);
    if (!entry) return undefined; // cache miss
    if (entry.expiry < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data; // may be null ("no lyrics found" is cached too)
  }

  set(track: string, artist: string, data: LyricsResult | null): void {
    if (this.cache.size >= this.MAX_SIZE) {
      // Evict oldest
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    const key = this.makeKey(track, artist);
    this.cache.set(key, { data, expiry: Date.now() + this.TTL });
  }
}

const lyricsCache = new LyricsCache();

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LyricsResult | null> {
  // Check cache first
  const cached = lyricsCache.get(trackName, artistName);
  if (cached !== undefined) return cached;

  try {
    // Strategy 1: Exact match with full metadata
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName && albumName !== 'Single' && albumName !== 'YouTube') {
      params.set('album_name', albumName);
    }
    if (duration && duration > 0) {
      params.set('duration', Math.round(duration).toString());
    }

    let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
      },
    });

    if (res.ok) {
      const data = await res.json() as any;
      const result: LyricsResult = {
        syncedLyrics: data.syncedLyrics || null,
        plainLyrics: data.plainLyrics || null,
        trackName: data.trackName || trackName,
        artistName: data.artistName || artistName,
        albumName: data.albumName || albumName || '',
        duration: data.duration || duration || 0,
      };
      lyricsCache.set(trackName, artistName, result);
      return result;
    }

    // Strategy 2: Search fallback
    const searchRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`,
      {
        headers: {
          'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
        },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json() as any[];
      if (searchData && searchData.length > 0) {
        const best = searchData[0];
        const result: LyricsResult = {
          syncedLyrics: best.syncedLyrics || null,
          plainLyrics: best.plainLyrics || null,
          trackName: best.trackName || trackName,
          artistName: best.artistName || artistName,
          albumName: best.albumName || albumName || '',
          duration: best.duration || duration || 0,
        };
        lyricsCache.set(trackName, artistName, result);
        return result;
      }
    }

    // No lyrics found — cache the miss too
    lyricsCache.set(trackName, artistName, null);
    return null;
  } catch (error) {
    console.error('[LyricsService] Error fetching lyrics:', error);
    return null;
  }
}
