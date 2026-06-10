import { Router, Request, Response } from 'express';
import { searchYouTube, getAudioStreamUrl, spawnAudioStream, getVideoInfo, isValidVideoId, getClient, YT_DLP_PATH } from '../services/youtubeService';
import { ytdlpPool } from '../services/processPool';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const router = Router();

const CACHE_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'tracks', 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const activeCacheDownloads = new Map<string, Promise<string>>();

function downloadAndCache(videoId: string, quality: string): Promise<string> {
  const existing = activeCacheDownloads.get(videoId);
  if (existing) return existing;

  const tempPath = path.join(CACHE_DIR, `${videoId}.tmp`);
  const finalPath = path.join(CACHE_DIR, `${videoId}.cache`);

  const promise = new Promise<string>((resolve, reject) => {
    if (fs.existsSync(finalPath)) {
      resolve(finalPath);
      return;
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const formatSelector = quality === 'low' 
      ? '249/250/bestaudio/140' 
      : quality === 'medium' 
        ? '140/bestaudio[acodec=aac]/bestaudio' 
        : 'bestaudio[acodec=opus]/bestaudio[acodec=aac]/bestaudio/251/140';

    console.log(`[Cache Manager] Starting background cache download for ${videoId}...`);
    
    const child = spawn(YT_DLP_PATH, [
      '--no-warnings',
      '--no-playlist',
      '-f', formatSelector,
      '--no-check-formats',
      '--no-check-certificate',
      '-o', tempPath,
      ytUrl
    ], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    child.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Cache yt-dlp stderr] ${msg}`);
    });

    child.on('exit', (code) => {
      activeCacheDownloads.delete(videoId);
      if (code === 0 && fs.existsSync(tempPath)) {
        try {
          fs.renameSync(tempPath, finalPath);
          console.log(`[Cache Manager] Cached track ${videoId} successfully.`);
          resolve(finalPath);
        } catch (err) {
          console.error(`[Cache Manager] Rename failed for ${videoId}:`, err);
          reject(err);
        }
      } else {
        console.error(`[Cache Manager] yt-dlp failed with code ${code} for ${videoId}`);
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        reject(new Error(`yt-dlp failed with code ${code}`));
      }
    });
  });

  activeCacheDownloads.set(videoId, promise);
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

    console.log(`[Cache Manager] Cache size: ${(totalSize / 1024 / 1024).toFixed(2)} MB / 2000 MB`);

    if (totalSize > maxCacheSizeBytes) {
      fileInfos.sort((a, b) => a.mtime - b.mtime);
      let deletedSize = 0;
      for (const info of fileInfos) {
        try {
          fs.unlinkSync(info.path);
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
    console.error('[Cache Manager] Error cleaning cache on startup:', err);
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

  const cacheFilePath = path.join(CACHE_DIR, `${videoId}.cache`);
  if (fs.existsSync(cacheFilePath)) {
    console.log(`[YT Route] Serving ${videoId} from local cache`);
    res.sendFile(cacheFilePath, {
      headers: {
        'Content-Type': 'audio/mp4',
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes'
      }
    });
    return;
  }

  // Trigger background caching
  downloadAndCache(videoId, selectedQuality).catch((err) => {
    console.error(`[YT Route] Background caching failed for ${videoId}:`, err);
  });

  try {
    // Strategy 1: Extract URL and proxy-fetch (supports seeking)
    const streamInfo = await getAudioStreamUrl(videoId, selectedQuality, bypassCache);
    
    if (res.destroyed || res.writableEnded) {
      console.log(`[YT Route] Client aborted connection during URL extraction for ${videoId}`);
      return;
    }
    
    if (streamInfo && streamInfo.url) {
      const { url, contentType, filesize } = streamInfo;
      const rangeHeader = req.headers.range;

      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (rangeHeader) {
        fetchHeaders['Range'] = rangeHeader;
      }

      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: fetchHeaders
      };

      const upstreamReq = https.request(options, (upstreamRes) => {
        if (upstreamRes.statusCode !== 200 && upstreamRes.statusCode !== 206) {
          if (upstreamRes.statusCode === 416) {
            // Forward 416 Range Not Satisfiable correctly to the browser instead of falling back to full stream pipe
            res.writeHead(416, {
              'Content-Range': upstreamRes.headers['content-range'] || `bytes */${filesize}`,
              'Content-Type': contentType || 'audio/mp4',
            });
            upstreamRes.pipe(res);
            return;
          }

          // URL might be expired, fall through to Strategy 2
          console.warn(`[YT Route] Proxy fetch failed (${upstreamRes.statusCode}), falling back to direct pipe`);
          streamViaPipe(videoId, res, req, selectedQuality);
          return;
        }

        // Set response headers
        const headers: Record<string, string> = {
          'Content-Type': contentType || 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=1800',
        };

        const upstreamContentRange = upstreamRes.headers['content-range'];
        const upstreamContentLength = upstreamRes.headers['content-length'];

        if (upstreamContentRange) headers['Content-Range'] = upstreamContentRange as string;
        if (upstreamContentLength) headers['Content-Length'] = upstreamContentLength as string;
        else if (filesize > 0 && !rangeHeader) headers['Content-Length'] = filesize.toString();

        res.writeHead(upstreamRes.statusCode === 206 ? 206 : 200, headers);
        
        upstreamRes.pipe(res);
      });

      upstreamReq.on('error', (err) => {
        console.error('[YT Route] Upstream proxy request error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
        }
      });

      req.on('close', () => {
        upstreamReq.destroy();
      });

      upstreamReq.end();
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
    const safeName = downloadName.replace(/[<>:"/\\|?*]/g, '_');
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
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
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
    const yt = await getClient();

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
    const related = await (yt.music as any).getRelated(videoId);
    const tracks: any[] = [];

    if (related && Array.isArray(related.contents)) {
      for (const shelf of related.contents) {
        if (shelf.type === 'MusicCarouselShelf' && Array.isArray(shelf.contents)) {
          for (const item of shelf.contents) {
            if (item.type === 'MusicResponsiveListItem' && item.id && item.title) {
              const itemTitle = item.title;
              let itemArtist = 'Unknown Artist';
              if (item.artists && Array.isArray(item.artists)) {
                itemArtist = item.artists.map((a: any) => a.name).join(', ');
              } else if (item.author && item.author.name) {
                itemArtist = item.author.name;
              }
              
              let coverUrl = null;
              if (item.thumbnails && Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
                const sorted = [...item.thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
                coverUrl = sorted[0]?.url || null;
              }

              if (!tracks.some(t => t.videoId === item.id)) {
                tracks.push({
                  id: `yt-${item.id}`,
                  title: itemTitle,
                  artist: itemArtist,
                  album: item.album?.name || 'Single',
                  duration: item.duration?.seconds || 0,
                  coverArtUrl: coverUrl,
                  source: 'youtube',
                  streamUrl: `/api/yt/stream/${item.id}`,
                  videoId: item.id,
                  addedAt: Date.now()
                });
              }
            }
          }
        }
      }
    }

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

  for (const id of videoIds) {
    if (typeof id === 'string' && isValidVideoId(id)) {
      getAudioStreamUrl(id).catch((err) => {
        console.error(`[YT Route] Prefetch failed for ${id}:`, err?.message || err);
      });
    }
  }

  res.json({ status: 'queued' });
});

export default router;
