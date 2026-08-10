"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ytDlpReady = exports.YT_DLP_PATH = void 0;
exports.isValidVideoId = isValidVideoId;
exports.selectByQuality = selectByQuality;
exports.extToMime = extToMime;
exports.getYtDlpFormatSelector = getYtDlpFormatSelector;
exports.raceFirstSuccessful = raceFirstSuccessful;
exports.probeInstance = probeInstance;
exports.ensureYtDlpBinary = ensureYtDlpBinary;
exports.searchYouTube = searchYouTube;
exports.getRelatedTracks = getRelatedTracks;
exports.getYouTubeTranscript = getYouTubeTranscript;
exports.preWarmClient = preWarmClient;
exports.getCobaltInstances = getCobaltInstances;
exports.filterAndSelectAudioFormat = filterAndSelectAudioFormat;
exports.getAvailableExtractionTiers = getAvailableExtractionTiers;
exports.getAudioStreamUrl = getAudioStreamUrl;
exports.spawnAudioStream = spawnAudioStream;
exports.getVideoInfo = getVideoInfo;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const processPool_1 = require("./processPool");
const customInnertube_1 = require("./customInnertube");
const youtubeAuth_1 = require("./youtubeAuth");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// Strict YouTube video ID validation: exactly 11 alphanumeric / dash / underscore chars
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
function isValidVideoId(id) {
    return YOUTUBE_ID_REGEX.test(id);
}
function selectByQuality(sorted, quality) {
    if (quality === 'low')
        return sorted[sorted.length - 1];
    if (quality === 'medium')
        return sorted[Math.floor(sorted.length / 2)] || sorted[0];
    return sorted[0];
}
function extToMime(ext) {
    const clean = ext.toLowerCase().trim().replace(/^\./, '');
    if (clean === 'mp3')
        return 'audio/mpeg';
    if (clean === 'm4a')
        return 'audio/mp4';
    if (clean === 'webm' || clean === 'opus')
        return 'audio/webm';
    if (clean === 'ogg')
        return 'audio/ogg';
    return 'audio/mp4';
}
function getYtDlpFormatSelector(quality) {
    const formatMap = {
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
async function raceFirstSuccessful(tasks, concurrencyLimit) {
    return new Promise((resolve) => {
        let resolved = false;
        let activeCount = 0;
        let nextIndex = 0;
        let completedCount = 0;
        if (tasks.length === 0) {
            resolve(null);
            return;
        }
        const runNext = async () => {
            if (resolved)
                return;
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
            }
            catch (err) {
                // Ignore error and continue racing other instances
            }
            finally {
                activeCount--;
                completedCount++;
                if (!resolved) {
                    if (completedCount === tasks.length) {
                        resolved = true;
                        resolve(null);
                    }
                    else {
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
async function probeInstance(url, endpoint = '', timeoutMs = 2500) {
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
    }
    catch {
        return false;
    }
}
// Cache extracted stream URLs — they're valid for ~30 minutes
const streamUrlCache = new Map();
const STREAM_URL_CACHE_TTL = 25 * 60 * 1000; // 25 minutes
// Coalesce pending stream URL extractions to prevent duplicate yt-dlp runs
const pendingExtractions = new Map();
// Cache video info to avoid redundant yt-dlp invocations
const videoInfoCache = new Map();
const VIDEO_INFO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 200;
function resolveYtDlpPath() {
    const localPath = path_1.default.resolve(__dirname, '..', '..', 'yt-dlp.exe');
    if (fs_1.default.existsSync(localPath)) {
        return localPath;
    }
    const termuxPath = '/data/data/com.termux/files/usr/bin/yt-dlp';
    if (fs_1.default.existsSync(termuxPath)) {
        return termuxPath;
    }
    return 'yt-dlp';
}
exports.YT_DLP_PATH = resolveYtDlpPath();
async function ensureYtDlpBinary() {
    const termuxPath = '/data/data/com.termux/files/usr/bin/yt-dlp';
    if (fs_1.default.existsSync(termuxPath)) {
        console.log(`[youtubeService] Using native Termux yt-dlp binary at ${termuxPath}`);
        exports.YT_DLP_PATH = termuxPath;
        return termuxPath;
    }
    const binDir = path_1.default.resolve(__dirname, '..', '..', 'bin');
    if (!fs_1.default.existsSync(binDir)) {
        fs_1.default.mkdirSync(binDir, { recursive: true });
    }
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isAndroid = process.platform === 'android';
    if (isAndroid) {
        console.log('[youtubeService] Running on Android Termux. Using system yt-dlp package.');
        exports.YT_DLP_PATH = 'yt-dlp';
        return 'yt-dlp';
    }
    const filename = isWindows ? 'yt-dlp.exe' : (isMac ? 'yt-dlp_macos' : 'yt-dlp');
    const localPath = path_1.default.join(binDir, filename);
    if (fs_1.default.existsSync(localPath)) {
        exports.YT_DLP_PATH = localPath;
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
            }
            else {
                console.warn(`[youtubeService] SHA256SUMS returned status ${sumsRes.status}, skipping checksum verification.`);
            }
        }
        catch (err) {
            console.warn(`[youtubeService] Could not fetch SHA256SUMS manifest:`, err?.message || err);
        }
        // 2. Fetch binary
        console.log(`[youtubeService] Downloading binary from ${downloadUrl}...`);
        const res = await fetch(downloadUrl);
        if (!res.ok)
            throw new Error(`HTTP error ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // 3. Verify SHA-256 hash if manifest was retrieved
        if (sumsText) {
            const calculatedHash = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
            const expectedHashLine = sumsText.split(/\r?\n/).find(line => line.trim().endsWith(filename));
            if (expectedHashLine) {
                const expectedHash = expectedHashLine.split(/\s+/)[0].trim().toLowerCase();
                if (calculatedHash !== expectedHash) {
                    throw new Error(`SHA256 verification failed for ${filename}. Expected: ${expectedHash}, Got: ${calculatedHash}`);
                }
                console.log(`[youtubeService] SHA-256 verification passed for ${filename}`);
            }
        }
        fs_1.default.writeFileSync(localPath, buffer);
        if (!isWindows) {
            // Set executable permission on Unix-like systems
            fs_1.default.chmodSync(localPath, 0o755);
        }
        console.log(`[youtubeService] yt-dlp binary downloaded successfully to ${localPath}`);
        exports.YT_DLP_PATH = localPath;
        return localPath;
    }
    catch (error) {
        console.error('[youtubeService] Failed to download or verify yt-dlp:', error);
        console.log('[youtubeService] Falling back to system-wide "yt-dlp" command from PATH.');
        exports.YT_DLP_PATH = 'yt-dlp';
        return 'yt-dlp';
    }
}
// Timeout protection guard: ensure server startup never blocks indefinitely on slow network download
const TIMEOUT_MS = 12000;
exports.ytDlpReady = Promise.race([
    ensureYtDlpBinary(),
    new Promise((resolve) => {
        setTimeout(() => {
            console.warn(`[youtubeService] ensureYtDlpBinary timed out after ${TIMEOUT_MS}ms. Falling back to system 'yt-dlp'.`);
            exports.YT_DLP_PATH = 'yt-dlp';
            resolve('yt-dlp');
        }, TIMEOUT_MS);
    })
]);
/**
 * Custom InnerTube stream URL extraction using the IOS client.
 */
async function extractUrlWithCustomInnertube(videoId, quality) {
    try {
        console.log(`[youtubeService] Attempting custom InnerTube player extraction for ${videoId}...`);
        const { basicInfo, audioFormats } = await (0, customInnertube_1.customPlayer)(videoId);
        if (!audioFormats || audioFormats.length === 0) {
            throw new Error('No audio formats returned by custom player');
        }
        // Prioritize audio/mp4 (AAC) over audio/webm (Opus) for universal playback support
        let filteredFormats = audioFormats.filter((f) => (f.mimeType || '').includes('audio/mp4'));
        if (filteredFormats.length === 0) {
            filteredFormats = audioFormats;
        }
        // Sort formats by bitrate descending
        const sortedFormats = [...filteredFormats].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
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
    }
    catch (err) {
        console.warn(`[youtubeService] Custom InnerTube player extraction failed for ${videoId}:`, err.message || err);
        return null;
    }
}
/**
 * Custom InnerTube video info extraction.
 */
async function getVideoInfoWithCustomInnertube(videoId) {
    try {
        console.log(`[youtubeService] Attempting custom InnerTube video info fetch for ${videoId}...`);
        const { basicInfo } = await (0, customInnertube_1.customPlayer)(videoId);
        return {
            title: basicInfo.title,
            artist: basicInfo.artist,
            album: 'YouTube',
            duration: basicInfo.duration,
            coverArtUrl: basicInfo.coverArtUrl
        };
    }
    catch (err) {
        console.warn(`[youtubeService] Custom InnerTube video info fetch failed for ${videoId}:`, err.message || err);
        return null;
    }
}
/**
 * Search YouTube Music using the custom InnerTube client.
 */
async function searchYouTube(query) {
    try {
        return await (0, customInnertube_1.customSearch)(query);
    }
    catch (error) {
        console.error('[youtubeService] Search error:', error);
        return [];
    }
}
/**
 * Recommended tracks / radio from custom InnerTube.
 */
async function getRelatedTracks(videoId) {
    try {
        return await (0, customInnertube_1.customGetRelated)(videoId);
    }
    catch (error) {
        console.error('[youtubeService] GetRelatedTracks error:', error);
        return [];
    }
}
/**
 * TIMED transcripts helper.
 */
async function getYouTubeTranscript(videoId) {
    try {
        return await (0, customInnertube_1.customGetTranscript)(videoId);
    }
    catch (error) {
        console.error('[youtubeService] GetYouTubeTranscript error:', error);
        return null;
    }
}
async function preWarmClient() {
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
let invidiousInstances = [...FALLBACK_INVIDIOUS_INSTANCES];
let pipedInstances = [...FALLBACK_PIPED_INSTANCES];
let instancesLastFetched = 0;
const INSTANCE_REFRESH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
async function refreshInvidiousInstances() {
    if (Date.now() - instancesLastFetched < INSTANCE_REFRESH_INTERVAL)
        return;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch('https://api.invidious.io/instances.json?sort_by=type,health', {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok)
            return;
        const data = await response.json();
        const candidates = [];
        for (const [, info] of data) {
            if (info?.type === 'https' &&
                info?.uri &&
                info?.monitor?.uptime > 90 &&
                !info?.monitor?.down) {
                candidates.push(info.uri);
            }
            if (candidates.length >= 16)
                break;
        }
        console.log(`[Proxy] Probing ${candidates.length} Invidious candidates...`);
        const probeResults = await Promise.all(candidates.map(async (uri) => {
            const ok = await probeInstance(uri, '/api/v1/videos/dQw4w9WgXcQ', 2000);
            return { uri, ok };
        }));
        const working = probeResults.filter(r => r.ok).map(r => r.uri).slice(0, 8);
        if (working.length > 0) {
            invidiousInstances = working;
            instancesLastFetched = Date.now();
            console.log(`[Proxy] Refreshed Invidious instances: ${working.length} verified working`);
        }
    }
    catch (err) {
        console.warn(`[Proxy] Failed to refresh Invidious instances: ${err.message || err}`);
    }
}
refreshInvidiousInstances().catch(() => { });
const FALLBACK_COBALT_INSTANCES = [
    'https://rue-cobalt.xenon.zone',
    'https://cobaltapi.kittycat.boo',
];
let cobaltInstances = [...FALLBACK_COBALT_INSTANCES];
let cobaltInstancesLastFetched = 0;
function getCobaltInstances() {
    return cobaltInstances;
}
async function refreshCobaltInstances() {
    if (Date.now() - cobaltInstancesLastFetched < INSTANCE_REFRESH_INTERVAL)
        return;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        console.log('[Proxy] Fetching Cobalt instances list from instances.cobalt.best...');
        const response = await fetch('https://instances.cobalt.best/api/instances.json', {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok)
            return;
        const data = await response.json();
        const candidates = [];
        for (const item of data) {
            if (item.url &&
                !item.url.includes('api.cobalt.tools') &&
                item.monitoring?.status === 'up' &&
                item.trust >= 80 &&
                item.cors === 1) {
                candidates.push(item.url.replace(/\/$/, ''));
            }
            if (candidates.length >= 24)
                break;
        }
        console.log(`[Proxy] Probing ${candidates.length} Cobalt candidates...`);
        const probeResults = await Promise.all(candidates.map(async (url) => {
            const ok = await probeInstance(url, '', 2000);
            return { url, ok };
        }));
        const working = probeResults.filter(r => r.ok).map(r => r.url).slice(0, 12);
        if (working.length > 0) {
            cobaltInstances = working;
            cobaltInstancesLastFetched = Date.now();
            console.log(`[Proxy] Refreshed Cobalt instances: ${working.length} verified working`);
        }
    }
    catch (err) {
        console.warn(`[Proxy] Failed to refresh Cobalt instances: ${err.message || err}`);
    }
}
refreshCobaltInstances().catch(() => { });
async function validateMediaUrl(url) {
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
    }
    catch {
        return false;
    }
}
async function fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        clearTimeout(timeout);
        return response;
    }
    catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}
function filterAndSelectAudioFormat(rawFormats, quality) {
    if (!rawFormats || rawFormats.length === 0)
        return null;
    const withUrls = rawFormats.filter(f => f.url);
    if (withUrls.length === 0)
        return null;
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
function getAvailableExtractionTiers() {
    const isCloudHosting = (process.env.RENDER === 'true' ||
        process.env.FLY_APP_NAME ||
        process.env.CLOUD_HOSTING === 'true') &&
        process.env.FORCE_DIRECT_STREAMS !== 'true';
    const hasAuth = !!(0, youtubeAuth_1.getCookieHeader)();
    return {
        useInnerTube: true,
        useYtDlp: !isCloudHosting || hasAuth,
        useProxies: true
    };
}
async function refreshProxyInstances() {
    console.log('[youtubeService] Probing and filtering fallback proxy instances...');
    const invidiousProbes = await Promise.all(FALLBACK_INVIDIOUS_INSTANCES.map(async (uri) => {
        const ok = await probeInstance(uri, '/api/v1/videos/dQw4w9WgXcQ', 2500);
        return { uri, ok };
    }));
    invidiousInstances = invidiousProbes.filter(r => r.ok).map(r => r.uri);
    console.log(`[youtubeService] Found ${invidiousInstances.length}/${FALLBACK_INVIDIOUS_INSTANCES.length} working Invidious fallback instances.`);
    const pipedProbes = await Promise.all(FALLBACK_PIPED_INSTANCES.map(async (uri) => {
        const ok = await probeInstance(uri, '/streams/dQw4w9WgXcQ', 2500);
        return { uri, ok };
    }));
    pipedInstances = pipedProbes.filter(r => r.ok).map(r => r.uri);
    console.log(`[youtubeService] Found ${pipedInstances.length}/${FALLBACK_PIPED_INSTANCES.length} working Piped fallback instances.`);
    if (invidiousInstances.length === 0)
        invidiousInstances = [...FALLBACK_INVIDIOUS_INSTANCES];
    if (pipedInstances.length === 0)
        pipedInstances = [...FALLBACK_PIPED_INSTANCES];
}
// Call on startup
refreshProxyInstances().catch(() => { });
async function extractUrlWithProxy(videoId, quality) {
    refreshInvidiousInstances().catch(() => { });
    const invTargets = invidiousInstances.slice(0, 5);
    const pipedTargets = pipedInstances.slice(0, 5);
    const tasks = [];
    for (const instance of invTargets) {
        tasks.push(async () => {
            try {
                const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats`;
                console.log(`[Invidious] Trying ${instance} for ${videoId}...`);
                const response = await fetchWithTimeout(apiUrl, 6000);
                if (!response.ok)
                    throw new Error(`HTTP error ${response.status} from ${instance}`);
                const data = await response.json();
                if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) {
                    throw new Error(`Missing adaptiveFormats from ${instance}`);
                }
                let audioStreams = data.adaptiveFormats.filter((s) => s.type && s.type.startsWith('audio/') && s.url);
                const selected = filterAndSelectAudioFormat(audioStreams.map((f) => ({
                    url: f.url,
                    bitrate: f.bitrate,
                    mimeType: f.type,
                    clen: f.clen
                })), quality);
                if (!selected || !selected.url)
                    throw new Error(`No audio stream selected from ${instance}`);
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
                    filesize: parseInt(selected.clen) || 0,
                };
            }
            catch (err) {
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
                if (!response.ok)
                    throw new Error(`HTTP error ${response.status} from ${instance}`);
                const data = await response.json();
                if (!data.audioStreams || data.audioStreams.length === 0) {
                    throw new Error(`Missing audioStreams from ${instance}`);
                }
                const selected = filterAndSelectAudioFormat(data.audioStreams, quality);
                if (!selected || !selected.url)
                    throw new Error(`No audio stream selected from ${instance}`);
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
            }
            catch (err) {
                console.warn(`[Piped] Failed via ${instance}:`, err.message || err);
                return null;
            }
        });
    }
    const interleaved = [];
    const maxLen = Math.max(invTargets.length, pipedTargets.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < invTargets.length)
            interleaved.push(tasks[i]);
        if (i < pipedTargets.length)
            interleaved.push(tasks[invTargets.length + i]);
    }
    return await raceFirstSuccessful(interleaved, 3);
}
async function getVideoInfoWithProxy(videoId) {
    const invTargets = invidiousInstances.slice(0, 5);
    const pipedTargets = pipedInstances.slice(0, 5);
    const tasks = [];
    for (const instance of invTargets) {
        tasks.push(async () => {
            try {
                const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails`;
                const response = await fetchWithTimeout(apiUrl, 6000);
                if (!response.ok)
                    throw new Error(`HTTP error ${response.status}`);
                const data = await response.json();
                let coverArtUrl = null;
                if (data.videoThumbnails && data.videoThumbnails.length > 0) {
                    const maxres = data.videoThumbnails.find((t) => t.quality === 'maxresdefault' || t.quality === 'maxres');
                    coverArtUrl = maxres?.url || data.videoThumbnails[0]?.url || null;
                }
                return {
                    title: data.title || 'Unknown',
                    artist: data.author || 'Unknown Artist',
                    album: 'YouTube',
                    duration: data.lengthSeconds || 0,
                    coverArtUrl,
                };
            }
            catch (err) {
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
                if (!response.ok)
                    throw new Error(`HTTP error ${response.status}`);
                const data = await response.json();
                return {
                    title: data.title || 'Unknown',
                    artist: data.uploader || 'Unknown Artist',
                    album: 'YouTube',
                    duration: data.duration || 0,
                    coverArtUrl: data.thumbnailUrl || null,
                };
            }
            catch (err) {
                console.warn(`[Piped Info] Failed via ${instance}:`, err.message || err);
                return null;
            }
        });
    }
    const interleaved = [];
    const maxLen = Math.max(invTargets.length, pipedTargets.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < invTargets.length)
            interleaved.push(tasks[i]);
        if (i < pipedTargets.length)
            interleaved.push(tasks[invTargets.length + i]);
    }
    return await raceFirstSuccessful(interleaved, 3);
}
async function extractUrlWithCobalt(videoId, quality) {
    refreshCobaltInstances().catch(() => { });
    for (const backend of cobaltInstances) {
        const formatsToTry = ['mp3', 'best'];
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
                if (!response.ok)
                    continue;
                const data = await response.json();
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
                    const extension = path_1.default.extname(filename);
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
            }
            catch (err) {
                console.warn(`[Cobalt] Failed to query ${backend} for ${videoId}:`, err.message || err);
                continue;
            }
        }
    }
    return null;
}
function runYtDlpPooled(args, timeoutMs) {
    return new Promise(async (resolve, reject) => {
        let poolHandle;
        try {
            await exports.ytDlpReady;
            poolHandle = await processPool_1.ytdlpPool.acquire();
        }
        catch (err) {
            return reject(err);
        }
        let finished = false;
        const release = () => {
            if (!finished) {
                finished = true;
                poolHandle.release();
            }
        };
        const child = (0, child_process_1.execFile)(exports.YT_DLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            release();
            if (error) {
                reject(Object.assign(error, { stdout, stderr }));
            }
            else {
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
async function getAudioStreamUrl(videoId, quality = 'high', bypassCache = false) {
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
                const cookieFilePath = (0, youtubeAuth_1.getCookieFilePath)();
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
                const cleanStr = (val) => (!val || val === 'NA' ? '' : val);
                const parsedFilesize = parseInt(filesizeStr || '', 10);
                const parsedFilesizeApprox = parseInt(filesizeApproxStr || '', 10);
                const filesize = !isNaN(parsedFilesize) ? parsedFilesize : (!isNaN(parsedFilesizeApprox) ? parsedFilesizeApprox : 0);
                const duration = parseFloat(durationStr || '') || 0;
                const result = {
                    url,
                    contentType: extToMime(ext || ''),
                    title: cleanStr(title) || 'Unknown',
                    artist: cleanStr(artist) || 'Unknown Artist',
                    duration,
                    filesize,
                };
                streamUrlCache.set(cacheKey, { data: result, expiry: Date.now() + STREAM_URL_CACHE_TTL, lastAccessed: Date.now() });
                if (streamUrlCache.size > MAX_CACHE_SIZE) {
                    let oldestKey = null;
                    let oldestAccessed = Infinity;
                    for (const [key, val] of streamUrlCache) {
                        if (val.lastAccessed < oldestAccessed) {
                            oldestAccessed = val.lastAccessed;
                            oldestKey = key;
                        }
                    }
                    if (oldestKey)
                        streamUrlCache.delete(oldestKey);
                }
                return result;
            }
            catch (error) {
                const msg = error?.message || String(error);
                if (msg.includes('ENOTFOUND') || msg.includes('Errno 11001') || msg.includes('getaddrinfo failed')) {
                    console.warn(`[youtubeService] Stream URL extraction failed for ${videoId}: Network offline (DNS resolution failed)`);
                }
                else {
                    console.error(`[youtubeService] Stream URL extraction failed for ${videoId}:`, msg);
                }
                return null;
            }
            finally {
                pendingExtractions.delete(cacheKey);
            }
        })();
        pendingExtractions.set(cacheKey, pending);
    }
    return pending;
}
async function spawnAudioStream(videoId, quality = 'high') {
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
    const cookieFilePath = (0, youtubeAuth_1.getCookieFilePath)();
    if (cookieFilePath) {
        args.push('--cookies', cookieFilePath);
    }
    args.push('-o', '-', ytUrl);
    await exports.ytDlpReady;
    const child = (0, child_process_1.spawn)(exports.YT_DLP_PATH, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.on('error', (err) => {
        console.warn(`[youtubeService] yt-dlp spawn error: ${err.message}. Install yt-dlp with: pkg install yt-dlp`);
    });
    child.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg)
            console.log(`[yt-dlp stderr] ${msg}`);
    });
    return {
        stream: child.stdout,
        process: child,
    };
}
async function getVideoInfo(videoId) {
    const cached = videoInfoCache.get(videoId);
    if (cached && cached.expiry > Date.now()) {
        cached.lastAccessed = Date.now();
        return cached.data;
    }
    const pruneVideoInfoCache = () => {
        if (videoInfoCache.size >= MAX_CACHE_SIZE) {
            let oldestKey = null;
            let oldestAccessed = Infinity;
            for (const [key, val] of videoInfoCache) {
                if (val.lastAccessed < oldestAccessed) {
                    oldestAccessed = val.lastAccessed;
                    oldestKey = key;
                }
            }
            if (oldestKey)
                videoInfoCache.delete(oldestKey);
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
        const cookieFilePath = (0, youtubeAuth_1.getCookieFilePath)();
        if (cookieFilePath) {
            args.push('--cookies', cookieFilePath);
        }
        args.push(ytUrl);
        const { stdout } = await runYtDlpPooled(args, 15000);
        const lines = stdout.trim().split(/\r?\n/).map(l => l.trim());
        const [title, artist, album, durationStr, coverArtUrl] = lines;
        const cleanStr = (val, defaultVal = '') => (!val || val === 'NA' ? defaultVal : val);
        const cleanUrl = (val) => (!val || val === 'NA' ? null : val);
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
    }
    catch (error) {
        console.error(`[youtubeService] Video info fetch failed for ${videoId}:`, error?.message || error);
        return null;
    }
}
