import Innertube, { UniversalCache } from 'youtubei.js';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

const execFileAsync = promisify(execFile);

// Strict YouTube video ID validation: exactly 11 alphanumeric / dash / underscore chars
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function isValidVideoId(id: string): boolean {
  return YOUTUBE_ID_REGEX.test(id);
}

export interface YouTubeTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  coverArtUrl: string | null;
  source: 'youtube';
  quality: string;
}

let innertubeClient: Innertube | null = null;

// Cache extracted stream URLs — they're valid for ~30 minutes
const streamUrlCache = new Map<string, { data: any; expiry: number; lastAccessed: number }>();
const STREAM_URL_CACHE_TTL = 25 * 60 * 1000; // 25 minutes

// Coalesce pending stream URL extractions to prevent duplicate yt-dlp runs
const pendingExtractions = new Map<string, Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null>>();

// Cache video info to avoid redundant yt-dlp invocations
const videoInfoCache = new Map<string, { data: any; expiry: number }>();
const VIDEO_INFO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 200;

// Helper to resolve the correct yt-dlp path dynamically
function resolveYtDlpPath(): string {
  const localPath = path.resolve(__dirname, '..', '..', 'yt-dlp.exe');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  // Fallback to system-wide yt-dlp from PATH (useful for Linux/macOS hosting)
  return 'yt-dlp';
}

const YT_DLP_PATH = resolveYtDlpPath();

/**
 * Get or create a singleton Innertube client (for search only).
 */
async function getClient(): Promise<Innertube> {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: false, // Don't need player for search
      cache: new UniversalCache(true, path.join(__dirname, '..', '..', '.cache')),
    });
  }
  return innertubeClient;
}

/**
 * Search YouTube Music for tracks matching the query.
 * Uses youtubei.js InnerTube API (search works fine, only stream deciphering is broken).
 */
export async function searchYouTube(query: string): Promise<YouTubeTrack[]> {
  try {
    const yt = await getClient();
    const results = await yt.music.search(query, { type: 'song' });

    const tracks: YouTubeTrack[] = [];

    if (results.songs && results.songs.contents) {
      for (const item of results.songs.contents) {
        try {
          const videoId = item.id;
          if (!videoId) continue;

          const title = item.title || 'Unknown Title';
          
          let artist = 'Unknown Artist';
          if (item.artists && item.artists.length > 0) {
            artist = item.artists.map((a: any) => a.name).join(', ');
          }

          let album = 'Single';
          if (item.album && item.album.name) {
            album = item.album.name;
          }

          let duration = 0;
          if (item.duration && item.duration.seconds) {
            duration = item.duration.seconds;
          }

          let coverArtUrl: string | null = null;
          if (item.thumbnails && item.thumbnails.length > 0) {
            const sorted = [...item.thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
            coverArtUrl = sorted[0]?.url || null;
          }

          tracks.push({
            videoId,
            title,
            artist,
            album,
            duration,
            coverArtUrl,
            source: 'youtube',
            quality: 'YouTube Audio',
          });
        } catch (e) {
          continue;
        }
      }
    }

    return tracks;
  } catch (error) {
    console.error('[YouTubeService] Search error:', error);
    return [];
  }
}

export async function preWarmClient(): Promise<void> {
  try {
    await getClient();
    console.log('[YouTubeService] InnerTube client pre-warmed successfully');
  } catch (e) {
    console.error('[YouTubeService] Failed to pre-warm client:', e);
  }
}

// ─── yt-dlp Integration ──────────────────────────────────────────────────
// yt-dlp is the gold standard for YouTube extraction. It's constantly
// updated to handle YouTube's anti-bot measures and always works.
// We use it for stream URL extraction and direct audio piping.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extract the direct audio stream URL from YouTube using yt-dlp.
 * Returns the URL, content type, and metadata.
 */
export async function getAudioStreamUrl(videoId: string): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  // Check stream URL cache first
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiry > Date.now()) {
    cached.lastAccessed = Date.now();
    return cached.data;
  }

  // Check if there is an extraction already in progress for this videoId
  let pending = pendingExtractions.get(videoId);
  if (!pending) {
    pending = (async () => {
      try {
        if (!isValidVideoId(videoId)) {
          console.error(`[yt-dlp] Invalid video ID format: ${videoId}`);
          return null;
        }

        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Use optimized yt-dlp flags: print only required fields to avoid huge JSON generation overhead
        const { stdout } = await execFileAsync(YT_DLP_PATH, [
          '--no-warnings',
          '--no-playlist',
          '-f', '140/251/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
          '--no-check-formats',
          '--no-check-certificate',
          '--print', '%(url)s',
          '--print', '%(ext)s',
          '--print', '%(filesize)s',
          '--print', '%(filesize_approx)s',
          '--print', '%(title)s',
          '--print', '%(uploader)s',
          '--print', '%(duration)s',
          '--skip-download',
          ytUrl
        ], { timeout: 20000, maxBuffer: 10 * 1024 * 1024 });

        const lines = stdout.trim().split(/\r?\n/).map(l => l.trim());
        const [url, ext, filesizeStr, filesizeApproxStr, title, artist, durationStr] = lines;

        if (!url || url === 'NA') {
          throw new Error('No valid URL extracted');
        }

        const cleanStr = (val: string | undefined) => (!val || val === 'NA' ? '' : val);
        const parsedFilesize = parseInt(filesizeStr || '', 10);
        const parsedFilesizeApprox = parseInt(filesizeApproxStr || '', 10);
        const filesize = !isNaN(parsedFilesize) ? parsedFilesize : (!isNaN(parsedFilesizeApprox) ? parsedFilesizeApprox : 0);
        const duration = parseFloat(durationStr || '') || 0;

        const result = {
          url,
          contentType: ext === 'm4a' ? 'audio/mp4' : ext === 'webm' ? 'audio/webm' : 'audio/mp4',
          title: cleanStr(title) || 'Unknown',
          artist: cleanStr(artist) || 'Unknown Artist',
          duration,
          filesize,
        };

        // Cache the result
        streamUrlCache.set(videoId, { data: result, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });

        // Prune cache if too large — evict entry with oldest expiry
        if (streamUrlCache.size > MAX_CACHE_SIZE) {
          let oldestKey: string | null = null;
          let oldestExpiry = Infinity;
          for (const [key, val] of streamUrlCache) {
            if (val.expiry < oldestExpiry) {
              oldestExpiry = val.expiry;
              oldestKey = key;
            }
          }
          if (oldestKey) streamUrlCache.delete(oldestKey);
        }

        return result;
      } catch (error: any) {
        console.error(`[yt-dlp] URL extraction failed for ${videoId}:`, {
          message: error?.message || error,
          code: error?.code,
          signal: error?.signal,
          stderr: error?.stderr,
          stdout: error?.stdout?.substring(0, 1000)
        });
        return null;
      } finally {
        pendingExtractions.delete(videoId);
      }
    })();
    pendingExtractions.set(videoId, pending);
  }

  return pending;
}

/**
 * Spawn yt-dlp to pipe audio data directly to stdout (Readable stream).
 * This avoids extracting a URL and fetching it separately.
 * Returns a Readable stream that can be piped to an HTTP response.
 */
export function spawnAudioStream(videoId: string): {
  stream: Readable;
  process: ChildProcess;
} {
  if (!isValidVideoId(videoId)) {
    throw new Error(`Invalid video ID format: ${videoId}`);
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const child = spawn(YT_DLP_PATH, [
    '--no-warnings',
    '--no-playlist',
    '-f', '140/251/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '--sponsorblock-remove', 'sponsor,intro,outro,selfpromo,interaction',
    '-o', '-', // Output to stdout
    ytUrl
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log stderr for debugging
  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[yt-dlp stderr] ${msg}`);
  });

  return {
    stream: child.stdout as Readable,
    process: child,
  };
}

/**
 * Get video metadata using yt-dlp (title, artist, thumbnail, duration).
 */
export async function getVideoInfo(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  // Check cache first
  const cached = videoInfoCache.get(videoId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    if (!isValidVideoId(videoId)) {
      console.error(`[yt-dlp] Invalid video ID format: ${videoId}`);
      return null;
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Print only the necessary fields to skip JSON formatting overhead and check certificate/formats speedups
    const { stdout } = await execFileAsync(YT_DLP_PATH, [
      '--no-warnings',
      '--no-playlist',
      '--no-check-formats',
      '--no-check-certificate',
      '--print', '%(title)s',
      '--print', '%(uploader)s',
      '--print', '%(album)s',
      '--print', '%(duration)s',
      '--print', '%(thumbnail)s',
      '--skip-download',
      ytUrl
    ], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });

    const lines = stdout.trim().split(/\r?\n/).map(l => l.trim());
    const [title, artist, album, durationStr, coverArtUrl] = lines;

    const cleanStr = (val: string | undefined, defaultVal: string = '') => {
      return !val || val === 'NA' ? defaultVal : val;
    };

    const cleanUrl = (val: string | undefined): string | null => {
      return !val || val === 'NA' ? null : val;
    };

    const result = {
      title: cleanStr(title) || 'Unknown',
      artist: cleanStr(artist) || 'Unknown Artist',
      album: cleanStr(album, 'YouTube'),
      duration: parseFloat(durationStr || '') || 0,
      coverArtUrl: cleanUrl(coverArtUrl),
    };

    // Cache the result
    if (videoInfoCache.size >= MAX_CACHE_SIZE) {
      const oldest = videoInfoCache.keys().next().value;
      if (oldest) videoInfoCache.delete(oldest);
    }
    videoInfoCache.set(videoId, { data: result, expiry: Date.now() + VIDEO_INFO_CACHE_TTL });

    return result;
  } catch (error: any) {
    console.error(`[yt-dlp] Video info error for ${videoId}:`, {
      message: error?.message || error,
      code: error?.code,
      signal: error?.signal,
      stderr: error?.stderr,
      stdout: error?.stdout?.substring(0, 1000)
    });
    return null;
  }
}
