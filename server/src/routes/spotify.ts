import { Router, Request, Response } from 'express';
import { searchYouTube } from '../services/youtubeService';

const router = Router();

export interface ResolvedTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArtUrl: string | null;
  source: 'youtube';
  streamUrl: string;
  videoId: string;
  addedAt: number;
}

interface SpotifyTrackMeta {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  coverArtUrl?: string;
}

interface SpotifyPlaylistPayload {
  title: string;
  description?: string;
  coverArtUrl?: string;
  tracks: SpotifyTrackMeta[];
}

// In-memory LRU cache with 10-minute TTL
interface CacheEntry {
  payload: SpotifyPlaylistPayload;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key: string): SpotifyPlaylistPayload | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCache(key: string, payload: SpotifyPlaylistPayload) {
  if (cache.size > 100) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { payload, timestamp: Date.now() });
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseDurationStringToMs(durStr: string): number {
  const parts = durStr.split(':').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 180000;
}

/**
 * Extract Spotify entity ID and type from URL or URI
 */
function parseSpotifyUrl(inputUrl: string): { type: 'playlist' | 'album' | 'track'; id: string } | null {
  try {
    const clean = inputUrl.trim();
    if (clean.startsWith('spotify:')) {
      const parts = clean.split(':');
      if (parts.length >= 3) {
        const type = parts[1] as 'playlist' | 'album' | 'track';
        const id = parts[2];
        if (['playlist', 'album', 'track'].includes(type) && id) {
          return { type, id };
        }
      }
    }

    const urlObj = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    const pathnameParts = urlObj.pathname.split('/').filter(Boolean);
    
    if (pathnameParts.length >= 2) {
      const type = pathnameParts[0] as 'playlist' | 'album' | 'track';
      const id = pathnameParts[1].split('?')[0];
      if (['playlist', 'album', 'track'].includes(type) && id) {
        return { type, id };
      }
    }
  } catch (err) {
    console.warn('[Spotify Parser] Invalid URL:', inputUrl);
  }
  return null;
}

/**
 * Scrape public Spotify embed page to extract track list keylessly
 */
async function scrapeSpotifyEmbed(type: 'playlist' | 'album' | 'track', id: string): Promise<SpotifyPlaylistPayload | null> {
  const cacheKey = `${type}:${id}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[Spotify Parser] Returning cached metadata for ${cacheKey}`);
    return cached;
  }

  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
  console.log(`[Spotify Parser] Fetching embed page: ${embedUrl}`);

  try {
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      throw new Error(`Spotify embed returned status ${response.status}`);
    }

    const html = await response.text();

    // 1. Try script state JSON parsing
    const candidates = [
      { re: /<script id="session" type="application\/json">([\s\S]*?)<\/script>/, b64: true },
      { re: /<script id="initial-state" type="text\/plain">([\s\S]*?)<\/script>/, b64: true },
      { re: /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/, b64: false },
    ];

    for (const cand of candidates) {
      const match = html.match(cand.re);
      if (match && match[1]) {
        try {
          const rawText = cand.b64 ? Buffer.from(match[1], 'base64').toString('utf-8') : match[1];
          const json = JSON.parse(rawText);
          const parsed = parseSpotifyStateJson(json, type);
          if (parsed && parsed.tracks.length > 0) {
            setCache(cacheKey, parsed);
            return parsed;
          }
        } catch {}
      }
    }

    // 2. Parse DOM elements / HTML rows directly
    const fallback = parseSpotifyHtmlFallback(html, type);
    if (fallback && fallback.tracks.length > 0) {
      setCache(cacheKey, fallback);
    }
    return fallback;
  } catch (err: any) {
    console.error(`[Spotify Parser] Scraping failed for ${type}/${id}:`, err?.message || err);
    return null;
  }
}

function parseSpotifyStateJson(json: any, type: 'playlist' | 'album' | 'track'): SpotifyPlaylistPayload | null {
  try {
    if (json.data && json.data.playlistUnion) {
      const p = json.data.playlistUnion;
      const title = p.name || 'Spotify Playlist';
      const coverArtUrl = p.images?.items?.[0]?.sources?.[0]?.url || p.images?.[0]?.url || null;
      const rawTracks = p.tracksV2?.items || p.tracks?.items || [];
      const tracks: SpotifyTrackMeta[] = [];

      for (const item of rawTracks) {
        const trackObj = item.track || item.item?.data || item;
        if (!trackObj || !trackObj.name) continue;
        const artistNames = trackObj.artists?.items
          ? trackObj.artists.items.map((a: any) => a.profile?.name || a.name).filter(Boolean).join(', ')
          : trackObj.artists?.map((a: any) => a.name).filter(Boolean).join(', ') || 'Unknown Artist';
        
        tracks.push({
          title: trackObj.name,
          artist: artistNames,
          album: trackObj.albumOfTrack?.name || trackObj.album?.name || title,
          durationMs: trackObj.trackDuration?.totalMilliseconds || trackObj.duration_ms || 180000,
          coverArtUrl: trackObj.albumOfTrack?.coverArt?.sources?.[0]?.url || trackObj.album?.images?.[0]?.url || coverArtUrl
        });
      }

      return { title, coverArtUrl, tracks };
    }

    if (json.data && json.data.albumUnion) {
      const a = json.data.albumUnion;
      const title = a.name || 'Spotify Album';
      const coverArtUrl = a.coverArt?.sources?.[0]?.url || null;
      const artist = a.artists?.items?.map((art: any) => art.profile?.name).join(', ') || 'Artist';
      const rawTracks = a.tracks?.items || [];
      const tracks: SpotifyTrackMeta[] = rawTracks.map((t: any) => {
        const trk = t.track || t;
        return {
          title: trk.name,
          artist: trk.artists?.items?.map((art: any) => art.profile?.name).join(', ') || trk.artists?.map((art: any) => art.name).join(', ') || artist,
          album: title,
          durationMs: trk.trackDuration?.totalMilliseconds || trk.duration_ms || 180000,
          coverArtUrl
        };
      });

      return { title: `${title} - ${artist}`, coverArtUrl, tracks };
    }

    if (json.data && json.data.trackUnion) {
      const t = json.data.trackUnion;
      const title = t.name || 'Spotify Track';
      const artist = t.firstArtist?.items?.[0]?.profile?.name || t.artists?.items?.map((art: any) => art.profile?.name).join(', ') || 'Unknown Artist';
      const coverArtUrl = t.albumOfTrack?.coverArt?.sources?.[0]?.url || null;
      const album = t.albumOfTrack?.name || 'Single';
      const durationMs = t.trackDuration?.totalMilliseconds || 180000;

      return {
        title: `${title} - ${artist}`,
        coverArtUrl,
        tracks: [{ title, artist, album, durationMs, coverArtUrl }]
      };
    }
  } catch (err) {
    console.warn('[Spotify Parser] Failed to extract state JSON structure:', err);
  }
  return null;
}

function parseSpotifyHtmlFallback(html: string, type: 'playlist' | 'album' | 'track'): SpotifyPlaylistPayload | null {
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/class="[^"]*CoverArtBase_coverArt[^"]*"[^>]*src="([^"]+)"/);
  
  let title = ogTitleMatch ? decodeHtmlEntities(ogTitleMatch[1]) : 'Imported Spotify Playlist';
  const coverArtUrl = ogImageMatch ? ogImageMatch[1] : undefined;

  const headerMatch = html.match(/CondensedMetadata_condensedMetadataContainer[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>·<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
  if (headerMatch) {
    title = `${decodeHtmlEntities(headerMatch[2])} - ${decodeHtmlEntities(headerMatch[1])}`;
  }

  const tracks: SpotifyTrackMeta[] = [];

  // Match Spotify embed HTML track rows (<li data-testid="tracklist-row-N">)
  const rowRegex = /<li[^>]*data-testid="tracklist-row-\d+"[\s\S]*?<\/li>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[0];
    
    const titleMatch = rowHtml.match(/TracklistRow_title[^>]*>([\s\S]*?)<\/h3>/);
    const subtitleMatch = rowHtml.match(/TracklistRow_subtitle[^>]*>([\s\S]*?)<\/h4>/);
    const durationMatch = rowHtml.match(/data-testid="duration-cell"[^>]*>([\s\S]*?)<\/div>/);

    if (titleMatch) {
      const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      let rawArtist = 'Unknown Artist';
      if (subtitleMatch) {
        rawArtist = subtitleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      let durationMs = 180000;
      if (durationMatch) {
        durationMs = parseDurationStringToMs(durationMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      const cleanTitle = decodeHtmlEntities(rawTitle);
      const cleanArtist = decodeHtmlEntities(rawArtist);

      if (cleanTitle) {
        tracks.push({
          title: cleanTitle,
          artist: cleanArtist,
          album: title,
          durationMs,
          coverArtUrl
        });
      }
    }
  }

  // Generic JSON regex fallback
  if (tracks.length === 0) {
    const jsonTrackRegex = /"name":"([^"]+)","artists":\[{"name":"([^"]+)"/g;
    let match;
    while ((match = jsonTrackRegex.exec(html)) !== null) {
      tracks.push({
        title: decodeHtmlEntities(match[1]),
        artist: decodeHtmlEntities(match[2]),
        album: title,
        coverArtUrl
      });
    }
  }

  return { title, coverArtUrl, tracks };
}

/**
 * POST /api/spotify/parse-link
 */
router.post('/parse-link', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Valid Spotify URL is required' });
    return;
  }

  const parsed = parseSpotifyUrl(url);
  if (!parsed) {
    res.status(400).json({ error: 'Invalid Spotify playlist, album, or track URL format' });
    return;
  }

  console.log(`[Spotify Route] Processing ${parsed.type} ID: ${parsed.id}`);
  const payload = await scrapeSpotifyEmbed(parsed.type, parsed.id);

  if (!payload || !payload.tracks || payload.tracks.length === 0) {
    res.status(404).json({ error: 'Could not extract tracks from Spotify link. Make sure the link is public.' });
    return;
  }

  res.json(payload);
});

/**
 * POST /api/spotify/resolve-track
 */
router.post('/resolve-track', async (req: Request, res: Response) => {
  const { title, artist, album, durationMs } = req.body;
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const query = `${artist || ''} ${title}`.trim();
  const targetDurationSec = typeof durationMs === 'number' && durationMs > 0 ? Math.round(durationMs / 1000) : 0;

  try {
    const results = await searchYouTube(query);
    if (!results || results.length === 0) {
      res.status(404).json({ error: 'No YouTube match found for track' });
      return;
    }

    let bestMatch = results[0];
    let bestScore = Infinity;

    for (const cand of results.slice(0, 5)) {
      let score = 0;

      if (targetDurationSec > 0 && cand.duration > 0) {
        const diff = Math.abs(cand.duration - targetDurationSec);
        const ratio = cand.duration / targetDurationSec;
        if (ratio > 2.5 || ratio < 0.4) {
          score += 1000;
        } else {
          score += diff;
        }
      }

      const candTitleLower = cand.title.toLowerCase();
      if (candTitleLower.includes('cover') && !title.toLowerCase().includes('cover')) score += 30;
      if (candTitleLower.includes('live') && !title.toLowerCase().includes('live')) score += 30;
      if (candTitleLower.includes('8d') || candTitleLower.includes('bass boosted') || candTitleLower.includes('10 hour')) score += 100;

      if (score < bestScore) {
        bestScore = score;
        bestMatch = cand;
      }
    }

    const matchedTrack: ResolvedTrack = {
      id: `yt-${bestMatch.videoId}`,
      title: bestMatch.title || title,
      artist: bestMatch.artist || artist || 'Unknown Artist',
      album: album || bestMatch.album || 'Single',
      duration: bestMatch.duration || targetDurationSec || 180,
      coverArtUrl: bestMatch.coverArtUrl || null,
      source: 'youtube',
      streamUrl: `/api/yt/stream/${bestMatch.videoId}`,
      videoId: bestMatch.videoId,
      addedAt: Date.now()
    };

    res.json(matchedTrack);
  } catch (err: any) {
    console.error('[Spotify Route] Track resolution error:', err?.message || err);
    res.status(500).json({ error: 'Failed to resolve track' });
  }
});

export default router;
