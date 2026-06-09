import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

export interface LyricsResult {
  syncedLyrics: string | null;  // LRC format with timestamps
  plainLyrics: string | null;   // Plain text lyrics
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
}

const LYRICS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'lyrics');

function ensureLyricsDir() {
  if (!fs.existsSync(LYRICS_DIR)) {
    fs.mkdirSync(LYRICS_DIR, { recursive: true });
  }
}

function getLyricsFileHash(track: string, artist: string): string {
  return crypto
    .createHash('md5')
    .update(`${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`)
    .digest('hex');
}

async function getLyricsFromDisk(track: string, artist: string): Promise<LyricsResult | null | undefined> {
  try {
    ensureLyricsDir();
    const hash = getLyricsFileHash(track, artist);
    const filePath = path.join(LYRICS_DIR, `${hash}.json`);
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as LyricsResult | null;
    }
  } catch (e) {
    console.error('[LyricsService] Error reading lyrics from disk:', e);
  }
  return undefined; // cache miss
}

async function saveLyricsToDisk(track: string, artist: string, data: LyricsResult | null): Promise<void> {
  try {
    ensureLyricsDir();
    const hash = getLyricsFileHash(track, artist);
    const filePath = path.join(LYRICS_DIR, `${hash}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LyricsService] Error writing lyrics to disk:', e);
  }
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

async function fetchNetEaseLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    console.log(`[LyricsService] Attempting NetEase fallback search for: ${artistName} - ${trackName}`);
    const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(`${artistName} ${trackName}`)}&type=1&limit=5`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json() as any;
    const songId = searchJson?.result?.songs?.[0]?.id;

    if (!songId) {
      console.log(`[LyricsService] NetEase fallback search: no tracks found`);
      return null;
    }

    const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
    const lyricRes = await fetch(lyricUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!lyricRes.ok) return null;
    const lyricJson = await lyricRes.json() as any;

    const syncedLyrics = lyricJson?.lrc?.lyric || null;
    const plainLyrics = lyricJson?.klyric?.lyric || null;

    if (!syncedLyrics && !plainLyrics) return null;

    // Clean up empty synced lyrics
    if (syncedLyrics && syncedLyrics.trim() === '') {
      return null;
    }

    const result: LyricsResult = {
      syncedLyrics,
      plainLyrics,
      trackName,
      artistName,
      albumName: searchJson?.result?.songs?.[0]?.album?.name || '',
      duration: Math.round((searchJson?.result?.songs?.[0]?.duration || 0) / 1000),
    };

    console.log(`[LyricsService] NetEase fallback lyrics retrieved successfully for: ${artistName} - ${trackName}`);
    return result;
  } catch (error) {
    console.error('[LyricsService] NetEase fallback search failed:', error);
    return null;
  }
}

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LyricsResult | null> {
  // 1. Check in-memory cache
  const cached = lyricsCache.get(trackName, artistName);
  if (cached !== undefined) return cached;

  // 2. Check permanent disk cache
  const diskCached = await getLyricsFromDisk(trackName, artistName);
  if (diskCached !== undefined) {
    // Sync into in-memory cache
    lyricsCache.set(trackName, artistName, diskCached);
    return diskCached;
  }

  // 3. Fallback Chain: LRCLIB -> NetEase
  try {
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

    console.log(`[LyricsService] Querying LRCLIB API for: ${artistName} - ${trackName}`);
    
    // Call with a 4s timeout to avoid getting stuck if LRCLIB hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    
    let res;
    try {
      res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: {
          'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
        },
        signal: controller.signal
      });
    } catch (e) {
      console.warn('[LyricsService] LRCLIB get timed out or failed, falling back...');
    } finally {
      clearTimeout(timeout);
    }

    if (res && res.ok) {
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
      await saveLyricsToDisk(trackName, artistName, result);
      return result;
    }

    // Try LRCLIB search fallback
    console.log(`[LyricsService] Querying LRCLIB Search Fallback for: ${artistName} - ${trackName}`);
    const searchController = new AbortController();
    const searchTimeout = setTimeout(() => searchController.abort(), 4000);
    
    let searchRes;
    try {
      searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`,
        {
          headers: {
            'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
          },
          signal: searchController.signal
        }
      );
    } catch (e) {
      console.warn('[LyricsService] LRCLIB search timed out or failed, falling back...');
    } finally {
      clearTimeout(searchTimeout);
    }

    if (searchRes && searchRes.ok) {
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
        await saveLyricsToDisk(trackName, artistName, result);
        return result;
      }
    }

    // 4. NetEase fallback
    const neteaseResult = await fetchNetEaseLyrics(trackName, artistName);
    if (neteaseResult) {
      lyricsCache.set(trackName, artistName, neteaseResult);
      await saveLyricsToDisk(trackName, artistName, neteaseResult);
      return neteaseResult;
    }

    // No lyrics found — cache the miss on disk and memory
    lyricsCache.set(trackName, artistName, null);
    await saveLyricsToDisk(trackName, artistName, null);
    return null;
  } catch (error) {
    console.error('[LyricsService] Error in fetchLyrics chain:', error);
    return null;
  }
}

export async function saveLyrics(track: string, artist: string, data: LyricsResult): Promise<void> {
  lyricsCache.set(track, artist, data);
  await saveLyricsToDisk(track, artist, data);
}
