"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const youtubeService_1 = require("../services/youtubeService");
const youtubeAuth_1 = require("../services/youtubeAuth");
const processPool_1 = require("../services/processPool");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const stream_1 = require("stream");
const router = (0, express_1.Router)();
const CACHE_DIR = path_1.default.resolve(__dirname, '..', '..', 'uploads', 'tracks', 'cache');
if (!fs_1.default.existsSync(CACHE_DIR)) {
    fs_1.default.mkdirSync(CACHE_DIR, { recursive: true });
}
const activeCacheDownloads = new Map();
/**
 * Sanitize a filename for use in Content-Disposition headers.
 * Strips control characters and quotes, and produces RFC 5987 encoded value.
 */
function sanitizeFileName(name) {
    // Remove CRLF and other control characters
    const cleaned = name.replace(/[\x00-\x1f\x7f"\\]/g, '_');
    return cleaned;
}
function buildContentDisposition(filename) {
    const safe = sanitizeFileName(filename);
    const encoded = encodeURIComponent(safe);
    return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
class ConcurrencyQueue {
    limit;
    activeCount = 0;
    queue = [];
    constructor(limit) {
        this.limit = limit;
    }
    async run(task) {
        return new Promise((resolve, reject) => {
            const execute = async () => {
                this.activeCount++;
                try {
                    const result = await task();
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
                finally {
                    this.activeCount--;
                    this.next();
                }
            };
            this.queue.push(execute);
            this.next();
        });
    }
    next() {
        if (this.activeCount < this.limit && this.queue.length > 0) {
            const nextTask = this.queue.shift();
            if (nextTask)
                nextTask();
        }
    }
}
const cacheDownloadQueue = new ConcurrencyQueue(2);
function detectMimeTypeFromFile(filePath) {
    try {
        if (fs_1.default.existsSync(filePath)) {
            const buffer = Buffer.alloc(8);
            const fd = fs_1.default.openSync(filePath, 'r');
            fs_1.default.readSync(fd, buffer, 0, 8, 0);
            fs_1.default.closeSync(fd);
            // Check EBML (WebM)
            if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
                return 'audio/webm';
            }
            // Check ftyp (MP4/M4A)
            if (buffer.toString('utf-8', 4, 8) === 'ftyp' || buffer.toString('utf-8', 3, 7) === 'typ') {
                return 'audio/mp4';
            }
            // Check ID3 or MP3
            if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
                return 'audio/mpeg';
            }
            if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
                return 'audio/mpeg';
            }
        }
    }
    catch (e) {
        console.warn('[Cache Manager] Failed to detect mime type from file content:', e);
    }
    return 'audio/mp4'; // default fallback
}
function pruneDiskCache() {
    try {
        if (!fs_1.default.existsSync(CACHE_DIR))
            return;
        const files = fs_1.default.readdirSync(CACHE_DIR);
        const maxCacheSizeBytes = 1024 * 1024 * 1024 * 2; // 2 GB limit
        let totalSize = 0;
        const fileInfos = files
            .filter(f => f.endsWith('.cache'))
            .map(f => {
            const filePath = path_1.default.join(CACHE_DIR, f);
            const stats = fs_1.default.statSync(filePath);
            totalSize += stats.size;
            return { name: f, path: filePath, size: stats.size, mtime: stats.mtimeMs };
        });
        if (totalSize > maxCacheSizeBytes) {
            console.log(`[Cache Manager] Cache size: ${(totalSize / 1024 / 1024).toFixed(2)} MB / 2000 MB — pruning...`);
            fileInfos.sort((a, b) => a.mtime - b.mtime);
            let deletedSize = 0;
            for (const info of fileInfos) {
                try {
                    fs_1.default.unlinkSync(info.path);
                    // Also delete companion .meta.json
                    const metaFile = info.path.replace(/\.cache$/, '.meta.json');
                    if (fs_1.default.existsSync(metaFile))
                        fs_1.default.unlinkSync(metaFile);
                    deletedSize += info.size;
                    totalSize -= info.size;
                    console.log(`[Cache Manager] Evicted oldest cached file: ${info.name}`);
                }
                catch { }
                if (totalSize <= maxCacheSizeBytes * 0.7) {
                    break;
                }
            }
            console.log(`[Cache Manager] Eviction completed. Freed ${(deletedSize / 1024 / 1024).toFixed(2)} MB`);
        }
    }
    catch (err) {
        console.error('[Cache Manager] Error cleaning cache:', err);
    }
}
// Run on startup
pruneDiskCache();
function downloadAndCache(videoId, quality) {
    const cacheKey = `${videoId}-${quality}`;
    const existing = activeCacheDownloads.get(cacheKey);
    if (existing)
        return existing;
    const tempPath = path_1.default.join(CACHE_DIR, `${cacheKey}.tmp`);
    const finalPath = path_1.default.join(CACHE_DIR, `${cacheKey}.cache`);
    const metaPath = path_1.default.join(CACHE_DIR, `${cacheKey}.meta.json`);
    const promise = new Promise(async (resolve, reject) => {
        if (fs_1.default.existsSync(finalPath)) {
            resolve(finalPath);
            return;
        }
        console.log(`[Cache Manager] Starting background cache download for ${videoId} (quality: ${quality})...`);
        try {
            const selectedQuality = quality;
            const streamInfo = await (0, youtubeService_1.getAudioStreamUrl)(videoId, selectedQuality);
            if (streamInfo && streamInfo.url) {
                console.log(`[Cache Manager] Fetching stream from ${streamInfo.url} for caching...`);
                const response = await fetch(streamInfo.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
                }
                if (!response.body) {
                    throw new Error('Response body is empty');
                }
                const fileStream = fs_1.default.createWriteStream(tempPath);
                const nodeStream = stream_1.Readable.fromWeb(response.body);
                await new Promise((resolveWrite, rejectWrite) => {
                    nodeStream.pipe(fileStream);
                    fileStream.on('finish', resolveWrite);
                    fileStream.on('error', rejectWrite);
                    nodeStream.on('error', rejectWrite);
                });
                if (fs_1.default.existsSync(tempPath)) {
                    fs_1.default.renameSync(tempPath, finalPath);
                    // Write companion metadata file
                    try {
                        const detectedMime = detectMimeTypeFromFile(finalPath);
                        fs_1.default.writeFileSync(metaPath, JSON.stringify({
                            contentType: detectedMime,
                            title: streamInfo.title,
                            artist: streamInfo.artist,
                            duration: streamInfo.duration,
                        }));
                    }
                    catch (metaErr) {
                        console.warn(`[Cache Manager] Failed to write meta for ${videoId}:`, metaErr);
                    }
                    console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully.`);
                    pruneDiskCache(); // Prune after successful write
                    resolve(finalPath);
                }
                else {
                    throw new Error('Temp file not found after download');
                }
            }
            else {
                throw new Error('Could not get audio stream URL for caching');
            }
        }
        catch (err) {
            console.error(`[Cache Manager] Cache download failed for ${videoId}, falling back to yt-dlp:`, err?.message || err);
            try {
                const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const formatSelector = (0, youtubeService_1.getYtDlpFormatSelector)(quality);
                const args = [
                    '--no-warnings',
                    '--no-playlist',
                    '-f', formatSelector,
                    '--no-check-formats',
                    '--no-check-certificate',
                ];
                const cookieFilePath = (0, youtubeAuth_1.getCookieFilePath)();
                if (cookieFilePath) {
                    args.push('--cookies', cookieFilePath);
                }
                args.push('-o', tempPath, ytUrl);
                await youtubeService_1.ytDlpReady;
                const child = (0, child_process_1.spawn)(youtubeService_1.YT_DLP_PATH, args, {
                    stdio: ['ignore', 'ignore', 'pipe']
                });
                child.stderr?.on('data', (data) => {
                    const msg = data.toString().trim();
                    if (msg)
                        console.log(`[Cache yt-dlp stderr] ${msg}`);
                });
                child.on('exit', (code) => {
                    if (code === 0 && fs_1.default.existsSync(tempPath)) {
                        try {
                            fs_1.default.renameSync(tempPath, finalPath);
                            const detectedMime = detectMimeTypeFromFile(finalPath);
                            try {
                                fs_1.default.writeFileSync(metaPath, JSON.stringify({ contentType: detectedMime }));
                            }
                            catch { }
                            console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully via yt-dlp fallback.`);
                            pruneDiskCache(); // Prune after successful write
                            resolve(finalPath);
                        }
                        catch (renameErr) {
                            console.error(`[Cache Manager] Rename failed for ${videoId}:`, renameErr);
                            reject(renameErr);
                        }
                    }
                    else {
                        console.error(`[Cache Manager] yt-dlp fallback failed with code ${code} for ${videoId}`);
                        if (fs_1.default.existsSync(tempPath)) {
                            try {
                                fs_1.default.unlinkSync(tempPath);
                            }
                            catch { }
                        }
                        reject(new Error(`yt-dlp failed with code ${code}`));
                    }
                });
            }
            catch (ytDlpErr) {
                reject(ytDlpErr);
            }
        }
    }).finally(() => {
        activeCacheDownloads.delete(cacheKey);
    });
    activeCacheDownloads.set(cacheKey, promise);
    return promise;
}
/**
 * GET /api/yt/search?q=...
 * Search YouTube Music.
 */
router.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim() === '') {
        res.status(400).json({ error: 'Search query is required' });
        return;
    }
    try {
        const results = await (0, youtubeService_1.searchYouTube)(query);
        res.json(results);
    }
    catch (error) {
        console.error('[YT Route] Search error:', error);
        res.status(500).json({ error: 'YouTube search failed' });
    }
});
/**
 * GET /api/yt/stream/:videoId
 *
 * Stream audio via yt-dlp. Two strategies:
 * 1. Extract URL with yt-dlp, then proxy-fetch it (supports Range/seeking)
 * 2. Fallback: pipe yt-dlp stdout directly to response
 */
async function proxyUrl(url, contentType, filesize, req, res, fallback) {
    const rangeHeader = req.headers.range;
    const fetchHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
        fetchHeaders['Range'] = rangeHeader;
    }
    try {
        console.log(`[YT Route] Proxy fetching: ${url}`);
        const response = await fetch(url, { headers: fetchHeaders });
        if (!response.ok && response.status !== 206) {
            console.warn(`[YT Route] Proxy fetch failed (${response.status}) for ${url}`);
            if (response.status === 416) {
                res.writeHead(416, {
                    'Content-Range': response.headers.get('content-range') || `bytes */${filesize}`,
                    'Content-Type': contentType || 'audio/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                });
                if (response.body) {
                    stream_1.Readable.fromWeb(response.body).pipe(res);
                }
                else {
                    res.end();
                }
                return;
            }
            await fallback();
            return;
        }
        const headers = {
            'Content-Type': contentType || response.headers.get('content-type') || 'audio/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=1800',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        };
        const upstreamContentRange = response.headers.get('content-range');
        const upstreamContentLength = response.headers.get('content-length');
        if (upstreamContentRange)
            headers['Content-Range'] = upstreamContentRange;
        if (upstreamContentLength)
            headers['Content-Length'] = upstreamContentLength;
        else if (filesize > 0 && !rangeHeader)
            headers['Content-Length'] = filesize.toString();
        res.writeHead(response.status === 206 ? 206 : 200, headers);
        if (response.body) {
            stream_1.Readable.fromWeb(response.body).pipe(res);
        }
        else {
            res.end();
        }
    }
    catch (err) {
        console.warn(`[YT Route] Proxy fetch network error: ${err.message}. Falling back.`);
        await fallback();
    }
}
/**
 * GET /api/yt/proxy
 * Same-origin CORS proxy relay for client-resolved volunteer streams.
 */
router.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        res.status(400).json({ error: 'URL parameter is required' });
        return;
    }
    const rangeHeader = req.headers.range;
    const fetchHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
        fetchHeaders['Range'] = rangeHeader;
    }
    try {
        console.log(`[YT Route] Proxy relaying URL: ${targetUrl}`);
        const response = await fetch(targetUrl, { headers: fetchHeaders });
        if (!response.ok && response.status !== 206) {
            console.warn(`[YT Route] Proxy relay failed (${response.status}) for ${targetUrl}`);
            res.status(response.status).send(await response.text());
            return;
        }
        const contentType = response.headers.get('content-type') || 'audio/mp4';
        const headers = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=1800',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        };
        const upstreamContentRange = response.headers.get('content-range');
        const upstreamContentLength = response.headers.get('content-length');
        if (upstreamContentRange)
            headers['Content-Range'] = upstreamContentRange;
        if (upstreamContentLength)
            headers['Content-Length'] = upstreamContentLength;
        res.writeHead(response.status === 206 ? 206 : 200, headers);
        if (response.body) {
            stream_1.Readable.fromWeb(response.body).pipe(res);
        }
        else {
            res.end();
        }
    }
    catch (err) {
        console.error('[YT Route] Proxy relay error:', err?.message || err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Relay failed' });
        }
    }
});
/**
 * GET /api/yt/stream/:videoId
 */
router.get('/stream/:videoId', async (req, res) => {
    const { videoId } = req.params;
    const quality = req.query.quality || 'high';
    const validQualities = ['high', 'medium', 'low'];
    const selectedQuality = validQualities.includes(quality) ? quality : 'high';
    const bypassCache = !!req.query.retry;
    if (!videoId || !(0, youtubeService_1.isValidVideoId)(videoId)) {
        res.status(400).json({ error: 'Invalid video ID' });
        return;
    }
    // Quality-aware cache path
    const cacheKey = `${videoId}-${selectedQuality}`;
    const cacheFilePath = path_1.default.join(CACHE_DIR, `${cacheKey}.cache`);
    const metaFilePath = path_1.default.join(CACHE_DIR, `${cacheKey}.meta.json`);
    if (fs_1.default.existsSync(cacheFilePath)) {
        console.log(`[YT Route] Serving ${videoId} (${selectedQuality}) from local cache`);
        let cachedContentType = 'audio/mp4';
        try {
            if (fs_1.default.existsSync(metaFilePath)) {
                const meta = JSON.parse(fs_1.default.readFileSync(metaFilePath, 'utf-8'));
                cachedContentType = meta.contentType || 'audio/mp4';
            }
        }
        catch { }
        res.sendFile(cacheFilePath, {
            headers: {
                'Content-Type': cachedContentType,
                'Cache-Control': 'public, max-age=86400',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            }
        });
        return;
    }
    const isDiskCacheEnabled = process.env.ENABLE_DISK_CACHE !== 'false';
    if (isDiskCacheEnabled) {
        // Run background caching inside queue with capped concurrency
        cacheDownloadQueue.run(() => downloadAndCache(videoId, selectedQuality)).catch((err) => {
            console.error(`[YT Route] Background caching failed for ${videoId}:`, err);
        });
    }
    const handleFailure = async () => {
        await streamViaPipe(videoId, res, req, selectedQuality);
    };
    try {
        const streamInfo = await (0, youtubeService_1.getAudioStreamUrl)(videoId, selectedQuality, bypassCache);
        if (res.destroyed || res.writableEnded) {
            console.log(`[YT Route] Client aborted connection during URL extraction for ${videoId}`);
            return;
        }
        if (streamInfo && streamInfo.url) {
            await proxyUrl(streamInfo.url, streamInfo.contentType, streamInfo.filesize, req, res, handleFailure);
        }
        else {
            await handleFailure();
        }
    }
    catch (error) {
        console.error('[YT Route] Stream error:', error?.message || error);
        if (!res.headersSent) {
            res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
        }
    }
});
/**
 * Fallback streaming: pipe yt-dlp stdout directly to HTTP response.
 */
async function streamViaPipe(videoId, res, req, quality = 'high') {
    let poolHandle;
    try {
        poolHandle = await processPool_1.ytdlpPool.acquire();
    }
    catch (err) {
        if (!res.headersSent) {
            res.status(503).json({ error: 'Server is busy, queue full. Please try again later.' });
        }
        return;
    }
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            poolHandle.release();
        }
    };
    try {
        const { stream, process: child } = await (0, youtubeService_1.spawnAudioStream)(videoId, quality);
        poolHandle.registerProcess(child);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Cache-Control', 'public, max-age=1800');
        res.setHeader('Transfer-Encoding', 'chunked');
        stream.pipe(res);
        stream.on('error', (err) => {
            console.error('[YT Route] Pipe stream error:', err);
            if (!res.writableEnded)
                res.end();
            release();
        });
        child.on('exit', (code) => {
            if (code !== 0) {
                console.warn(`[YT Route] yt-dlp exited with code ${code}`);
            }
            if (!res.writableEnded)
                res.end();
            release();
        });
        req.on('close', () => {
            child.kill('SIGTERM');
            release();
        });
    }
    catch (error) {
        console.error('[YT Route] Pipe fallback error:', error?.message || error);
        if (!res.headersSent) {
            res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
        }
        release();
    }
}
/**
 * GET /api/yt/download/:videoId?name=...
 * Download audio file by piping yt-dlp stdout directly.
 */
router.get('/download/:videoId', async (req, res) => {
    const { videoId } = req.params;
    const downloadName = req.query.name || videoId;
    if (!videoId || !(0, youtubeService_1.isValidVideoId)(videoId)) {
        res.status(400).json({ error: 'Invalid video ID' });
        return;
    }
    const safeName = downloadName.replace(/[<>:"/\\|?*]/g, '_');
    const isCloudHosting = process.env.RENDER === 'true' ||
        process.env.FLY_APP_NAME ||
        process.env.CLOUD_HOSTING === 'true';
    const hasAuth = !!(0, youtubeAuth_1.getCookieHeader)();
    const canUseYtDlp = !isCloudHosting || hasAuth;
    const handleDownloadFailure = async () => {
        if (!canUseYtDlp) {
            if (!res.headersSent) {
                res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
            }
            return;
        }
        let poolHandle;
        try {
            poolHandle = await processPool_1.ytdlpPool.acquire();
        }
        catch (err) {
            if (!res.headersSent) {
                res.status(503).json({ error: 'Server busy. Try again later.' });
            }
            return;
        }
        let released = false;
        const release = () => {
            if (!released) {
                released = true;
                poolHandle.release();
            }
        };
        try {
            const fileName = `${safeName}.m4a`;
            const { stream, process: child } = await (0, youtubeService_1.spawnAudioStream)(videoId);
            poolHandle.registerProcess(child);
            let hasData = false;
            stream.on('data', (chunk) => {
                if (!hasData) {
                    hasData = true;
                    res.setHeader('Content-Type', 'audio/mp4');
                    res.setHeader('Content-Disposition', buildContentDisposition(fileName));
                    res.setHeader('Transfer-Encoding', 'chunked');
                }
                if (!res.writableEnded) {
                    res.write(chunk);
                }
            });
            stream.on('end', () => {
                if (!res.writableEnded)
                    res.end();
                release();
            });
            stream.on('error', (err) => {
                console.error('[YT Route] Download stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download stream failed' });
                }
                else if (!res.writableEnded) {
                    res.end();
                }
                release();
            });
            child.on('exit', (code) => {
                if (!hasData && !res.headersSent) {
                    res.status(500).json({ error: `yt-dlp failed with code ${code}` });
                }
                else if (!res.writableEnded) {
                    res.end();
                }
                release();
            });
            req.on('close', () => {
                child.kill('SIGTERM');
                release();
            });
        }
        catch (error) {
            console.error('[YT Route] Download error:', error?.message || error);
            if (!res.headersSent) {
                res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
            }
            release();
        }
    };
    try {
        const streamInfo = await (0, youtubeService_1.getAudioStreamUrl)(videoId, 'high');
        if (streamInfo && streamInfo.url) {
            const ext = streamInfo.contentType.includes('webm') ? 'webm' : 'm4a';
            const fileName = `${safeName}.${ext}`;
            res.setHeader('Content-Type', streamInfo.contentType);
            res.setHeader('Content-Disposition', buildContentDisposition(fileName));
            if (streamInfo.filesize > 0) {
                res.setHeader('Content-Length', streamInfo.filesize.toString());
            }
            console.log(`[YT Download] Proxy fetching download URL: ${streamInfo.url}`);
            const response = await fetch(streamInfo.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch download stream: ${response.status}`);
            }
            if (response.body) {
                stream_1.Readable.fromWeb(response.body).pipe(res);
            }
            else {
                res.end();
            }
            return;
        }
        else {
            await handleDownloadFailure();
        }
    }
    catch (err) {
        console.error('[YT Download] Proxy download failed, falling back to yt-dlp:', err);
        await handleDownloadFailure();
    }
});
/**
 * GET /api/yt/info/:videoId
 */
router.get('/info/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!videoId || !(0, youtubeService_1.isValidVideoId)(videoId)) {
        res.status(400).json({ error: 'Invalid video ID' });
        return;
    }
    try {
        const info = await (0, youtubeService_1.getVideoInfo)(videoId);
        if (!info) {
            res.status(404).json({ error: 'Video info not found' });
            return;
        }
        res.json(info);
    }
    catch (error) {
        console.error('[YT Route] Info error:', error);
        res.status(500).json({ error: 'Failed to get video info' });
    }
});
/**
 * GET /api/yt/radio
 * Fetch recommended tracks for a song from YouTube Music.
 */
router.get('/radio', async (req, res) => {
    let videoId = req.query.videoId;
    const title = req.query.title;
    const artist = req.query.artist;
    try {
        if (!videoId && title && artist) {
            console.log(`[YT Route] Resolving videoId for similar mix: ${artist} - ${title}`);
            const searchResults = await (0, youtubeService_1.searchYouTube)(`${artist} ${title}`);
            if (searchResults && searchResults.length > 0) {
                videoId = searchResults[0].videoId;
            }
        }
        if (!videoId || !(0, youtubeService_1.isValidVideoId)(videoId)) {
            console.log(`[YT Route] No videoId resolved, falling back to search for radio: ${artist} - ${title}`);
            const searchResults = await (0, youtubeService_1.searchYouTube)(`${artist} ${title}`);
            res.json(searchResults.map(item => ({
                id: `yt-${item.videoId}`,
                title: item.title,
                artist: item.artist,
                album: item.album || 'Single',
                duration: item.duration,
                coverArtUrl: item.coverArtUrl,
                source: 'youtube',
                streamUrl: `/api/yt/stream/${item.videoId}`,
                videoId: item.videoId,
                addedAt: Date.now()
            })));
            return;
        }
        console.log(`[YT Route] Fetching radio recommendations for videoId: ${videoId}`);
        const tracks = await (0, youtubeService_1.getRelatedTracks)(videoId);
        console.log(`[YT Route] Found ${tracks.length} radio recommendations for videoId: ${videoId}`);
        res.json(tracks);
    }
    catch (error) {
        console.error('[YT Route] Radio recommendations error:', error?.message || error);
        res.status(500).json({ error: 'Failed to retrieve radio recommendations' });
    }
});
/**
 * POST /api/yt/prefetch
 * Prefetch stream URLs for upcoming tracks in the background.
 */
router.post('/prefetch', (req, res) => {
    const { videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds)) {
        res.status(400).json({ error: 'videoIds array is required' });
        return;
    }
    // Cap prefetch queue to prevent abuse and unbounded concurrency
    const MAX_PREFETCH = 5;
    const capped = videoIds.slice(0, MAX_PREFETCH);
    for (const id of capped) {
        if (typeof id === 'string' && (0, youtubeService_1.isValidVideoId)(id)) {
            cacheDownloadQueue.run(() => (0, youtubeService_1.getAudioStreamUrl)(id)).catch((err) => {
                console.error(`[YT Route] Prefetch failed for ${id}:`, err?.message || err);
            });
        }
    }
    res.json({ status: 'queued', count: capped.length });
});
/**
 * Diagnostic endpoint to test all InnerTube clients on Render
 */
router.get('/test-clients', async (req, res) => {
    res.json({ message: "youtubei.js has been replaced by custom lightweight InnerTube integration" });
});
/**
 * GET /api/yt/instances
 * Expose working Cobalt instances for client-side resolving fallback.
 */
router.get('/instances', (req, res) => {
    try {
        res.json({ cobalt: (0, youtubeService_1.getCobaltInstances)() });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || error });
    }
});
exports.default = router;
