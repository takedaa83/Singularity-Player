import { Router, Request, Response } from 'express';
import { fetchLyrics, saveLyrics, clearLyricsCache } from '../services/lyricsService';
import { SearchService } from '../services/searchService';

const router = Router();

// GET /api/lyrics?track=...&artist=...&album=...&duration=...
router.get('/', async (req: Request, res: Response) => {
  const track = req.query.track as string;
  const artist = req.query.artist as string;
  const album = req.query.album as string | undefined;
  const duration = req.query.duration ? parseFloat(req.query.duration as string) : undefined;

  if (!track || !artist) {
    res.status(400).json({ error: 'track and artist parameters are required' });
    return;
  }

  try {
    const result = await fetchLyrics(track, artist, album, duration);
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'No lyrics found' });
    }
  } catch (error) {
    console.error('[Lyrics Route] Error:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

// POST /api/lyrics/save
router.post('/save', async (req: Request, res: Response) => {
  const { track, artist, syncedLyrics, plainLyrics, albumName, duration } = req.body;

  if (!track || !artist) {
    res.status(400).json({ error: 'track and artist are required' });
    return;
  }

  try {
    const data = {
      syncedLyrics: syncedLyrics || null,
      plainLyrics: plainLyrics || null,
      trackName: track,
      artistName: artist,
      albumName: albumName || '',
      duration: duration || 0
    };
    await saveLyrics(track, artist, data);
    res.json({ success: true, message: 'Lyrics saved successfully' });
  } catch (error) {
    console.error('[Lyrics Route] Save error:', error);
    res.status(500).json({ error: 'Failed to save lyrics' });
  }
});

// POST /api/lyrics/clear
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await clearLyricsCache();
    SearchService.clearSearchCache();
    res.json({ success: true, message: 'Server-side lyrics and search caches cleared successfully' });
  } catch (error) {
    console.error('[Lyrics Route] Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
