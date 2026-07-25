import { Router, Request, Response } from 'express';
import { searchYouTube, getAudioStreamUrl, spawnAudioStream, getVideoInfo, isValidVideoId, getRelatedTracks, YT_DLP_PATH, getCobaltInstances, getYtDlpFormatSelector, extToMime, ytDlpReady } from '../services/youtubeService';
import { getCookieFilePath, getCookieHeader } from '../services/youtubeAuth';
import { ytdlpPool } from '../services/processPool';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { Readable } from 'stream';

const router = Router();

const CACHE_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'tracks', 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const activeCacheDownloads = new Map<string, Promise<string>>();

/**
 * Sanitize a filename for use in Content-Disposition headers.
 * Strips control characters and quotes, and produces RFC 5987 encoded value.
 */
function sanitizeFileName(name: string): string {
  // Remove CRLF and other control characters
  const cleaned = name.replace(/[\x00-\x1f\x7f"\\]/g, '_');
  return cleaned;
}

function buildContentDisposition(filename: string): string {
  const safe = sanitizeFileName(filename);
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

class ConcurrencyQueue {
  private activeCount = 0;
  private queue: (() => Promise<any>)[] = [];

  constructor(private limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.next();
        }
      };

      this.queue.push(execute);
      this.next();
    });
  }

  private next() {
    if (this.activeCount < this.limit && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }
}

const cacheDownloadQueue = new ConcurrencyQueue(2);

/**
 * Sniffs the real container format from the first few bytes of an audio payload,
 * independent of whatever Content-Type was declared or expected. YouTube-sourced streams
 * are unreliable about matching their advertised format to their actual bytes, so this is
 * used both for on-disk cache files and for live-proxied streams before we trust a
 * Content-Type header enough to hand it to the browser's media element.
 */
function sniffAudioMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // EBML (WebM/Matroska)
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }
  // ftyp box (MP4/M4A) — 4-byte box size, then 'ftyp' at offset 4
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }
  // ID3-tagged MP3
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }
  // Raw MPEG frame sync
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  return null;
}

/**
 * Rough heuristic for "this isn't media at all, it's an error page or JSON blob" — the
 * first non-whitespace byte of a JSON or HTML error response is almost always '{', '[',
 * or '<'. None of those can legitimately open a WebM/MP4/MP3 container.
 */
function looksLikeNonMediaPayload(buffer: Buffer): boolean {
  const firstMeaningfulByte = buffer.find(b => b !== 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09);
  return firstMeaningfulByte === 0x7b /* { */ ||
         firstMeaningfulByte === 0x5b /* [ */ ||
         firstMeaningfulByte === 0x3c /* < */;
}

function detectMimeTypeFromFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = Buffer.alloc(8);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 8, 0);
      fs.closeSync(fd);
      return sniffAudioMimeType(buffer) || 'audio/mp4';
    }
  } catch (e) {
    console.warn('[Cache Manager] Failed to detect mime type from file content:', e);
  }
  return 'audio/mp4'; // default fallback
}

function pruneDiskCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    const maxCacheSizeBytes = 1024 * 1024 * 1024 * 2; // 2 GB limit
    let totalSize = 0;
    
    const fileInfos = files
      .filter(f => f.endsWith('.cache'))
      .map(f => {
        const filePath = path.join(CACHE_DIR, f);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        return { name: f, path: filePath, size: stats.size, mtime: stats.mtimeMs };
      });

    if (totalSize > maxCacheSizeBytes) {
      console.log(`[Cache Manager] Cache size: ${(totalSize / 1024 / 1024).toFixed(2)} MB / 2000 MB — pruning...`);
      fileInfos.sort((a, b) => a.mtime - b.mtime);
      let deletedSize = 0;
      for (const info of fileInfos) {
        try {
          fs.unlinkSync(info.path);
          // Also delete companion .meta.json
          const metaFile = info.path.replace(/\.cache$/, '.meta.json');
          if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
          deletedSize += info.size;
          totalSize -= info.size;
          console.log(`[Cache Manager] Evicted oldest cached file: ${info.name}`);
        } catch {}
        if (totalSize <= maxCacheSizeBytes * 0.7) {
          break;
        }
      }
      console.log(`[Cache Manager] Eviction completed. Freed ${(deletedSize / 1024 / 1024).toFixed(2)} MB`);
    }
  } catch (err) {
    console.error('[Cache Manager] Error cleaning cache:', err);
  }
}

// Run on startup
pruneDiskCache();

function downloadAndCache(videoId: string, quality: string): Promise<string> {
  const cacheKey = `${videoId}-${quality}`;
  const existing = activeCacheDownloads.get(cacheKey);
  if (existing) return existing;

  const tempPath = path.join(CACHE_DIR, `${cacheKey}.tmp`);
  const finalPath = path.join(CACHE_DIR, `${cacheKey}.cache`);
  const metaPath = path.join(CACHE_DIR, `${cacheKey}.meta.json`);

  const promise = new Promise<string>(async (resolve, reject) => {
    if (fs.existsSync(finalPath)) {
      resolve(finalPath);
      return;
    }

    console.log(`[Cache Manager] Starting background cache download for ${videoId} (quality: ${quality})...`);
    try {
      const selectedQuality = quality as 'high' | 'medium' | 'low';
      const streamInfo = await getAudioStreamUrl(videoId, selectedQuality);
      if (streamInfo && streamInfo.url) {
        console.log(`[Cache Manager] Fetching stream from ${streamInfo.url} for caching...`);
        const response = await fetch(streamInfo.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
        }
        if (!response.body) {
          throw new Error('Response body is empty');
        }

        const fileStream = fs.createWriteStream(tempPath);
        const nodeStream = Readable.fromWeb(response.body as any);

        await new Promise<void>((resolveWrite, rejectWrite) => {
          nodeStream.pipe(fileStream);
          fileStream.on('finish', resolveWrite);
          fileStream.on('error', rejectWrite);
          nodeStream.on('error', rejectWrite);
        });

        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, finalPath);
          // Write companion metadata file
          try {
            const detectedMime = detectMimeTypeFromFile(finalPath);
            fs.writeFileSync(metaPath, JSON.stringify({
              contentType: detectedMime,
              title: streamInfo.title,
              artist: streamInfo.artist,
              duration: streamInfo.duration,
            }));
          } catch (metaErr) {
            console.warn(`[Cache Manager] Failed to write meta for ${videoId}:`, metaErr);
          }
          console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully.`);
          pruneDiskCache(); // Prune after successful write
          resolve(finalPath);
        } else {
          throw new Error('Temp file not found after download');
        }
      } else {
        throw new Error('Could not get audio stream URL for caching');
      }
    } catch (err: any) {
      console.error(`[Cache Manager] Cache download failed for ${videoId}, falling back to yt-dlp:`, err?.message || err);

      try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const formatSelector = getYtDlpFormatSelector(quality as 'high' | 'medium' | 'low');

        const args = [
          '--no-warnings',
          '--no-playlist',
          '-f', formatSelector,
          '--no-check-formats',
          '--no-check-certificate',
        ];
        const cookieFilePath = getCookieFilePath();
        if (cookieFilePath) {
          args.push('--cookies', cookieFilePath);
        }
        args.push('-o', tempPath, ytUrl);

        await ytDlpReady;
        const child = spawn(YT_DLP_PATH, args, {
          stdio: ['ignore', 'ignore', 'pipe']
        });

        child.on('error', (err: any) => {
          console.warn(`[Cache Manager] yt-dlp spawn error: ${err.message}. If running on Termux, install with: pkg install yt-dlp`);
          if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch {}
          }
          reject(err);
        });

        child.stderr?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`[Cache yt-dlp stderr] ${msg}`);
        });

        child.on('exit', (code) => {
          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              fs.renameSync(tempPath, finalPath);
              const detectedMime = detectMimeTypeFromFile(finalPath);
              try {
                fs.writeFileSync(metaPath, JSON.stringify({ contentType: detectedMime }));
              } catch {}
              console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully via yt-dlp fallback.`);
              pruneDiskCache(); // Prune after successful write
              resolve(finalPath);
            } catch (renameErr) {
              console.error(`[Cache Manager] Rename failed for ${videoId}:`, renameErr);
              reject(renameErr);
            }
          } else {
            console.error(`[Cache Manager] yt-dlp fallback failed with code ${code} for ${videoId}`);
            if (fs.existsSync(tempPath)) {
              try { fs.unlinkSync(tempPath); } catch {}
            }
            reject(new Error(`yt-dlp failed with code ${code}`));
          }
        });
      } catch (ytDlpErr: any) {
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
router.get('/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim() === '') {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const results = await searchYouTube(query);
    res.json(results);
  } catch (error) {
    console.error('[YT Route] Search error:', error);
    res.status(500).json({ error: 'YouTube search failed' });
  }
});

/**
 * Reads the first `peekBytes` off a Web ReadableStream without discarding the rest — returns
 * the peeked prefix plus a Node Readable that replays the prefix and then continues from
 * wherever the reader left off. Lets us sniff real content before committing to piping it
 * to the client, without buffering the whole response into memory.
 */
function peekWebStream(body: any, peekBytes: number): Promise<{ prefix: Buffer; stream: Readable }> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let collected = 0;

  const readPrefix = async (): Promise<Buffer> => {
    while (collected < peekBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        chunks.push(chunk);
        collected += chunk.length;
      }
    }
    return Buffer.concat(chunks);
  };

  return readPrefix().then((prefix) => {
    const stream = new Readable({ read() {} });
    if (prefix.length > 0) stream.push(prefix);

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) stream.push(Buffer.from(value));
        }
        stream.push(null);
      } catch (err) {
        stream.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return { prefix, stream };
  });
}

/**
 * GET /api/yt/stream/:videoId
 * 
 * Stream audio via yt-dlp. Two strategies:
 * 1. Extract URL with yt-dlp, then proxy-fetch it (supports Range/seeking)
 * 2. Fallback: pipe yt-dlp stdout directly to response
 */
async function proxyUrl(
  url: string,
  contentType: string | null,
  filesize: number,
  req: Request,
  res: Response,
  fallback: () => Promise<void>
): Promise<void> {
  const rangeHeader = req.headers.range;
  const fetchHeaders: Record<string, string> = {
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
          Readable.fromWeb(response.body as any).pipe(res);
        } else {
          res.end();
        }
        return;
      }
      await fallback();
      return;
    }

    if (!response.body) {
      console.warn(`[YT Route] Proxy fetch had no body for ${url}`);
      await fallback();
      return;
    }

    // Peek at the real bytes before trusting any declared Content-Type. YouTube-sourced
    // URLs occasionally answer with a 200/206 carrying a small JSON/HTML error payload
    // instead of media (stale signature, client/UA mismatch, throttling) — piping that
    // straight through labeled as audio/mp4 is exactly what produces the browser's
    // "DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed".
    const { prefix, stream: nodeStream } = await peekWebStream(response.body as any, 12);

    if (prefix.length === 0) {
      console.warn(`[YT Route] Upstream returned an empty body for ${url}`);
      nodeStream.destroy();
      await fallback();
      return;
    }

    if (looksLikeNonMediaPayload(prefix)) {
      const snippet = prefix.toString('utf-8').replace(/[\x00-\x1f]/g, '');
      console.warn(`[YT Route] Upstream returned a non-media payload for ${url}: ${snippet}`);
      nodeStream.destroy();
      await fallback();
      return;
    }

    const sniffedType = sniffAudioMimeType(prefix);
    const finalContentType = sniffedType || contentType || response.headers.get('content-type') || 'audio/mp4';

    const headers: Record<string, string> = {
      'Content-Type': finalContentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    };

    const upstreamContentRange = response.headers.get('content-range');
    const upstreamContentLength = response.headers.get('content-length');

    if (upstreamContentRange) headers['Content-Range'] = upstreamContentRange;
    if (upstreamContentLength) headers['Content-Length'] = upstreamContentLength;
    else if (filesize > 0 && !rangeHeader) headers['Content-Length'] = filesize.toString();

    res.writeHead(response.status === 206 ? 206 : 200, headers);

    nodeStream.pipe(res);
    req.on('close', () => {
      try { nodeStream.destroy(); } catch {}
    });
  } catch (err: any) {
    console.warn(`[YT Route] Proxy fetch network error: ${err.message}. Falling back.`);
    await fallback();
  }
}

/**
 * GET /api/yt/proxy
 * Same-origin CORS proxy relay for client-resolved volunteer streams.
 */
router.get('/proxy', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).json({ error: 'URL parameter is required' });
    return;
  }

  const rangeHeader = req.headers.range;
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)',
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

    if (!response.body) {
      res.end();
      return;
    }

    const { prefix, stream: nodeStream } = await peekWebStream(response.body as any, 12);

    if (prefix.length === 0) {
      console.warn(`[YT Route] Proxy relay got an empty body from ${targetUrl}`);
      nodeStream.destroy();
      res.status(502).json({ error: 'Upstream returned an empty response' });
      return;
    }

    if (looksLikeNonMediaPayload(prefix)) {
      const snippet = prefix.toString('utf-8').replace(/[\x00-\x1f]/g, '');
      console.warn(`[YT Route] Proxy relay got a non-media payload from ${targetUrl}: ${snippet}`);
      nodeStream.destroy();
      res.status(502).json({ error: 'Upstream did not return media' });
      return;
    }

    const sniffedType = sniffAudioMimeType(prefix);
    const contentType = sniffedType || response.headers.get('content-type') || 'audio/mp4';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    };

    const upstreamContentRange = response.headers.get('content-range');
    const upstreamContentLength = response.headers.get('content-length');

    if (upstreamContentRange) headers['Content-Range'] = upstreamContentRange;
    if (upstreamContentLength) headers['Content-Length'] = upstreamContentLength;

    res.writeHead(response.status === 206 ? 206 : 200, headers);
    nodeStream.pipe(res);
  } catch (err: any) {
    console.error('[YT Route] Proxy relay error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Relay failed' });
    }
  }
});

/**
 * GET /api/yt/stream/:videoId
 */
router.get('/stream/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const quality = (req.query.quality as string) || 'high';
  const validQualities = ['high', 'medium', 'low'];
  const selectedQuality = validQualities.includes(quality) ? quality as 'high' | 'medium' | 'low' : 'high';
  const bypassCache = !!req.query.retry;

  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  // Quality-aware cache path
  const cacheKey = `${videoId}-${selectedQuality}`;
  const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.cache`);
  const metaFilePath = path.join(CACHE_DIR, `${cacheKey}.meta.json`);
  if (fs.existsSync(cacheFilePath)) {
    console.log(`[YT Route] Serving ${videoId} (${selectedQuality}) from local cache`);
    let cachedContentType = 'audio/mp4';
    try {
      if (fs.existsSync(metaFilePath)) {
        const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
        cachedContentType = meta.contentType || 'audio/mp4';
      }
    } catch {}
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
    const streamInfo = await getAudioStreamUrl(videoId, selectedQuality, bypassCache);
    
    if (res.destroyed || res.writableEnded) {
      console.log(`[YT Route] Client aborted connection during URL extraction for ${videoId}`);
      return;
    }
    
    if (streamInfo && streamInfo.url) {
      await proxyUrl(streamInfo.url, streamInfo.contentType, streamInfo.filesize, req, res, handleFailure);
    } else {
      await handleFailure();
    }
  } catch (error: any) {
    console.error('[YT Route] Stream error:', error?.message || error);
    if (!res.headersSent) {
      res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
    }
  }
});

/**
 * Fallback streaming: pipe yt-dlp stdout directly to HTTP response.
 */
async function streamViaPipe(videoId: string, res: Response, req: Request, quality: 'high' | 'medium' | 'low' = 'high') {
  let poolHandle;
  try {
    poolHandle = await ytdlpPool.acquire();
  } catch (err: any) {
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
    const { stream, process: child } = await spawnAudioStream(videoId, quality);
    poolHandle.registerProcess(child);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Transfer-Encoding', 'chunked');

    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('[YT Route] Pipe stream error:', err);
      if (!res.writableEnded) res.end();
      release();
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[YT Route] yt-dlp exited with code ${code}`);
      }
      if (!res.writableEnded) res.end();
      release();
    });

    req.on('close', () => {
      child.kill('SIGTERM');
      release();
    });
  } catch (error: any) {
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
router.get('/download/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const downloadName = (req.query.name as string) || videoId;

  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  const safeName = downloadName.replace(/[<>:"/\\|?*]/g, '_');
  const isCloudHosting = process.env.RENDER === 'true' || 
                         process.env.FLY_APP_NAME || 
                         process.env.CLOUD_HOSTING === 'true';
  const hasAuth = !!getCookieHeader();
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
      poolHandle = await ytdlpPool.acquire();
    } catch (err: any) {
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
      const { stream, process: child } = await spawnAudioStream(videoId);
      poolHandle.registerProcess(child);

      let hasData = false;

      stream.on('data', (chunk: Buffer) => {
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
        if (!res.writableEnded) res.end();
        release();
      });

      stream.on('error', (err) => {
        console.error('[YT Route] Download stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download stream failed' });
        } else if (!res.writableEnded) {
          res.end();
        }
        release();
      });

      child.on('exit', (code) => {
        if (!hasData && !res.headersSent) {
          res.status(500).json({ error: `yt-dlp failed with code ${code}` });
        } else if (!res.writableEnded) {
          res.end();
        }
        release();
      });

      req.on('close', () => {
        child.kill('SIGTERM');
        release();
      });
    } catch (error: any) {
      console.error('[YT Route] Download error:', error?.message || error);
      if (!res.headersSent) {
        res.status(404).json({ error: 'UNABLE_TO_RESOLVE', code: 'UNABLE_TO_RESOLVE' });
      }
      release();
    }
  };

  try {
    const streamInfo = await getAudioStreamUrl(videoId, 'high');
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
        Readable.fromWeb(response.body as any).pipe(res);
      } else {
        res.end();
      }
      return;
    } else {
      await handleDownloadFailure();
    }
  } catch (err) {
    console.error('[YT Download] Proxy download failed, falling back to yt-dlp:', err);
    await handleDownloadFailure();
  }
});

/**
 * GET /api/yt/info/:videoId
 */
router.get('/info/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  try {
    const info = await getVideoInfo(videoId);
    if (!info) {
      res.status(404).json({ error: 'Video info not found' });
      return;
    }
    res.json(info);
  } catch (error) {
    console.error('[YT Route] Info error:', error);
    res.status(500).json({ error: 'Failed to get video info' });
  }
});

/**
 * GET /api/yt/radio
 * Fetch recommended tracks for a song from YouTube Music.
 */
router.get('/radio', async (req: Request, res: Response) => {
  let videoId = req.query.videoId as string;
  const title = req.query.title as string;
  const artist = req.query.artist as string;

  try {
    if (!videoId && title && artist) {
      console.log(`[YT Route] Resolving videoId for similar mix: ${artist} - ${title}`);
      const searchResults = await searchYouTube(`${artist} ${title}`);
      if (searchResults && searchResults.length > 0) {
        videoId = searchResults[0].videoId;
      }
    }

    if (!videoId || !isValidVideoId(videoId)) {
      console.log(`[YT Route] No videoId resolved, falling back to search for radio: ${artist} - ${title}`);
      const searchResults = await searchYouTube(`${artist} ${title}`);
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
    const tracks = await getRelatedTracks(videoId);

    console.log(`[YT Route] Found ${tracks.length} radio recommendations for videoId: ${videoId}`);
    res.json(tracks);
  } catch (error: any) {
    console.error('[YT Route] Radio recommendations error:', error?.message || error);
    res.status(500).json({ error: 'Failed to retrieve radio recommendations' });
  }
});

/**
 * POST /api/yt/prefetch
 * Prefetch stream URLs for upcoming tracks in the background.
 */
router.post('/prefetch', (req: Request, res: Response) => {
  const { videoIds } = req.body as { videoIds: string[] };

  if (!videoIds || !Array.isArray(videoIds)) {
    res.status(400).json({ error: 'videoIds array is required' });
    return;
  }

  // Cap prefetch queue to prevent abuse and unbounded concurrency
  const MAX_PREFETCH = 5;
  const capped = videoIds.slice(0, MAX_PREFETCH);

  for (const id of capped) {
    if (typeof id === 'string' && isValidVideoId(id)) {
      cacheDownloadQueue.run(() => getAudioStreamUrl(id)).catch((err) => {
        console.error(`[YT Route] Prefetch failed for ${id}:`, err?.message || err);
      });
    }
  }

  res.json({ status: 'queued', count: capped.length });
});

/**
 * Diagnostic endpoint to test all InnerTube clients on Render
 */
router.get('/test-clients', async (req: Request, res: Response) => {
  res.json({ message: "youtubei.js has been replaced by custom lightweight InnerTube integration" });
});

/**
 * GET /api/yt/instances
 * Expose working Cobalt instances for client-side resolving fallback.
 */
router.get('/instances', (req: Request, res: Response) => {
  try {
    res.json({ cobalt: getCobaltInstances() });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || error });
  }
});

export default router;
