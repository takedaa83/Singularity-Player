import { Router, Request, Response } from 'express';
import { SearchService } from '../services/searchService';
import crypto from 'crypto';

const router = Router();

// GET /api/search?q=...
router.get('/', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim() === '') {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const results = await SearchService.search(query);
    res.json(results);
  } catch (error) {
    console.error('Error handling search request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/search/suggestions?q=...
router.get('/suggestions', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    res.json([]);
    return;
  }

  try {
    const suggestions = await SearchService.getSuggestions(query);
    res.json(suggestions);
  } catch (error) {
    console.error('Error handling suggestions request:', error);
    res.json([]);
  }
});

// GET /api/search/trending
router.get('/trending', (req: Request, res: Response) => {
  try {
    const trending = SearchService.getTrendingSearches();
    res.json(trending);
  } catch (error) {
    console.error('Error handling trending request:', error);
    res.json([]);
  }
});

// POST /api/search/recognize
router.post('/recognize', async (req: Request, res: Response) => {
  const { signature, sampleDurationMs } = req.body;
  if (!signature) {
    res.status(400).json({ error: 'Signature is required' });
    return;
  }

  const durationMs = sampleDurationMs || 10000;
  const timestamp = Math.floor(Date.now() / 1000);
  const uuid1 = crypto.randomUUID().toUpperCase();
  const uuid2 = crypto.randomUUID();

  const userAgents = [
    "Dalvik/2.1.0 (Linux; U; Android 5.0.2; VS980 4G Build/LRX22G)",
    "Dalvik/1.6.0 (Linux; U; Android 4.4.2; SM-T210 Build/KOT49H)",
    "Dalvik/2.1.0 (Linux; U; Android 5.1.1; SM-P905V Build/LMY47X)",
    "Dalvik/2.1.0 (Linux; U; Android 6.0.1; SM-G920F Build/MMB29K)",
    "Dalvik/2.1.0 (Linux; U; Android 5.0; SM-G900F Build/LRX21T)"
  ];
  const timezones = [
    "Europe/Paris", "Europe/London", "America/New_York",
    "America/Los_Angeles", "Asia/Tokyo", "Asia/Dubai"
  ];

  const shazamRequest = {
    geolocation: {
      altitude: Math.random() * 400 + 100,
      latitude: Math.random() * 180 - 90,
      longitude: Math.random() * 360 - 180
    },
    signature: {
      samplems: durationMs,
      timestamp: timestamp,
      uri: signature
    },
    timestamp: timestamp,
    timezone: timezones[Math.floor(Math.random() * timezones.length)]
  };

  try {
    const shazamUrl = `https://amp.shazam.com/discovery/v5/en/US/android/-/tag/${uuid1}/${uuid2}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&video=v3`;
    
    console.log('[Shazam Route] Sending recognition request to Shazam API...');
    const response = await fetch(shazamUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Content-Language': 'en_US',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shazamRequest)
    });

    if (!response.ok) {
      console.warn(`[Shazam Route] Shazam API returned HTTP error ${response.status}`);
      res.status(response.status).json({ error: `Shazam API returned HTTP error ${response.status}` });
      return;
    }

    const shazamResponse = await response.json() as any;
    const track = shazamResponse?.track;
    if (!track) {
      console.log('[Shazam Route] Shazam match failed: no track found in response');
      res.status(404).json({ error: 'No match found' });
      return;
    }

    const title = track.title || '';
    const artist = track.subtitle || '';
    const albumSection = track.sections?.find((s: any) => s?.type === 'SONG');
    const album = albumSection?.metadata?.find((m: any) => m?.title === 'Album')?.text || '';
    const genre = track.genres?.primary || '';
    const coverArtUrl = track.images?.coverart || track.images?.coverarthq || null;

    console.log(`[Shazam Route] Match found: "${artist} - ${title}"`);

    console.log(`[Shazam Route] Searching YouTube Music to resolve song: "${artist} - ${title}"`);
    const searchResults = await SearchService.search(`${artist} ${title}`);
    
    const matchedTrack = searchResults.find(t => t.source === 'youtube') || searchResults[0] || null;

    res.json({
      title,
      artist,
      album,
      genre,
      coverArtUrl,
      resolvedTrack: matchedTrack
    });
  } catch (err: any) {
    console.error('[Shazam Route] Recognition failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
