import { Router, Request, Response } from 'express';
import { searchYouTube, getAudioStreamUrl, spawnAudioStream, getVideoInfo, isValidVideoId, getClient } from '../services/youtubeService';
import { ytdlpPool } from '../services/processPool';
import https from 'https';

const router = Router();

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

  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  try {
    // Strategy 1: Extract URL and proxy-fetch (supports seeking)
    const streamInfo = await getAudioStreamUrl(videoId);
    
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
          streamViaPipe(videoId, res, req);
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
      return streamViaPipe(videoId, res, req);
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
async function streamViaPipe(videoId: string, res: Response, req: Request) {
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
    const { stream, process: child } = spawnAudioStream(videoId);
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
                // Try to get a high-quality thumbnail if possible, or fallback to first one
                coverUrl = item.thumbnails[0].url || null;
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
