import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { ytdlpPool } from './processPool';
import { customSearch, customPlayer, customGetRelated, customGetTranscript } from './customInnertube';
import { getCookieFilePath, getCookieHeader } from './youtubeAuth';

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

export interface StreamResult {
  url: string;
  contentType: string;
  title: string;
  artist: string;
  duration: number;
  filesize: number;
}

export function selectByQuality<T>(sorted: T[], quality: 'high' | 'medium' | 'low'): T {
  if (quality === 'low') return sorted[sorted.length - 1];
  if (quality === 'medium') return sorted[Math.floor(sorted.length / 2)] || sorted[0];
  return sorted[0];
}

export function extToMime(ext: string): string {
  const clean = ext.toLowerCase().trim().replace(/^\./, '');
  if (clean === 'mp3') return 'audio/mpeg';
  if (clean === 'm4a') return 'audio/mp4';
  if (clean === 'webm' || clean === 'opus') return 'audio/webm';
  if (clean === 'ogg') return 'audio/ogg';
  return 'audio/mp4';
}

export function getYtDlpFormatSelector(quality: 'high' | 'medium' | 'low'): string {
  const formatMap: Record<string, string> = {
    high: 'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/best',
    medium: '140/bestaudio[acodec=aac]/bestaudio',
    low: '249/250/bestaudio',
  };
  return formatMap[quality] || formatMap.high;
}

/**
 * Concurrency-capped parallel racing function. Runs up to `concurrencyLimit` tasks in parallel.
 * Resolves with the FIRST non-null result. If all tasks finish and none return a non-null value,
 * resolves with null.
 */
export async function raceFirstSuccessful<T>(
  tasks: (() => Promise<T | null>)[],
  concurrencyLimit: number
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let resolved = false;
    let activeCount = 0;
    let nextIndex = 0;
    let completedCount = 0;

    if (tasks.length === 0) {
      resolve(null);
      return;
    }

    const runNext = async () => {
      if (resolved) return;

      if (nextIndex >= tasks.length) {
        if (activeCount === 0 && !resolved) {
          resolved = true;
          resolve(null);
        }
        return;
      }

      const currentIndex = nextIndex++;
      activeCount++;

      try {
        const result = await tasks[currentIndex]();
        if (result !== null && !resolved) {
          resolved = true;
          resolve(result);
          return;
        }
      } catch (err) {
        // Ignore error and continue racing other instances
      } finally {
        activeCount--;
        completedCount++;
        
        if (!resolved) {
          if (completedCount === tasks.length) {
            resolved = true;
            resolve(null);
          } else {
            runNext();
          }
        }
      }
    };

    // Start initial batch of tasks
    const initialBatch = Math.min(concurrencyLimit, tasks.length);
    for (let i = 0; i < initialBatch; i++) {
      runNext();
    }
  });
}

/**
 * Cheap reachability probe that checks if a proxy is online and can reach YouTube APIs.
 */
export async function probeInstance(url: string, endpoint: string = '', timeoutMs: number = 2500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const targetUrl = `${url.replace(/\/$/, '')}${endpoint}`;
    const res = await fetch(targetUrl, {
      method: endpoint === '' ? 'GET' : 'HEAD', // GET for root, HEAD for API endpoints
      signal: controller.signal
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}


// Cache extracted stream URLs — they're valid for ~30 minutes
const streamUrlCache = new Map<string, { data: StreamResult; expiry: number; lastAccessed: number }>();
const STREAM_URL_CACHE_TTL = 25 * 60 * 1000; // 25 minutes

// Coalesce pending stream URL extractions to prevent duplicate yt-dlp runs
const pendingExtractions = new Map<string, Promise<StreamResult | null>>();

// Cache video info to avoid redundant yt-dlp invocations
const videoInfoCache = new Map<string, { data: any; expiry: number; lastAccessed: number }>();
const VIDEO_INFO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 200;

function resolveYtDlpPath(): string {
  const localPath = path.resolve(__dirname, '..', '..', 'yt-dlp.exe');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  const termuxPath = '/data/data/com.termux/files/usr/bin/yt-dlp';
  if (fs.existsSync(termuxPath)) {
    return termuxPath;
  }
  return 'yt-dlp';
}

export let YT_DLP_PATH = resolveYtDlpPath();
export let ytDlpReady: Promise<string>;

export async function ensureYtDlpBinary(): Promise<string> {
  const termuxPath = '/data/data/com.termux/files/usr/bin/yt-dlp';
  if (fs.existsSync(termuxPath)) {
    console.log(`[youtubeService] Using native Termux yt-dlp binary at ${termuxPath}`);
    YT_DLP_PATH = termuxPath;
    return termuxPath;
  }

  const binDir = path.resolve(__dirname, '..', '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isAndroid = process.platform === 'android';

  if (isAndroid) {
    console.log('[youtubeService] Running on Android Termux. Using system yt-dlp package.');
    YT_DLP_PATH = 'yt-dlp';
    return 'yt-dlp';
  }
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

  const sumsUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA256SUMS';

  try {
    // 1. Attempt to fetch SHA256SUMS manifest (optional checksum check)
    let sumsText = '';
    try {
      console.log(`[youtubeService] Fetching SHA256SUMS from ${sumsUrl}...`);
      const sumsRes = await fetch(sumsUrl);
      if (sumsRes.ok) {
        sumsText = await sumsRes.text();
      } else {
        console.warn(`[youtubeService] SHA256SUMS returned status ${sumsRes.status}, skipping checksum verification.`);
      }
    } catch (err: any) {
      console.warn(`[youtubeService] Could not fetch SHA256SUMS manifest:`, err?.message || err);
    }

    // 2. Fetch binary
    console.log(`[youtubeService] Downloading binary from ${downloadUrl}...`);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Verify SHA-256 hash if manifest was retrieved
    if (sumsText) {
      const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const expectedHashLine = sumsText.split(/\r?\n/).find(line => line.trim().endsWith(filename));
      if (expectedHashLine) {
        const expectedHash = expectedHashLine.split(/\s+/)[0].trim().toLowerCase();
        if (calculatedHash !== expectedHash) {
          throw new Error(`SHA256 verification failed for ${filename}. Expected: ${expectedHash}, Got: ${calculatedHash}`);
        }
        console.log(`[youtubeService] SHA-256 verification passed for ${filename}`);
      }
    }

    fs.writeFileSync(localPath, buffer);
    
    if (!isWindows) {
      // Set executable permission on Unix-like systems
      fs.chmodSync(localPath, 0o755);
    }
    console.log(`[youtubeService] yt-dlp binary downloaded successfully to ${localPath}`);
    YT_DLP_PATH = localPath;
    return localPath;
  } catch (error) {
    console.error('[youtubeService] Failed to download or verify yt-dlp:', error);
    console.log('[youtubeService] Falling back to system-wide "yt-dlp" command from PATH.');
    YT_DLP_PATH = 'yt-dlp';
    return 'yt-dlp';
  }
}

// Timeout protection guard: ensure server startup never blocks indefinitely on slow network download
const TIMEOUT_MS = 12000;
ytDlpReady = Promise.race([
  ensureYtDlpBinary(),
  new Promise<string>((resolve) => {
    setTimeout(() => {
      console.warn(`[youtubeService] ensureYtDlpBinary timed out after ${TIMEOUT_MS}ms. Falling back to system 'yt-dlp'.`);
      YT_DLP_PATH = 'yt-dlp';
      resolve('yt-dlp');
    }, TIMEOUT_MS);
  })
]);

/**
 * Periodically checks for and applies yt-dlp binary self-updates in the background.
 */
export function scheduleYtDlpUpdater() {
  const checkUpdate = async () => {
    try {
      if (YT_DLP_PATH) {
        console.log('[youtubeService] Checking for yt-dlp binary updates...');
        await execFileAsync(YT_DLP_PATH, ['-U']);
        console.log('[youtubeService] yt-dlp binary update check complete.');
      }
    } catch (e) {
      // Ignore if self-update is disabled or not supported on current platform
    }
  };

  setTimeout(checkUpdate, 30000);
  setInterval(checkUpdate, 12 * 60 * 60 * 1000);
}

scheduleYtDlpUpdater();

/**
 * Custom InnerTube stream URL extraction using the IOS client.
 */
async function extractUrlWithCustomInnertube(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<StreamResult | null> {
  try {
    console.log(`[youtubeService] Attempting custom InnerTube player extraction for ${videoId}...`);
    const { basicInfo, audioFormats } = await customPlayer(videoId);
    if (!audioFormats || audioFormats.length === 0) {
      throw new Error('No audio formats returned by custom player');
    }

    // Sort all audio formats by bitrate descending
    const sortedFormats = [...audioFormats].sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    
    const selectedFormat = selectByQuality(sortedFormats, quality);

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

export interface TranscriptSegment {
  start_ms: number;
  snippet: {
    text: string;
  };
}

export interface TranscriptResult {
  transcript: {
    content: {
      body: {
        initial_segments: TranscriptSegment[];
      };
    };
  };
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
export async function getYouTubeTranscript(videoId: string): Promise<TranscriptResult | null> {
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
    const candidates: string[] = [];
    for (const [, info] of data) {
      if (
        info?.type === 'https' &&
        info?.uri &&
        info?.monitor?.uptime > 90 &&
        !info?.monitor?.down
      ) {
        candidates.push(info.uri);
      }
      if (candidates.length >= 16) break;
    }

    console.log(`[Proxy] Probing ${candidates.length} Invidious candidates...`);
    const probeResults = await Promise.all(
      candidates.map(async (uri) => {
        const ok = await probeInstance(uri, '/api/v1/videos/dQw4w9WgXcQ', 2000);
        return { uri, ok };
      })
    );
    const working = probeResults.filter(r => r.ok).map(r => r.uri).slice(0, 8);

    if (working.length > 0) {
      invidiousInstances = working;
      instancesLastFetched = Date.now();
      console.log(`[Proxy] Refreshed Invidious instances: ${working.length} verified working`);
    }
  } catch (err: any) {
    console.warn(`[Proxy] Failed to refresh Invidious instances: ${err.message || err}`);
  }
}

refreshInvidiousInstances().catch(() => {});

const FALLBACK_COBALT_INSTANCES = [
  'https://rue-cobalt.xenon.zone',
  'https://cobaltapi.kittycat.boo',
];

let cobaltInstances: string[] = [...FALLBACK_COBALT_INSTANCES];
let cobaltInstancesLastFetched = 0;

export function getCobaltInstances(): string[] {
  return cobaltInstances;
}

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
    const candidates: string[] = [];
    for (const item of data) {
      if (
        item.url &&
        !item.url.includes('api.cobalt.tools') &&
        item.monitoring?.status === 'up' &&
        item.trust >= 80 &&
        item.cors === 1
      ) {
        candidates.push(item.url.replace(/\/$/, ''));
      }
      if (candidates.length >= 24) break;
    }

    console.log(`[Proxy] Probing ${candidates.length} Cobalt candidates...`);
    const probeResults = await Promise.all(
      candidates.map(async (url) => {
        const ok = await probeInstance(url, '', 2000);
        return { url, ok };
      })
    );
    const working = probeResults.filter(r => r.ok).map(r => r.url).slice(0, 12);

    if (working.length > 0) {
      cobaltInstances = working;
      cobaltInstancesLastFetched = Date.now();
      console.log(`[Proxy] Refreshed Cobalt instances: ${working.length} verified working`);
    }
  } catch (err: any) {
    console.warn(`[Proxy] Failed to refresh Cobalt instances: ${err.message || err}`);
  }
}

refreshCobaltInstances().catch(() => {});

async function validateMediaUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const testRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (testRes.status === 403 || testRes.status === 401 || testRes.status >= 400) {
      return false;
    }
    const contentType = testRes.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
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

export interface GenericAudioFormat {
  url?: string;
  bitrate?: number | string;
  mimeType?: string;
  type?: string;
  contentLength?: string | number;
  content_length?: string | number;
  clen?: string | number;
}

export function filterAndSelectAudioFormat(
  rawFormats: GenericAudioFormat[],
  quality: 'high' | 'medium' | 'low'
): GenericAudioFormat | null {
  if (!rawFormats || rawFormats.length === 0) return null;

  const withUrls = rawFormats.filter(f => f.url);
  if (withUrls.length === 0) return null;

  let mp4Formats = withUrls.filter(f => {
    const mime = (f.mimeType || f.type || '').toLowerCase();
    return mime.includes('audio/mp4') || mime.includes('m4a');
  });

  const baseFormats = mp4Formats.length > 0 ? mp4Formats : withUrls;

  const sorted = [...baseFormats].sort((a, b) => {
    const brA = a.bitrate ? parseInt(a.bitrate.toString(), 10) : 0;
    const brB = b.bitrate ? parseInt(b.bitrate.toString(), 10) : 0;
    return brB - brA;
  });

  return selectByQuality(sorted, quality);
}

export function getAvailableExtractionTiers(): {
  useInnerTube: boolean;
  useYtDlp: boolean;
  useProxies: boolean;
} {
  const isCloudHosting = (process.env.RENDER === 'true' || 
                          process.env.FLY_APP_NAME || 
                          process.env.CLOUD_HOSTING === 'true') &&
                          process.env.FORCE_DIRECT_STREAMS !== 'true';
  const hasAuth = !!getCookieHeader();

  return {
    useInnerTube: true,
    useYtDlp: !isCloudHosting || hasAuth,
    useProxies: true
  };
}

async function refreshProxyInstances() {
  console.log('[youtubeService] Probing and filtering fallback proxy instances...');
  
  const invidiousProbes = await Promise.all(
    FALLBACK_INVIDIOUS_INSTANCES.map(async (uri) => {
      const ok = await probeInstance(uri, '/api/v1/videos/dQw4w9WgXcQ', 2500);
      return { uri, ok };
    })
  );
  invidiousInstances = invidiousProbes.filter(r => r.ok).map(r => r.uri);
  console.log(`[youtubeService] Found ${invidiousInstances.length}/${FALLBACK_INVIDIOUS_INSTANCES.length} working Invidious fallback instances.`);
  
  const pipedProbes = await Promise.all(
    FALLBACK_PIPED_INSTANCES.map(async (uri) => {
      const ok = await probeInstance(uri, '/streams/dQw4w9WgXcQ', 2500);
      return { uri, ok };
    })
  );
  pipedInstances = pipedProbes.filter(r => r.ok).map(r => r.uri);
  console.log(`[youtubeService] Found ${pipedInstances.length}/${FALLBACK_PIPED_INSTANCES.length} working Piped fallback instances.`);
  
  if (invidiousInstances.length === 0) invidiousInstances = [...FALLBACK_INVIDIOUS_INSTANCES];
  if (pipedInstances.length === 0) pipedInstances = [...FALLBACK_PIPED_INSTANCES];
}

// Call on startup
refreshProxyInstances().catch(() => {});

async function extractUrlWithProxy(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<StreamResult | null> {
  refreshInvidiousInstances().catch(() => {});
  
  const invTargets = invidiousInstances.slice(0, 5);
  const pipedTargets = pipedInstances.slice(0, 5);
  
  const tasks: (() => Promise<StreamResult | null>)[] = [];
  
  for (const instance of invTargets) {
    tasks.push(async () => {
      try {
        const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats`;
        console.log(`[Invidious] Trying ${instance} for ${videoId}...`);
        const response = await fetchWithTimeout(apiUrl, 6000);
        if (!response.ok) throw new Error(`HTTP error ${response.status} from ${instance}`);
        const data = await response.json() as any;
        if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) {
          throw new Error(`Missing adaptiveFormats from ${instance}`);
        }
        
        let audioStreams: any[] = data.adaptiveFormats.filter((s: any) => s.type && s.type.startsWith('audio/') && s.url);
        const selected = filterAndSelectAudioFormat(
          audioStreams.map((f: any) => ({
            url: f.url,
            bitrate: f.bitrate,
            mimeType: f.type,
            clen: f.clen
          })),
          quality
        );
        if (!selected || !selected.url) throw new Error(`No audio stream selected from ${instance}`);
        
        const contentType = (selected.mimeType || 'audio/mp4').split(';')[0].trim();
        
        console.log(`[Invidious] Validating stream URL from ${instance}: ${selected.url}`);
        const isValid = await validateMediaUrl(selected.url);
        if (!isValid) {
          throw new Error(`Stream validation failed for ${instance}`);
        }
        console.log(`[Invidious] Stream URL validation passed from ${instance}!`);
        
        return {
          url: selected.url,
          contentType,
          title: data.title || 'Unknown',
          artist: data.author || 'Unknown Artist',
          duration: data.lengthSeconds || 0,
          filesize: parseInt(selected.clen as string) || 0,
        };
      } catch (err: any) {
        console.warn(`[Invidious] Failed via ${instance}:`, err.message || err);
        return null;
      }
    });
  }
  
  for (const instance of pipedTargets) {
    tasks.push(async () => {
      try {
        const apiUrl = `${instance}/streams/${videoId}`;
        console.log(`[Piped] Trying ${instance} for ${videoId}...`);
        const response = await fetchWithTimeout(apiUrl, 6000);
        if (!response.ok) throw new Error(`HTTP error ${response.status} from ${instance}`);
        const data = await response.json() as any;
        if (!data.audioStreams || data.audioStreams.length === 0) {
          throw new Error(`Missing audioStreams from ${instance}`);
        }
        
        const selected = filterAndSelectAudioFormat(data.audioStreams, quality);
        if (!selected || !selected.url) throw new Error(`No audio stream selected from ${instance}`);
        
        const contentType = (selected.mimeType || 'audio/mp4').split(';')[0].trim();
        
        console.log(`[Piped] Validating stream URL from ${instance}: ${selected.url}`);
        const isValid = await validateMediaUrl(selected.url);
        if (!isValid) {
          throw new Error(`Stream validation failed for ${instance}`);
        }
        console.log(`[Piped] Stream URL validation passed from ${instance}!`);
        
        const clenStr = selected.contentLength || selected.content_length || '0';
        return {
          url: selected.url,
          contentType,
          title: data.title || 'Unknown',
          artist: data.uploader || 'Unknown Artist',
          duration: data.duration || 0,
          filesize: parseInt(clenStr.toString(), 10) || 0,
        };
      } catch (err: any) {
        console.warn(`[Piped] Failed via ${instance}:`, err.message || err);
        return null;
      }
    });
  }
  
  const interleaved: typeof tasks = [];
  const maxLen = Math.max(invTargets.length, pipedTargets.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < invTargets.length) interleaved.push(tasks[i]);
    if (i < pipedTargets.length) interleaved.push(tasks[invTargets.length + i]);
  }
  
  return await raceFirstSuccessful(interleaved, 3);
}

async function getVideoInfoWithProxy(videoId: string): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
} | null> {
  const invTargets = invidiousInstances.slice(0, 5);
  const pipedTargets = pipedInstances.slice(0, 5);
  
  const tasks: (() => Promise<any | null>)[] = [];
  
  for (const instance of invTargets) {
    tasks.push(async () => {
      try {
        const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails`;
        const response = await fetchWithTimeout(apiUrl, 6000);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
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
      } catch (err: any) {
        console.warn(`[Invidious Info] Failed via ${instance}:`, err.message || err);
        return null;
      }
    });
  }
  
  for (const instance of pipedTargets) {
    tasks.push(async () => {
      try {
        const apiUrl = `${instance}/streams/${videoId}`;
        const response = await fetchWithTimeout(apiUrl, 6000);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json() as any;
        return {
          title: data.title || 'Unknown',
          artist: data.uploader || 'Unknown Artist',
          album: 'YouTube',
          duration: data.duration || 0,
          coverArtUrl: data.thumbnailUrl || null,
        };
      } catch (err: any) {
        console.warn(`[Piped Info] Failed via ${instance}:`, err.message || err);
        return null;
      }
    });
  }
  
  const interleaved: typeof tasks = [];
  const maxLen = Math.max(invTargets.length, pipedTargets.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < invTargets.length) interleaved.push(tasks[i]);
    if (i < pipedTargets.length) interleaved.push(tasks[invTargets.length + i]);
  }
  
  return await raceFirstSuccessful(interleaved, 3);
}

async function extractUrlWithCobalt(videoId: string, quality: 'high' | 'medium' | 'low'): Promise<StreamResult | null> {
  refreshCobaltInstances().catch(() => {});
  for (const backend of cobaltInstances) {
    const formatsToTry: ('mp3' | 'best')[] = ['mp3', 'best'];
    for (const formatToTry of formatsToTry) {
      const payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        downloadMode: 'audio',
        audioFormat: formatToTry,
        audioBitrate: quality === 'low' ? '64' : quality === 'medium' ? '128' : '256',
        alwaysProxy: true
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
          const extension = path.extname(filename);
          const contentType = extToMime(extension);
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

function runYtDlpPooled(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise(async (resolve, reject) => {
    let poolHandle;
    try {
      await ytDlpReady;
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

    const proxy = process.env.YTDLP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const finalArgs = [...args];
    if (proxy && !finalArgs.includes('--proxy')) {
      finalArgs.push('--proxy', proxy);
    }

    const child = execFile(YT_DLP_PATH, finalArgs, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
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

        // Tier 1: Fast direct InnerTube extraction (VISIONOS / TVHTML5 / ANDROID)
        const customResult = await extractUrlWithCustomInnertube(videoId, quality);
        if (customResult) {
          streamUrlCache.set(cacheKey, { data: customResult, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
          return customResult;
        }

        // Tier 2: Direct local yt-dlp extraction fallback
        console.log(`[youtubeService] InnerTube extraction failed for ${videoId}, falling back directly to local yt-dlp...`);
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const formatSelector = getYtDlpFormatSelector(quality);

        const args = [
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
        ];
        const cookieFilePath = getCookieFilePath();
        if (cookieFilePath) {
          args.push('--cookies', cookieFilePath);
        }
        args.push(ytUrl);

        const { stdout } = await runYtDlpPooled(args, 15000);
        
        const lines = stdout.trim().split(/\r?\n/).map(l => l.trim());
        const [url, ext, filesizeStr, filesizeApproxStr, title, artist, durationStr] = lines;

        if (!url || url === 'NA') {
          throw new Error('No valid URL extracted by yt-dlp');
        }

        const cleanStr = (val: string | undefined) => (!val || val === 'NA' ? '' : val);
        const parsedFilesize = parseInt(filesizeStr || '', 10);
        const parsedFilesizeApprox = parseInt(filesizeApproxStr || '', 10);
        const filesize = !isNaN(parsedFilesize) ? parsedFilesize : (!isNaN(parsedFilesizeApprox) ? parsedFilesizeApprox : 0);
        const duration = parseFloat(durationStr || '') || 0;

        const result: StreamResult = {
          url,
          contentType: extToMime(ext || ''),
          title: cleanStr(title) || 'Unknown',
          artist: cleanStr(artist) || 'Unknown Artist',
          duration,
          filesize,
        };

        streamUrlCache.set(cacheKey, { data: result, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });

        if (streamUrlCache.size > MAX_CACHE_SIZE) {
          let oldestKey: string | null = null;
          let oldestAccessed = Infinity;
          for (const [key, val] of streamUrlCache) {
            if (val.lastAccessed < oldestAccessed) {
              oldestAccessed = val.lastAccessed;
              oldestKey = key;
            }
          }
          if (oldestKey) streamUrlCache.delete(oldestKey);
        }

        return result;
      } catch (error: any) {
        const msg = error?.message || String(error);
        if (msg.includes('ENOTFOUND') || msg.includes('Errno 11001') || msg.includes('getaddrinfo failed')) {
          console.warn(`[youtubeService] Stream URL extraction failed for ${videoId}: Network offline (DNS resolution failed)`);
        } else {
          console.error(`[youtubeService] Stream URL extraction failed for ${videoId}:`, msg);
        }
        return null;
      } finally {
        pendingExtractions.delete(cacheKey);
      }
    })();
    pendingExtractions.set(cacheKey, pending);
  }

  return pending;
}

export async function spawnAudioStream(videoId: string, quality: 'high' | 'medium' | 'low' = 'high'): Promise<{
  stream: Readable;
  process: ChildProcess;
}> {
  if (!isValidVideoId(videoId)) {
    throw new Error(`Invalid video ID format: ${videoId}`);
  }
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    '--no-warnings',
    '--no-playlist',
    '-f', getYtDlpFormatSelector(quality),
    '--sponsorblock-remove', 'sponsor,intro,outro,selfpromo,interaction',
  ];
  const cookieFilePath = getCookieFilePath();
  if (cookieFilePath) {
    args.push('--cookies', cookieFilePath);
  }
  const proxy = process.env.YTDLP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy && !args.includes('--proxy')) {
    args.push('--proxy', proxy);
  }
  args.push('-o', '-', ytUrl);

  await ytDlpReady;
  const child = spawn(YT_DLP_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', (err: any) => {
    console.warn(`[youtubeService] yt-dlp spawn error: ${err.message}. Install yt-dlp with: pkg install yt-dlp`);
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
    cached.lastAccessed = Date.now();
    return cached.data;
  }

  const pruneVideoInfoCache = () => {
    if (videoInfoCache.size >= MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestAccessed = Infinity;
      for (const [key, val] of videoInfoCache) {
        if (val.lastAccessed < oldestAccessed) {
          oldestAccessed = val.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey) videoInfoCache.delete(oldestKey);
    }
  };

  try {
    if (!isValidVideoId(videoId)) {
      console.error(`[youtubeService] Invalid video ID format: ${videoId}`);
      return null;
    }

    const customResult = await getVideoInfoWithCustomInnertube(videoId);
    if (customResult) {
      pruneVideoInfoCache();
      videoInfoCache.set(videoId, { data: customResult, expiry: Date.now() + VIDEO_INFO_CACHE_TTL, lastAccessed: Date.now() });
      return customResult;
    }

    console.log(`[youtubeService] Custom InnerTube failed, falling back directly to local yt-dlp for video info of ${videoId}...`);
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      const args = [
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
      ];
      const cookieFilePath = getCookieFilePath();
      if (cookieFilePath) {
        args.push('--cookies', cookieFilePath);
      }
      args.push(ytUrl);

      const { stdout } = await runYtDlpPooled(args, 15000);

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

      pruneVideoInfoCache();
      videoInfoCache.set(videoId, { data: result, expiry: Date.now() + VIDEO_INFO_CACHE_TTL, lastAccessed: Date.now() });
    return result;
  } catch (error: any) {
    console.error(`[youtubeService] Video info fetch failed for ${videoId}:`, error?.message || error);
    return null;
  }
}
