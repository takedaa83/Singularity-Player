import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { ytdlpPool } from './processPool';
import { customSearch, customPlayer, customGetRelated, customGetTranscript } from './customInnertube';

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
    console.log('[youtubeService] Falling back to system-wide "yt-dlp" command from PATH.');
    YT_DLP_PATH = 'yt-dlp';
    return 'yt-dlp';
  }
}

/**
 * Custom InnerTube stream URL extraction using the IOS client.
 */
async function extractUrlWithCustomInnertube(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  try {
    console.log(`[youtubeService] Attempting custom InnerTube player extraction for ${videoId}...`);
    const { basicInfo, audioFormats } = await customPlayer(videoId);
    if (!audioFormats || audioFormats.length === 0) {
      throw new Error('No audio formats returned by custom player');
    }

    // Prioritize audio/mp4 (AAC) over audio/webm (Opus) for universal playback support
    let filteredFormats = audioFormats.filter((f: any) => (f.mimeType || '').includes('audio/mp4'));
    if (filteredFormats.length === 0) {
      filteredFormats = audioFormats;
    }

    // Sort formats by bitrate descending
    const sortedFormats = [...filteredFormats].sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    
    let selectedFormat: any;
    if (quality === 'low') {
      selectedFormat = sortedFormats[sortedFormats.length - 1]; // Lowest bitrate
    } else if (quality === 'medium') {
      selectedFormat = sortedFormats[Math.floor(sortedFormats.length / 2)] || sortedFormats[0];
    } else {
      selectedFormat = sortedFormats[0]; // Highest bitrate
    }

    if (!selectedFormat || !selectedFormat.url) {
      throw new Error('Selected format has no direct URL');
    }

    const mimeType = selectedFormat.mimeType || 'audio/mp4';
    const contentType = mimeType.split(';')[0].trim();
    const filesize = parseInt(selectedFormat.contentLength || selectedFormat.content_length || '0', 10) || 0;

    console.log(`[youtubeService] Custom InnerTube successfully resolved stream for ${videoId}: ${contentType}`);

    return {
      url: selectedFormat.url,
      contentType,
      title: basicInfo.title,
      artist: basicInfo.artist,
      duration: basicInfo.duration,
      filesize
    };
  } catch (err: any) {
    console.warn(`[youtubeService] Custom InnerTube player extraction failed for ${videoId}:`, err.message || err);
    return null;
  }
}

/**
 * Custom InnerTube video info extraction.
 */
async function getVideoInfoWithCustomInnertube(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  try {
    console.log(`[youtubeService] Attempting custom InnerTube video info fetch for ${videoId}...`);
    const { basicInfo } = await customPlayer(videoId);
    return {
      title: basicInfo.title,
      artist: basicInfo.artist,
      album: 'YouTube',
      duration: basicInfo.duration,
      coverArtUrl: basicInfo.coverArtUrl
    };
  } catch (err: any) {
    console.warn(`[youtubeService] Custom InnerTube video info fetch failed for ${videoId}:`, err.message || err);
    return null;
  }
}

/**
 * Search YouTube Music using the custom InnerTube client.
 */
export async function searchYouTube(query: string): Promise<YouTubeTrack[]> {
  try {
    return await customSearch(query);
  } catch (error) {
    console.error('[youtubeService] Search error:', error);
    return [];
  }
}

/**
 * Recommended tracks / radio from custom InnerTube.
 */
export async function getRelatedTracks(videoId: string): Promise<any[]> {
  try {
    return await customGetRelated(videoId);
  } catch (error) {
    console.error('[youtubeService] GetRelatedTracks error:', error);
    return [];
  }
}

/**
 * TIMED transcripts helper.
 */
export async function getYouTubeTranscript(videoId: string): Promise<any> {
  try {
    return await customGetTranscript(videoId);
  } catch (error) {
    console.error('[youtubeService] GetYouTubeTranscript error:', error);
    return null;
  }
}

export async function preWarmClient(): Promise<void> {
  // No-op compatibility export
  console.log('[youtubeService] InnerTube client pre-warm (custom client, instant start)');
}

// ─── Proxy Fallback Implementations ──────────────────────────────────────
const FALLBACK_INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://yt.cdaut.de',
  'https://invidious.privacyredirect.com',
  'https://yewtu.be',
];

const FALLBACK_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.r4fo.com',
  'https://watchapi.whatever.social',
  'https://api.piped.privacydev.net',
];

let invidiousInstances: string[] = [...FALLBACK_INVIDIOUS_INSTANCES];
let pipedInstances: string[] = [...FALLBACK_PIPED_INSTANCES];
let instancesLastFetched = 0;
const INSTANCE_REFRESH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

async function refreshInvidiousInstances(): Promise<void> {
  if (Date.now() - instancesLastFetched < INSTANCE_REFRESH_INTERVAL) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://api.invidious.io/instances.json?sort_by=type,health', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return;
    const data = await response.json() as any[];
    const working: string[] = [];
    for (const [, info] of data) {
      if (
        info?.type === 'https' &&
        info?.uri &&
        info?.monitor?.uptime > 90 &&
        !info?.monitor?.down
      ) {
        working.push(info.uri);
      }
      if (working.length >= 8) break;
    }
    if (working.length > 0) {
      invidiousInstances = working;
      instancesLastFetched = Date.now();
      console.log(`[Proxy] Refreshed Invidious instances: ${working.length} found`);
    }
  } catch (err: any) {
    console.warn(`[Proxy] Failed to refresh Invidious instances: ${err.message || err}`);
  }
}

refreshInvidiousInstances().catch(() => {});

const FALLBACK_COBALT_INSTANCES = [
  'https://rue-cobalt.xenon.zone',
  'https://cobaltapi.kittycat.boo',
  'https://api.cobalt.tools',
];

let cobaltInstances: string[] = [...FALLBACK_COBALT_INSTANCES];
let cobaltInstancesLastFetched = 0;

async function refreshCobaltInstances(): Promise<void> {
  if (Date.now() - cobaltInstancesLastFetched < INSTANCE_REFRESH_INTERVAL) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    console.log('[Proxy] Fetching Cobalt instances list from instances.cobalt.best...');
    const response = await fetch('https://instances.cobalt.best/api/instances.json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return;
    const data = await response.json() as any[];
    const working: string[] = [];
    for (const item of data) {
      if (
        item.url &&
        item.monitoring?.status === 'up' &&
        item.trust >= 80 &&
        item.cors === 1
      ) {
        working.push(item.url.replace(/\/$/, ''));
      }
      if (working.length >= 12) break;
    }
    if (working.length > 0) {
      cobaltInstances = working;
      cobaltInstancesLastFetched = Date.now();
      console.log(`[Proxy] Refreshed Cobalt instances: ${working.length} found`);
    }
  } catch (err: any) {
    console.warn(`[Proxy] Failed to refresh Cobalt instances: ${err.message || err}`);
  }
}

refreshCobaltInstances().catch(() => {});

async function validateMediaUrl(url: string): Promise<boolean> {
  // Skip server-side validation for non-googlevideo URLs (e.g. Cobalt tunnel URLs).
  // These will be redirected directly to the client browser, avoiding datacenter IP Turnstile blocks on Render.
  if (!url.includes('googlevideo.com')) {
    return true;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const testRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (testRes.status === 403 || testRes.status === 401) {
      return false;
    }
    const contentType = testRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}


async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function extractUrlWithInvidious(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  refreshInvidiousInstances().catch(() => {});
  for (const instance of invidiousInstances) {
    try {
      const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats`;
      console.log(`[Invidious] Trying ${instance} for ${videoId}...`);
      const response = await fetchWithTimeout(apiUrl, 12000);
      if (!response.ok) continue;
      const data = await response.json() as any;
      if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) continue;
      let audioStreams = data.adaptiveFormats.filter((s: any) => s.type && s.type.startsWith('audio/') && s.url);
      
      // Prioritize audio/mp4 (AAC) over audio/webm (Opus)
      const mp4Streams = audioStreams.filter((s: any) => s.type.includes('audio/mp4'));
      if (mp4Streams.length > 0) {
        audioStreams = mp4Streams;
      }
      
      audioStreams.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
      if (audioStreams.length === 0) continue;
      let selected = audioStreams[0];
      if (quality === 'low') {
        selected = audioStreams[audioStreams.length - 1];
      } else if (quality === 'medium') {
        selected = audioStreams[Math.floor(audioStreams.length / 2)];
      }
      const contentType = (selected.type || 'audio/mp4').split(';')[0].trim();
      console.log(`[Invidious] Validating stream URL: ${selected.url}`);
      const isValid = await validateMediaUrl(selected.url);
      if (!isValid) {
        console.warn(`[Invidious] Stream URL validation failed for ${selected.url}. Trying next...`);
        continue;
      }
      console.log(`[Invidious] Stream URL validation passed!`);
      return {
        url: selected.url,
        contentType,
        title: data.title || 'Unknown',
        artist: data.author || 'Unknown Artist',
        duration: data.lengthSeconds || 0,
        filesize: parseInt(selected.clen) || 0,
      };
    } catch (err: any) {
      continue;
    }
  }
  return null;
}

async function getVideoInfoWithInvidious(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  for (const instance of invidiousInstances) {
    try {
      const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails`;
      const response = await fetchWithTimeout(apiUrl, 10000);
      if (!response.ok) continue;
      const data = await response.json() as any;
      let coverArtUrl: string | null = null;
      if (data.videoThumbnails && data.videoThumbnails.length > 0) {
        const maxres = data.videoThumbnails.find((t: any) => t.quality === 'maxresdefault' || t.quality === 'maxres');
        coverArtUrl = maxres?.url || data.videoThumbnails[0]?.url || null;
      }
      return {
        title: data.title || 'Unknown',
        artist: data.author || 'Unknown Artist',
        album: 'YouTube',
        duration: data.lengthSeconds || 0,
        coverArtUrl,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function extractUrlWithPiped(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  for (const instance of pipedInstances) {
    try {
      const apiUrl = `${instance}/streams/${videoId}`;
      console.log(`[Piped] Trying ${instance} for ${videoId}...`);
      const response = await fetchWithTimeout(apiUrl, 10000);
      if (!response.ok) continue;
      const data = await response.json() as any;
      if (!data.audioStreams || data.audioStreams.length === 0) continue;
      let streams = data.audioStreams.filter((s: any) => s.url && s.mimeType);
      
      // Prioritize audio/mp4 (AAC) over audio/webm (Opus)
      const mp4Streams = streams.filter((s: any) => s.mimeType.includes('audio/mp4'));
      if (mp4Streams.length > 0) {
        streams = mp4Streams;
      }
      
      streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      if (streams.length === 0) continue;
      let selected = streams[0];
      if (quality === 'low') {
        selected = streams[streams.length - 1];
      } else if (quality === 'medium') {
        selected = streams[Math.floor(streams.length / 2)];
      }
      const contentType = (selected.mimeType || 'audio/mp4').split(';')[0].trim();
      console.log(`[Piped] Validating stream URL: ${selected.url}`);
      const isValid = await validateMediaUrl(selected.url);
      if (!isValid) {
        console.warn(`[Piped] Stream URL validation failed for ${selected.url}. Trying next...`);
        continue;
      }
      console.log(`[Piped] Stream URL validation passed!`);
      return {
        url: selected.url,
        contentType,
        title: data.title || 'Unknown',
        artist: data.uploader || 'Unknown Artist',
        duration: data.duration || 0,
        filesize: selected.contentLength || 0,
      };
    } catch (err: any) {
      continue;
    }
  }
  return null;
}

async function getVideoInfoWithPiped(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  for (const instance of pipedInstances) {
    try {
      const apiUrl = `${instance}/streams/${videoId}`;
      const response = await fetchWithTimeout(apiUrl, 10000);
      if (!response.ok) continue;
      const data = await response.json() as any;
      return {
        title: data.title || 'Unknown',
        artist: data.uploader || 'Unknown Artist',
        album: 'YouTube',
        duration: data.duration || 0,
        coverArtUrl: data.thumbnailUrl || null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function extractUrlWithProxy(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  const invResult = await extractUrlWithInvidious(videoId, quality);
  if (invResult) return invResult;
  return await extractUrlWithPiped(videoId, quality);
}

async function getVideoInfoWithProxy(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  const invResult = await getVideoInfoWithInvidious(videoId);
  if (invResult) return invResult;
  return await getVideoInfoWithPiped(videoId);
}

async function extractUrlWithCobalt(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  refreshCobaltInstances().catch(() => {});
  // Use dynamically resolved list of instances
  for (const backend of cobaltInstances) {
    const formatsToTry: ('mp3' | 'best')[] = ['mp3', 'best'];
    for (const formatToTry of formatsToTry) {
      const payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        downloadMode: 'audio',
        audioFormat: formatToTry,
        audioBitrate: quality === 'low' ? '64' : quality === 'medium' ? '128' : '256'
      };
      try {
        console.log(`[Cobalt] Trying ${backend} for ${videoId} (format: ${formatToTry})...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(backend, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const data = await response.json() as any;
        if (data && data.url) {
          console.log(`[Cobalt] Validating resolved URL from ${backend}: ${data.url}`);
          const isValid = await validateMediaUrl(data.url);
          if (!isValid) {
            console.warn(`[Cobalt] Stream URL from ${backend} failed validation (blocked or Turnstile challenged). Trying next...`);
            continue;
          }
          console.log(`[Cobalt] Stream URL from ${backend} passed validation!`);

          const filename = data.filename || '';
          const cleanFilename = filename.replace(/\.[^/.]+$/, "");
          const parts = cleanFilename.split(' - ');
          const title = parts[0] || 'Unknown';
          const artist = parts[1] || 'Unknown Artist';
          let contentType = 'audio/mp4';
          if (filename.endsWith('.mp3')) contentType = 'audio/mpeg';
          else if (filename.endsWith('.m4a')) contentType = 'audio/mp4';
          else if (filename.endsWith('.webm') || filename.endsWith('.opus')) contentType = 'audio/webm';
          else if (filename.endsWith('.ogg')) contentType = 'audio/ogg';
          return {
            url: data.url,
            contentType,
            title,
            artist,
            duration: 0,
            filesize: 0
          };
        }
      } catch (err: any) {
        console.warn(`[Cobalt] Failed to query ${backend} for ${videoId}:`, err.message || err);
        continue;
      }
    }
  }
  return null;
}

// ─── Pooled yt-dlp Execution Helper ──────────────────────────────────────
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

// ─── Main Audio stream resolver ──────────────────────────────────────────
export async function getAudioStreamUrl(videoId: string, quality: 'high' | 'medium' | 'low' = 'high', bypassCache: boolean = false): Promise<{
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
} | null> {
  const cacheKey = `${videoId}-${quality}`;
  if (!bypassCache) {
    const cached = streamUrlCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      cached.lastAccessed = Date.now();
      return cached.data;
    }
  }

  let pending = pendingExtractions.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      try {
        if (!isValidVideoId(videoId)) {
          console.error(`[youtubeService] Invalid video ID format: ${videoId}`);
          return null;
        }

        // Try extracting via custom InnerTube IOS client context
        const customResult = await extractUrlWithCustomInnertube(videoId, quality);
        if (customResult) {
          streamUrlCache.set(cacheKey, { data: customResult, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
          return customResult;
        }

        // Fallback to Cobalt API
        console.log(`[youtubeService] Custom InnerTube failed, trying Cobalt API for ${videoId}...`);
        const cobaltResult = await extractUrlWithCobalt(videoId, quality);
        if (cobaltResult) {
          streamUrlCache.set(cacheKey, { data: cobaltResult, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
          return cobaltResult;
        }

        // Fallback to Invidious / Piped proxies
        console.log(`[youtubeService] Cobalt failed, trying proxy APIs for ${videoId}...`);
        const proxyResult = await extractUrlWithProxy(videoId, quality);
        if (proxyResult) {
          streamUrlCache.set(cacheKey, { data: proxyResult, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
          return proxyResult;
        }

        // Final fallback: local pooled yt-dlp execution
        console.log(`[youtubeService] All proxy APIs failed, falling back to yt-dlp for ${videoId}`);
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const formatMap: Record<string, string> = {
          high: '140/bestaudio[acodec=aac]/bestaudio[acodec=opus]/bestaudio/251',
          medium: '140/bestaudio[acodec=aac]/bestaudio',
          low: '140/249/250/bestaudio',
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
          throw new Error('No valid URL extracted by yt-dlp');
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

        streamUrlCache.set(cacheKey, { data: result, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });

        // Cache eviction
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
        console.error(`[youtubeService] Stream URL extraction failed for ${videoId}:`, error?.message || error);
        return null;
      } finally {
        pendingExtractions.delete(cacheKey);
      }
    })();
    pendingExtractions.set(cacheKey, pending);
  }

  return pending;
}

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
    '-f', quality === 'low' ? '140/249/250/bestaudio' : quality === 'medium' ? '140/bestaudio[acodec=aac]/bestaudio' : '140/bestaudio[acodec=aac]/bestaudio[acodec=opus]/bestaudio/251',
    '--sponsorblock-remove', 'sponsor,intro,outro,selfpromo,interaction',
    '-o', '-',
    ytUrl
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[yt-dlp stderr] ${msg}`);
  });
  return {
    stream: child.stdout as Readable,
    process: child,
  };
}

export async function getVideoInfo(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  const cached = videoInfoCache.get(videoId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    if (!isValidVideoId(videoId)) {
      console.error(`[youtubeService] Invalid video ID format: ${videoId}`);
      return null;
    }

    // Try custom InnerTube player info fetch
    const customResult = await getVideoInfoWithCustomInnertube(videoId);
    if (customResult) {
      if (videoInfoCache.size >= MAX_CACHE_SIZE) {
        const oldest = videoInfoCache.keys().next().value;
        if (oldest) videoInfoCache.delete(oldest);
      }
      videoInfoCache.set(videoId, { data: customResult, expiry: Date.now() + VIDEO_INFO_CACHE_TTL });
      return customResult;
    }

    // Fallback to proxy APIs
    console.log(`[youtubeService] Custom InnerTube failed, trying proxy APIs for video info ${videoId}...`);
    const proxyResult = await getVideoInfoWithProxy(videoId);
    if (proxyResult) {
      if (videoInfoCache.size >= MAX_CACHE_SIZE) {
        const oldest = videoInfoCache.keys().next().value;
        if (oldest) videoInfoCache.delete(oldest);
      }
      videoInfoCache.set(videoId, { data: proxyResult, expiry: Date.now() + VIDEO_INFO_CACHE_TTL });
      return proxyResult;
    }

    // Fallback to yt-dlp info query
    console.log(`[youtubeService] All proxy APIs failed, falling back to yt-dlp for video info of ${videoId}`);
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
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
    const cleanStr = (val: string | undefined, defaultVal: string = '') => (!val || val === 'NA' ? defaultVal : val);
    const cleanUrl = (val: string | undefined): string | null => (!val || val === 'NA' ? null : val);

    const result = {
      title: cleanStr(title) || 'Unknown',
      artist: cleanStr(artist) || 'Unknown Artist',
      album: cleanStr(album, 'YouTube'),
      duration: parseFloat(durationStr || '') || 0,
      coverArtUrl: cleanUrl(coverArtUrl),
    };

    if (videoInfoCache.size >= MAX_CACHE_SIZE) {
      const oldest = videoInfoCache.keys().next().value;
      if (oldest) videoInfoCache.delete(oldest);
    }
    videoInfoCache.set(videoId, { data: result, expiry: Date.now() + VIDEO_INFO_CACHE_TTL });
    return result;
  } catch (error: any) {
    console.error(`[youtubeService] Video info fetch failed for ${videoId}:`, error?.message || error);
    return null;
  }
}
