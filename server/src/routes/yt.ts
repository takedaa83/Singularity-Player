import { Router, Request, Response } from 'express';
import { searchYouTube, getAudioStreamUrl, spawnAudioStream, getVideoInfo, isValidVideoId, getRelatedTracks, YT_DLP_PATH, getCobaltInstances, getYtDlpFormatSelector, extToMime } from '../services/youtubeService';
import { getCookieFilePath } from '../services/youtubeAuth';
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
            fs.writeFileSync(metaPath, JSON.stringify({
              contentType: streamInfo.contentType || 'audio/mp4',
              title: streamInfo.title,
              artist: streamInfo.artist,
              duration: streamInfo.duration,
            }));
          } catch (metaErr) {
            console.warn(`[Cache Manager] Failed to write meta for ${videoId}:`, metaErr);
          }
          console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully.`);
          cleanCacheOnStartup(); // Prune after successful write
          resolve(finalPath);
        } else {
          throw new Error('Temp file not found after download');
        }
      } else {
        throw new Error('Could not get audio stream URL for caching');
      }
    } catch (err: any) {
      console.error(`[Cache Manager] Cache download failed for ${videoId}, falling back to yt-dlp:`, err?.message || err);

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

      const child = spawn(YT_DLP_PATH, args, {
        stdio: ['ignore', 'ignore', 'pipe']
      });

      child.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Cache yt-dlp stderr] ${msg}`);
      });

      child.on('exit', (code) => {
        if (code === 0 && fs.existsSync(tempPath)) {
          try {
            fs.renameSync(tempPath, finalPath);
            // yt-dlp doesn't reliably tell us the format, default to audio/mp4
            try {
              fs.writeFileSync(metaPath, JSON.stringify({ contentType: 'audio/mp4' }));
            } catch {}
            console.log(`[Cache Manager] Cached track ${videoId} (${quality}) successfully via yt-dlp fallback.`);
            cleanCacheOnStartup(); // Prune after successful write
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
    }
  }).finally(() => {
    activeCacheDownloads.delete(cacheKey);
  });

  activeCacheDownloads.set(cacheKey, promise);
  return promise;
}

function cleanCacheOnStartup() {
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

cleanCacheOnStartup();

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
 * GET /api/yt/stream/:videoId
 * 
 * Stream audio via yt-dlp. Two strategies:
 * 1. Extract URL with yt-dlp, then proxy-fetch it (supports Range/seeking)
 * 2. Fallback: pipe yt-dlp stdout directly to response
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
    // Read content type from meta file if available
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
        'Accept-Ranges': 'bytes'
      }
    });
    return;
  }

  const isCloudHosting = process.env.RENDER === 'true' || 
                         process.env.FLY_APP_NAME || 
                         process.env.CLOUD_HOSTING === 'true';

  // Background caching is disabled by default on cloud hosting to avoid datacenter IP bans and spammy logs.
  const isDiskCacheEnabled = process.env.ENABLE_DISK_CACHE === 'true' || 
                             (process.env.ENABLE_DISK_CACHE !== 'false' && !isCloudHosting);

  if (isDiskCacheEnabled) {
    downloadAndCache(videoId, selectedQuality).catch((err) => {
      console.error(`[YT Route] Background caching failed for ${videoId}:`, err);
    });
  } else {
    console.log(`[YT Route] Background caching is disabled (ENABLE_DISK_CACHE=false or cloud hosting detected)`);
  }

  try {
    // Strategy 1: Extract URL and proxy-fetch (supports seeking)
    const streamInfo = await getAudioStreamUrl(videoId, selectedQuality, bypassCache);
    
    if (res.destroyed || res.writableEnded) {
      console.log(`[YT Route] Client aborted connection during URL extraction for ${videoId}`);
      return;
    }
    
    if (streamInfo && streamInfo.url) {
      const { url, contentType, filesize } = streamInfo;

      // If the URL is not a direct YouTube URL (e.g. Cobalt tunnel stream), redirect the client directly.
      // This leverages the client's residential IP to bypass server-side datacenter blocks.
      if (!url.includes('googlevideo.com') && !url.includes('youtube.com')) {
        console.log(`[YT Route] Redirecting client directly to Cobalt/tunnel stream URL: ${url}`);
        res.redirect(302, url);
        return;
      }

      const rangeHeader = req.headers.range;

      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (rangeHeader) {
        fetchHeaders['Range'] = rangeHeader;
      }

      try {
        console.log(`[YT Route] Proxy fetching via fetch: ${url}`);
        const response = await fetch(url, {
          headers: fetchHeaders
        });

        if (!response.ok && response.status !== 206) {
          let errText = '';
          try {
            errText = await response.text();
          } catch (e: any) {
            errText = `(failed to read body: ${e.message})`;
          }
          
          console.warn(`[YT Route] Proxy fetch failed (${response.status}) for ${url}. Response body: ${errText.substring(0, 500)}. Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);

          if (response.status === 416) {
            // Forward 416 Range Not Satisfiable correctly to the browser
            res.writeHead(416, {
              'Content-Range': response.headers.get('content-range') || `bytes */${filesize}`,
              'Content-Type': contentType || 'audio/mp4',
            });
            if (response.body) {
              Readable.fromWeb(response.body as any).pipe(res);
            } else {
              res.end();
            }
            return;
          }

          // URL might be expired, fall through to Strategy 2
          streamViaPipe(videoId, res, req, selectedQuality);
          return;
        }

        // Set response headers
        const headers: Record<string, string> = {
          'Content-Type': contentType || 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=1800',
        };

        const upstreamContentRange = response.headers.get('content-range');
        const upstreamContentLength = response.headers.get('content-length');

        if (upstreamContentRange) headers['Content-Range'] = upstreamContentRange;
        if (upstreamContentLength) headers['Content-Length'] = upstreamContentLength;
        else if (filesize > 0 && !rangeHeader) headers['Content-Length'] = filesize.toString();

        res.writeHead(response.status === 206 ? 206 : 200, headers);
        
        if (response.body) {
          Readable.fromWeb(response.body as any).pipe(res);
        } else {
          res.end();
        }
      } catch (fetchErr: any) {
        // DNS/network error — fall back to Strategy 2
        console.warn(`[YT Route] Proxy fetch error (DNS/network): ${fetchErr.message}. Falling back to pipe.`);
        if (!res.headersSent) {
          streamViaPipe(videoId, res, req, selectedQuality);
        }
      }
    } else {
      if (res.destroyed || res.writableEnded) return;
      // Strategy 2: Direct pipe from yt-dlp stdout
      return streamViaPipe(videoId, res, req, selectedQuality);
    }
  } catch (error: any) {
    console.error('[YT Route] Stream error:', error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream failed' });
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
    const { stream, process: child } = spawnAudioStream(videoId, quality);
    poolHandle.registerProcess(child);

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
      res.status(500).json({ error: 'Stream failed' });
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

  // Try to download using deciphered streaming URL via proxy-fetch first (bypasses yt-dlp blocks on Render)
  try {
    const streamInfo = await getAudioStreamUrl(videoId, 'high');
    if (streamInfo && streamInfo.url) {
      // If the URL is not a direct YouTube URL (e.g. Cobalt tunnel stream), redirect the client directly.
      // This leverages the client's residential IP to bypass server-side datacenter blocks.
      if (!streamInfo.url.includes('googlevideo.com') && !streamInfo.url.includes('youtube.com')) {
        console.log(`[YT Download] Redirecting client directly to Cobalt/tunnel stream URL for download: ${streamInfo.url}`);
        res.redirect(302, streamInfo.url);
        return;
      }

      const ext = streamInfo.contentType.includes('webm') ? 'webm' : 'm4a';
      const fileName = `${safeName}.${ext}`;
      
      res.setHeader('Content-Type', streamInfo.contentType);
      res.setHeader('Content-Disposition', buildContentDisposition(fileName));
      if (streamInfo.filesize > 0) {
        res.setHeader('Content-Length', streamInfo.filesize.toString());
      }
      
      console.log(`[YT Download] Proxy fetching via fetch: ${streamInfo.url}`);
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
    }
  } catch (err) {
    console.error('[YT Download] Proxy download failed, falling back to yt-dlp:', err);
  }

  let poolHandle;
  try {
    poolHandle = await ytdlpPool.acquire();
  } catch (err: any) {
    res.status(503).json({ error: 'Server busy. Try again later.' });
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

    // Pipe yt-dlp output directly — most reliable approach
    const { stream, process: child } = spawnAudioStream(videoId);
    poolHandle.registerProcess(child);

    let hasData = false;

    stream.on('data', (chunk: Buffer) => {
      if (!hasData) {
        // Send headers on first data chunk (proves yt-dlp is working)
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
        // yt-dlp exited without producing data
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
      res.status(500).json({ error: 'Download failed' });
    }
    release();
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
  const MAX_PREFETCH = 10;
  const capped = videoIds.slice(0, MAX_PREFETCH);

  for (const id of capped) {
    if (typeof id === 'string' && isValidVideoId(id)) {
      getAudioStreamUrl(id).catch((err) => {
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
