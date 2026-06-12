import Innertube, { UniversalCache } from 'youtubei.js';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { ytdlpPool } from './processPool';
import { JSDOM, VirtualConsole } from 'jsdom';

const execFileAsync = promisify(execFile);


/**
 * Executes yt-dlp through the process pool to restrict concurrency
 * and prevent unbounded child processes.
 */
function runYtDlpPooled(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise(async (resolve, reject) => {
    let poolHandle;
    try {
      poolHandle = await ytdlpPool.acquire();
    } catch (err) {
      return reject(err);
    }

    let finished = false;
    const release = () => {
      if (!finished) {
        finished = true;
        poolHandle.release();
      }
    };

    const child = execFile(YT_DLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      release();
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        resolve({ stdout, stderr });
      }
    });

    poolHandle.registerProcess(child);

    if (timeoutMs > 0) {
      const timeout = setTimeout(() => {
        if (!finished && child.exitCode === null) {
          child.kill('SIGKILL');
          reject(new Error('Process timed out'));
        }
      }, timeoutMs);

      child.on('exit', () => clearTimeout(timeout));
    }
  });
}

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
let isPoTokenAvailable = false;

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

export let YT_DLP_PATH = resolveYtDlpPath();

export async function ensureYtDlpBinary(): Promise<string> {
  const binDir = path.resolve(__dirname, '..', '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const filename = isWindows ? 'yt-dlp.exe' : (isMac ? 'yt-dlp_macos' : 'yt-dlp');
  const localPath = path.join(binDir, filename);

  if (fs.existsSync(localPath)) {
    YT_DLP_PATH = localPath;
    return localPath;
  }

  console.log(`[youtubeService] yt-dlp binary not found. Downloading for ${process.platform}...`);
  const downloadUrl = isWindows
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : (isMac
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(localPath, buffer);
    
    if (!isWindows) {
      // Set executable permission on Unix-like systems
      fs.chmodSync(localPath, 0o755);
    }
    console.log(`[youtubeService] yt-dlp binary downloaded successfully to ${localPath}`);
    YT_DLP_PATH = localPath;
    return localPath;
  } catch (error) {
    console.error('[youtubeService] Failed to download yt-dlp:', error);
    // Fallback to system-wide command
    console.log('[youtubeService] Falling back to system-wide "yt-dlp" command from PATH.');
    YT_DLP_PATH = 'yt-dlp';
    return 'yt-dlp';
  }
}

/**
 * Safely generates a YouTube Proof of Origin (poToken) and visitorData using JSDOM.
 * Has a strict timeout and checks validity to prevent the server from hanging on startup.
 */
async function generatePoTokenSafe(): Promise<{ poToken: string; visitorData: string } | null> {
  try {
    console.log('[PO Token] Starting safe PO token generation...');
    
    // Resolve absolute path to the package directory
    const pkgPath = path.dirname(require.resolve('youtube-po-token-generator/package.json'));
    
    // Dynamically require functions/consts from the library
    const { fetchVisitorData } = require(path.join(pkgPath, 'lib', 'workflow'));
    const { url, userAgent } = require(path.join(pkgPath, 'lib', 'consts'));
    
    const visitorData = await fetchVisitorData();
    console.log(`[PO Token] Fetched visitor data: ${visitorData}`);
    
    const domContent = await fs.promises.readFile(path.join(pkgPath, 'vendor', 'index.html'), 'utf-8');
    const baseContent = await fs.promises.readFile(path.join(pkgPath, 'vendor', 'base.js'), 'utf-8');
    const baseAppendContent = await fs.promises.readFile(path.join(pkgPath, 'lib', 'inject.js'), 'utf-8');
    
    // Run JSDOM evaluation with a timeout
    const result = await new Promise<{ poToken: string } | null>((resolve, reject) => {
      let windowClosed = false;
      
      const virtualConsole = new VirtualConsole();
      // Suppress JSDOM log noise by default
      
      const { window } = new JSDOM(domContent, {
        url,
        pretendToBeVisual: true,
        runScripts: 'dangerously',
        virtualConsole,
      });
      
      const cleanUp = () => {
        if (!windowClosed) {
          windowClosed = true;
          window.close();
        }
      };
      
      // Safety timeout: 15 seconds max
      const timeout = setTimeout(() => {
        cleanUp();
        reject(new Error('JSDOM token generation timed out after 15s'));
      }, 15000);
      
      Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, writable: false });
      (window as any).visitorData = visitorData;
      (window as any).onPoToken = (poToken: string) => {
        clearTimeout(timeout);
        cleanUp();
        resolve({ poToken });
      };
      
      try {
        window.eval(baseContent.replace(/}\s*\)\(_yt_player\);\s*$/, (matched) => `;${baseAppendContent};${matched}`));
      } catch (err: any) {
        clearTimeout(timeout);
        cleanUp();
        reject(new Error(`Failed to evaluate base player script: ${err.message}`));
      }
    });
    
    if (result && result.poToken) {
      const isError = result.poToken.includes('Error') || result.poToken.includes('Invalid') || result.poToken.length > 200;
      if (isError) {
        console.warn(`[PO Token] Warning: Generated token is an error/invalid format (length ${result.poToken.length}): ${result.poToken.substring(0, 100)}...`);
        // Try decoding it to print a helpful error message if it's base64 encoded
        try {
          const decoded = Buffer.from(result.poToken, 'base64').toString('utf-8');
          console.warn(`[PO Token] Decoded error message: ${decoded.substring(0, 500)}`);
        } catch (e) {}
        return null;
      }
      console.log(`[PO Token] Success! Generated valid PO token of length ${result.poToken.length}`);
      return { poToken: result.poToken, visitorData };
    }
    
    return null;
  } catch (err: any) {
    console.error(`[PO Token] Safe PO token generation failed: ${err.message || err}`);
    return null;
  }
}

/**
 * Get or create a singleton Innertube client.
 */
export async function getClient(): Promise<Innertube> {
  if (!innertubeClient) {
    const options: any = {
      retrieve_player: true, // Crucial for deciphering signature cipher URLs!
      cache: new UniversalCache(true, path.join(__dirname, '..', '..', '.cache')),
    };

    const tokenResult = await generatePoTokenSafe();
    if (tokenResult) {
      options.po_token = tokenResult.poToken;
      options.visitor_data = tokenResult.visitorData;
      isPoTokenAvailable = true;
      console.log('[YouTubeService] Innertube initialized with Proof of Origin (poToken).');
    } else {
      console.warn('[YouTubeService] Proceeding without poToken. Streaming might be blocked on VPS IPs.');
    }

    innertubeClient = await Innertube.create(options);
  }
  return innertubeClient;
}

/**
 * Extract streaming URL using youtubei.js
 */
async function extractUrlWithInnertube(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  try {
    const yt = await getClient();
    const client = isPoTokenAvailable ? 'WEB' : 'IOS';
    console.log(`[Innertube] Fetching full info (${client} client) for ${videoId}...`);
    const info = await yt.getInfo(videoId, { client: client as any });
    
    const format = info.chooseFormat({
      type: 'audio',
      quality: quality === 'low' ? 'low' : 'best'
    });
    
    if (!format) {
      throw new Error('No audio format found in Innertube');
    }
    
    console.log(`[Innertube] Deciphering signature for ${videoId}...`);
    const url = await format.decipher(yt.session.player);
    if (!url) {
      throw new Error('Innertube decipher failed to return a URL');
    }

    const title = info.basic_info.title || 'Unknown';
    const artist = info.basic_info.author || 'Unknown Artist';
    const duration = info.basic_info.duration || 0;
    const filesize = format.content_length || 0;
    const mimeType = format.mime_type || 'audio/mp4';
    const contentType = mimeType.split(';')[0].trim();

    console.log(`[Innertube] Successfully extracted stream URL for ${videoId}: ${contentType}`);
    
    return {
      url,
      contentType,
      title,
      artist,
      duration,
      filesize,
    };
  } catch (err: any) {
    console.error(`[Innertube] Failed to extract stream for ${videoId}:`, err?.message || err);
    return null;
  }
}

/**
 * Extract video metadata using youtubei.js
 */
async function getVideoInfoWithInnertube(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  try {
    const yt = await getClient();
    const client = isPoTokenAvailable ? 'WEB' : 'IOS';
    console.log(`[Innertube] Fetching video info (${client} client) for ${videoId}...`);
    const info = await yt.getInfo(videoId, { client: client as any });
    
    const title = info.basic_info.title || 'Unknown';
    const artist = info.basic_info.author || 'Unknown Artist';
    const duration = info.basic_info.duration || 0;
    
    let coverArtUrl: string | null = null;
    if (info.basic_info.thumbnail && info.basic_info.thumbnail.length > 0) {
      const sorted = [...info.basic_info.thumbnail].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
      coverArtUrl = sorted[0]?.url || null;
    }
    
    return {
      title,
      artist,
      album: 'YouTube',
      duration,
      coverArtUrl,
    };
  } catch (err: any) {
    console.error(`[Innertube] Failed to get video info for ${videoId}:`, err?.message || err);
    return null;
  }
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
export async function getAudioStreamUrl(videoId: string, quality: 'high' | 'medium' | 'low' = 'high', bypassCache: boolean = false): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  const cacheKey = `${videoId}-${quality}`;
  // Check stream URL cache first (skip if bypassCache is true)
  if (!bypassCache) {
    const cached = streamUrlCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      cached.lastAccessed = Date.now();
      return cached.data;
    }
  }

  // Check if there is an extraction already in progress for this videoId
  let pending = pendingExtractions.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      try {
        if (!isValidVideoId(videoId)) {
          console.error(`[yt-dlp] Invalid video ID format: ${videoId}`);
          return null;
        }

        // Try extracting via Innertube (youtubei.js) first to bypass VPS blocks
        console.log(`[YouTubeService] Attempting Innertube stream extraction for ${videoId}...`);
        const innertubeResult = await extractUrlWithInnertube(videoId, quality);
        if (innertubeResult) {
          // Cache the result
          streamUrlCache.set(cacheKey, { data: innertubeResult, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
          return innertubeResult;
        }

        console.log(`[YouTubeService] Innertube failed or bypassed, falling back to yt-dlp for ${videoId}`);

        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Use optimized yt-dlp flags: print only required fields to avoid huge JSON generation overhead
        // Format priority: best available audio (highest bitrate), then
        // specific known-good IDs as fallbacks.  'bestaudio' alone lets
        // yt-dlp pick the highest bitrate stream YouTube offers — which
        // can be Opus @ 256 kbps when available.
        // Quality-aware format selectors
        const formatMap: Record<string, string> = {
          high: 'bestaudio[acodec=opus]/bestaudio[acodec=aac]/bestaudio/251/140',
          medium: '140/bestaudio[acodec=aac]/bestaudio',
          low: '249/250/bestaudio/140',
        };
        const formatSelector = formatMap[quality] || formatMap.high;

        const { stdout } = await runYtDlpPooled([
          '--no-warnings',
          '--no-playlist',
          '-f', formatSelector,
          '--no-check-formats',
          '--no-check-certificate',
          '--print', '%(url)s',
          '--print', '%(ext)s',
          '--print', '%(filesize)s',
          '--print', '%(filesize_approx)s',
          '--print', '%(title)s',
          '--print', '%(uploader)s',
          '--print', '%(duration)s',
          '--print', '%(abr)s',
          '--skip-download',
          ytUrl
        ], 20000);

        const lines = stdout.trim().split(/\r?\n/).map(l => l.trim());
        const [url, ext, filesizeStr, filesizeApproxStr, title, artist, durationStr, abrStr] = lines;

        if (!url || url === 'NA') {
          throw new Error('No valid URL extracted');
        }

        const cleanStr = (val: string | undefined) => (!val || val === 'NA' ? '' : val);
        const parsedFilesize = parseInt(filesizeStr || '', 10);
        const parsedFilesizeApprox = parseInt(filesizeApproxStr || '', 10);
        const filesize = !isNaN(parsedFilesize) ? parsedFilesize : (!isNaN(parsedFilesizeApprox) ? parsedFilesizeApprox : 0);
        const duration = parseFloat(durationStr || '') || 0;
        const abr = parseFloat(abrStr || '') || 0;
        if (abr > 0) {
          console.log(`[yt-dlp] Selected audio: ${ext} @ ${abr}kbps for ${videoId}`);
        }

        const result = {
          url,
          contentType: ext === 'm4a' ? 'audio/mp4' : ext === 'webm' ? 'audio/webm' : 'audio/mp4',
          title: cleanStr(title) || 'Unknown',
          artist: cleanStr(artist) || 'Unknown Artist',
          duration,
          filesize,
        };

        // Cache the result
        streamUrlCache.set(cacheKey, { data: result, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });

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
        pendingExtractions.delete(cacheKey);
      }
    })();
    pendingExtractions.set(cacheKey, pending);
  }

  return pending;
}

/**
 * Spawn yt-dlp to pipe audio data directly to stdout (Readable stream).
 * This avoids extracting a URL and fetching it separately.
 * Returns a Readable stream that can be piped to an HTTP response.
 */
export function spawnAudioStream(videoId: string, quality: 'high' | 'medium' | 'low' = 'high'): {
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
    '-f', quality === 'low' ? '249/250/bestaudio/140' : quality === 'medium' ? '140/bestaudio[acodec=aac]/bestaudio' : 'bestaudio[acodec=opus]/bestaudio[acodec=aac]/bestaudio/251/140',
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

    // Try extracting via Innertube (youtubei.js) first to bypass VPS blocks
    console.log(`[YouTubeService] Attempting Innertube video info fetch for ${videoId}...`);
    const innertubeResult = await getVideoInfoWithInnertube(videoId);
    if (innertubeResult) {
      // Cache the result
      if (videoInfoCache.size >= MAX_CACHE_SIZE) {
        const oldest = videoInfoCache.keys().next().value;
        if (oldest) videoInfoCache.delete(oldest);
      }
      videoInfoCache.set(videoId, { data: innertubeResult, expiry: Date.now() + VIDEO_INFO_CACHE_TTL });
      return innertubeResult;
    }

    console.log(`[YouTubeService] Innertube video info fetch failed, falling back to yt-dlp for ${videoId}`);

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Print only the necessary fields to skip JSON formatting overhead and check certificate/formats speedups
    const { stdout } = await runYtDlpPooled([
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
    ], 15000);

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
