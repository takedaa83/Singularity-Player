import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { getClient, searchYouTube } from './youtubeService';

export interface LyricsResult {
  syncedLyrics: string | null;  // LRC format with timestamps
  plainLyrics: string | null;   // Plain text lyrics
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
}

const LYRICS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'lyrics');

function ensureLyricsDir() {
  if (!fs.existsSync(LYRICS_DIR)) {
    fs.mkdirSync(LYRICS_DIR, { recursive: true });
  }
}

function getLyricsFileHash(track: string, artist: string): string {
  return crypto
    .createHash('md5')
    .update(`${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`)
    .digest('hex');
}

async function getLyricsFromDisk(track: string, artist: string): Promise<LyricsResult | null | undefined> {
  try {
    ensureLyricsDir();
    const hash = getLyricsFileHash(track, artist);
    const filePath = path.join(LYRICS_DIR, `${hash}.json`);
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as LyricsResult | null;
    }
  } catch (e) {
    console.error('[LyricsService] Error reading lyrics from disk:', e);
  }
  return undefined; // cache miss
}

async function saveLyricsToDisk(track: string, artist: string, data: LyricsResult | null): Promise<void> {
  try {
    ensureLyricsDir();
    const hash = getLyricsFileHash(track, artist);
    const filePath = path.join(LYRICS_DIR, `${hash}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LyricsService] Error writing lyrics to disk:', e);
  }
}

class LyricsCache {
  private cache = new Map<string, { data: LyricsResult | null; expiry: number }>();
  private TTL = 60 * 60 * 1000; // 1 hour
  private MAX_SIZE = 500;

  private makeKey(track: string, artist: string): string {
    return `${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
  }

  get(track: string, artist: string): LyricsResult | null | undefined {
    const key = this.makeKey(track, artist);
    const entry = this.cache.get(key);
    if (!entry) return undefined; // cache miss
    if (entry.expiry < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data; // may be null ("no lyrics found" is cached too)
  }

  set(track: string, artist: string, data: LyricsResult | null): void {
    if (this.cache.size >= this.MAX_SIZE) {
      // Evict oldest
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    const key = this.makeKey(track, artist);
    this.cache.set(key, { data, expiry: Date.now() + this.TTL });
  }

  clear(): void {
    this.cache.clear();
  }
}

const lyricsCache = new LyricsCache();

class AppleTokenManager {
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      return this.cachedToken;
    }

    try {
      console.log('[LyricsService] Fetching new Apple Music developer token...');
      const pageRes = await fetch('https://beta.music.apple.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!pageRes.ok) throw new Error(`Apple Music index returned status ${pageRes.status}`);
      const pageBody = await pageRes.text();

      const indexJsRegex = /\/assets\/index~[^/]+\.js/;
      const indexJsMatch = pageBody.match(indexJsRegex);
      if (!indexJsMatch) throw new Error('Could not find Apple Music index JS URL');

      const indexJsUri = indexJsMatch[0];
      const jsRes = await fetch(`https://beta.music.apple.com${indexJsUri}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!jsRes.ok) throw new Error(`Apple Music JS returned status ${jsRes.status}`);
      const jsBody = await jsRes.text();

      const tokenRegex = /eyJh([^"]*)/;
      const tokenMatch = jsBody.match(tokenRegex);
      if (!tokenMatch) throw new Error('Could not find Apple Music developer token inside JS');

      const token = tokenMatch[0];
      this.cachedToken = token;
      this.tokenExpiry = now + 24 * 60 * 60 * 1000; // 24 hours validity
      console.log('[LyricsService] Successfully fetched Apple Music developer token');
      return token;
    } catch (e) {
      console.error('[LyricsService] Error fetching Apple Music developer token:', e);
      throw e;
    }
  }

  clearToken() {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }
}

const appleTokenManager = new AppleTokenManager();

function cleanSearchString(str: string): string {
  return str
    .replace(/\s*\(feat\..*?\)/gi, '')
    .replace(/\s*\(ft\..*?\)/gi, '')
    .replace(/\s*feat\..*/gi, '')
    .replace(/\s*ft\..*/gi, '')
    .replace(/\s*\(.*?official.*?\)/gi, '')
    .replace(/\s*\[.*?official.*?\]/gi, '')
    .replace(/\s*【.*?】/g, '')
    .trim();
}

function formatLrcMs(timeMs: number): string {
  const totalSeconds = timeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((timeMs % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

async function fetchAppleMusicLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    const token = await appleTokenManager.getToken();
    if (!token) return null;

    const cleanedTitle = cleanSearchString(trackName);
    const cleanedArtist = cleanSearchString(artistName);

    console.log(`[LyricsService] Searching Apple Music Catalog for: ${cleanedArtist} - ${cleanedTitle}`);
    const query = encodeURIComponent(`${cleanedArtist} ${cleanedTitle}`);
    const searchUrl = `https://amp-api.music.apple.com/v1/catalog/us/search?term=${query}&types=songs&limit=5&l=en-US&platform=web`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://music.apple.com',
        'Referer': 'https://music.apple.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (searchRes.status === 401) {
      console.warn('[LyricsService] Apple Music search unauthorized (401), clearing token and retrying...');
      appleTokenManager.clearToken();
      return fetchAppleMusicLyrics(trackName, artistName);
    }

    if (!searchRes.ok) {
      console.warn(`[LyricsService] Apple Music catalog search returned status ${searchRes.status}`);
      return null;
    }

    const searchJson = await searchRes.json() as any;
    const songs = searchJson?.results?.songs?.data || [];
    if (songs.length === 0) {
      console.log('[LyricsService] Apple Music: No matching tracks found.');
      return null;
    }

    const bestSong = songs[0];
    const trackId = bestSong.id;
    const attr = bestSong.attributes || {};
    const albumName = attr.albumName || '';
    const duration = attr.durationInMillis ? attr.durationInMillis / 1000 : 0;

    console.log(`[LyricsService] Apple Music found track ID: ${trackId} (${attr.artistName} - ${attr.name})`);

    console.log(`[LyricsService] Querying lyrics.paxsenix.org for track ID: ${trackId}`);
    const lyricsRes = await fetch(`https://lyrics.paxsenix.org/apple-music/lyrics?id=${trackId}`, {
      headers: {
        'User-Agent': 'Singularity Music Player/1.0'
      }
    });

    if (!lyricsRes.ok) {
      console.warn(`[LyricsService] Paxsenix lyrics fetch returned status ${lyricsRes.status}`);
      return null;
    }

    const lyricsJson = await lyricsRes.json() as any;
    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = lyricsJson.plain || null;

    if (lyricsJson.elrcMultiPerson) {
      syncedLyrics = lyricsJson.elrcMultiPerson;
    } else if (lyricsJson.elrc) {
      syncedLyrics = lyricsJson.elrc;
    } else if (lyricsJson.content && Array.isArray(lyricsJson.content)) {
      const lrcLines: string[] = [];
      const plainLines: string[] = [];
      
      for (const line of lyricsJson.content) {
        const timeMs = line.timestamp || 0;
        const timeStr = formatLrcMs(timeMs);
        const lineText = line.text && Array.isArray(line.text)
          ? line.text.map((w: any) => w.text).join(' ')
          : '';
        
        if (lineText.trim()) {
          let agentPrefix = '';
          if (line.background) agentPrefix = '{bg}';
          else if (line.oppositeTurn) agentPrefix = '{agent:v2}';
          
          lrcLines.push(`[${timeStr}]${agentPrefix}${lineText}`);
          plainLines.push(lineText);
          
          if (line.text && line.text.length > 0) {
            const wordTimings = line.text.map((w: any) => {
              const startSec = (w.timestamp || 0) / 1000;
              const endSec = (w.endtime || 0) / 1000;
              return `${w.text}:${startSec.toFixed(3)}:${endSec.toFixed(3)}`;
            }).join('|');
            lrcLines.push(`<${wordTimings}>`);
          }
        }
      }
      
      syncedLyrics = lrcLines.join('\n');
      if (!plainLyrics) {
        plainLyrics = plainLines.join('\n');
      }
    }

    if (!syncedLyrics && !plainLyrics) {
      return null;
    }

    return {
      syncedLyrics,
      plainLyrics,
      trackName: attr.name || trackName,
      artistName: attr.artistName || artistName,
      albumName,
      duration,
    };
  } catch (error) {
    console.error('[LyricsService] Error in fetchAppleMusicLyrics:', error);
    return null;
  }
}

let musixmatchToken: string | null = null;
let musixmatchTokenExpiry = 0;

async function getMusixmatchToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (musixmatchToken && now < musixmatchTokenExpiry) {
    return musixmatchToken;
  }

  try {
    console.log('[LyricsService] Fetching new Musixmatch token...');
    const t = Date.now().toString();
    const url = `https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0&user_language=en&t=${t}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.19.4 Chrome/58.0.3029.110 Electron/1.7.6 Safari/537.36',
        'Cookie': 'AWSELB=0; AWSELBCORS=0',
      }
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json() as any;
    const header = data?.message?.header;
    if (header?.status_code !== 200) {
      throw new Error(`Musixmatch error status ${header?.status_code}`);
    }

    const token = data?.message?.body?.user_token;
    if (token) {
      musixmatchToken = token;
      musixmatchTokenExpiry = now + 600; // 10 minutes cache
      return token;
    }
  } catch (e) {
    console.error('[LyricsService] Failed to get Musixmatch token:', e);
  }
  return null;
}

function formatLrcTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

async function fetchMusixmatchLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    const token = await getMusixmatchToken();
    if (!token) return null;

    console.log(`[LyricsService] Querying Musixmatch track search for: ${artistName} - ${trackName}`);
    const t = Date.now().toString();
    const searchParams = new URLSearchParams({
      q: `${artistName} ${trackName}`,
      page_size: '5',
      page: '1',
      app_id: 'web-desktop-app-v1.0',
      usertoken: token,
      t: t,
    });

    const searchRes = await fetch(`https://apic-desktop.musixmatch.com/ws/1.1/track.search?${searchParams.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.19.4 Chrome/58.0.3029.110 Electron/1.7.6 Safari/537.36',
        'Cookie': 'AWSELB=0; AWSELBCORS=0',
      }
    });

    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json() as any;
    const header = searchJson?.message?.header;
    if (header?.status_code !== 200) {
      console.warn(`[LyricsService] Musixmatch search failed with code: ${header?.status_code}`);
      return null;
    }

    const trackList = searchJson?.message?.body?.track_list || [];
    if (trackList.length === 0) {
      console.log('[LyricsService] Musixmatch: No matching tracks found.');
      return null;
    }

    const bestTrack = trackList[0]?.track;
    if (!bestTrack) return null;

    const trackId = bestTrack.track_id;
    const commontrackId = bestTrack.commontrack_id;
    const albumName = bestTrack.album_name || '';
    const duration = bestTrack.track_length || 0;

    console.log(`[LyricsService] Musixmatch found track_id: ${trackId}, commontrack_id: ${commontrackId}`);

    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = null;

    // Try RichSync (word-by-word) first
    try {
      console.log(`[LyricsService] Querying Musixmatch richsync (word-level) for track: ${trackId}`);
      const richsyncParams = new URLSearchParams({
        track_id: trackId.toString(),
        app_id: 'web-desktop-app-v1.0',
        usertoken: token,
        t: Date.now().toString(),
      });

      const richsyncRes = await fetch(`https://apic-desktop.musixmatch.com/ws/1.1/track.richsync.get?${richsyncParams.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.19.4 Chrome/58.0.3029.110 Electron/1.7.6 Safari/537.36',
          'Cookie': 'AWSELB=0; AWSELBCORS=0',
        }
      });

      if (richsyncRes.ok) {
        const richsyncJson = await richsyncRes.json() as any;
        if (richsyncJson?.message?.header?.status_code === 200) {
          const richsyncBodyRaw = richsyncJson?.message?.body?.richsync?.richsync_body;
          if (richsyncBodyRaw) {
            const richsyncData = JSON.parse(richsyncBodyRaw);
            let lrcStr = '';
            for (const line of richsyncData) {
              lrcStr += `[${formatLrcTime(line.ts)}] `;
              for (const word of line.l) {
                const wordTime = formatLrcTime(line.ts + word.o);
                lrcStr += `<${wordTime}> ${word.c} `;
              }
              lrcStr += '\n';
            }
            syncedLyrics = lrcStr;
            console.log('[LyricsService] Successfully fetched and parsed word-level richsync lyrics.');
          }
        }
      }
    } catch (richsyncErr) {
      console.warn('[LyricsService] Musixmatch richsync fetching failed, falling back to standard subtitles:', richsyncErr);
    }

    // Fallback to standard subtitle (line-by-line synced)
    if (!syncedLyrics) {
      try {
        console.log(`[LyricsService] Querying Musixmatch subtitle (line-level) for track: ${trackId}`);
        const subtitleParams = new URLSearchParams({
          track_id: trackId.toString(),
          subtitle_format: 'lrc',
          app_id: 'web-desktop-app-v1.0',
          usertoken: token,
          t: Date.now().toString(),
        });

        const subtitleRes = await fetch(`https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?${subtitleParams.toString()}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.19.4 Chrome/58.0.3029.110 Electron/1.7.6 Safari/537.36',
            'Cookie': 'AWSELB=0; AWSELBCORS=0',
          }
        });

        if (subtitleRes.ok) {
          const subtitleJson = await subtitleRes.json() as any;
          if (subtitleJson?.message?.header?.status_code === 200) {
            syncedLyrics = subtitleJson?.message?.body?.subtitle?.subtitle_body || null;
            console.log('[LyricsService] Successfully fetched line-level subtitle lyrics.');
          }
        }
      } catch (subErr) {
        console.warn('[LyricsService] Musixmatch subtitle fetching failed:', subErr);
      }
    }

    // Try to get plain text lyrics
    try {
      const plainParams = new URLSearchParams({
        track_id: trackId.toString(),
        app_id: 'web-desktop-app-v1.0',
        usertoken: token,
        t: Date.now().toString(),
      });
      const plainRes = await fetch(`https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?${plainParams.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.19.4 Chrome/58.0.3029.110 Electron/1.7.6 Safari/537.36',
          'Cookie': 'AWSELB=0; AWSELBCORS=0',
        }
      });
      if (plainRes.ok) {
        const plainJson = await plainRes.json() as any;
        if (plainJson?.message?.header?.status_code === 200) {
          plainLyrics = plainJson?.message?.body?.lyrics?.lyrics_body || null;
          if (plainLyrics) {
            plainLyrics = plainLyrics.replace(/\*\*\*\*\*\*\* This Lyrics is NOT for Commercial use \*\*\*\*\*\*\*/g, '').trim();
            plainLyrics = plainLyrics.replace(/\(\d+\)/g, '').trim();
          }
        }
      }
    } catch (plainErr) {
      console.warn('[LyricsService] Musixmatch plain lyrics fetching failed:', plainErr);
    }

    if (!syncedLyrics && !plainLyrics) return null;

    return {
      syncedLyrics,
      plainLyrics,
      trackName: bestTrack.track_name || trackName,
      artistName: bestTrack.artist_name || artistName,
      albumName,
      duration,
    };
  } catch (error) {
    console.error('[LyricsService] Error in fetchMusixmatchLyrics:', error);
    return null;
  }
}

async function fetchLrcLibLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName && albumName !== 'Single' && albumName !== 'YouTube') {
      params.set('album_name', albumName);
    }
    if (duration && duration > 0) {
      params.set('duration', Math.round(duration).toString());
    }

    console.log(`[LyricsService] Querying LRCLIB API for: ${artistName} - ${trackName}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    
    let res;
    try {
      res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: {
          'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
        },
        signal: controller.signal
      });
    } catch (e) {
      console.warn('[LyricsService] LRCLIB get timed out or failed, falling back...');
    } finally {
      clearTimeout(timeout);
    }

    if (res && res.ok) {
      const data = await res.json() as any;
      return {
        syncedLyrics: data.syncedLyrics || null,
        plainLyrics: data.plainLyrics || null,
        trackName: data.trackName || trackName,
        artistName: data.artistName || artistName,
        albumName: data.albumName || albumName || '',
        duration: data.duration || duration || 0,
      };
    }

    // Try LRCLIB search fallback
    console.log(`[LyricsService] Querying LRCLIB Search Fallback for: ${artistName} - ${trackName}`);
    const searchController = new AbortController();
    const searchTimeout = setTimeout(() => searchController.abort(), 4000);
    
    let searchRes;
    try {
      searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`,
        {
          headers: {
            'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
          },
          signal: searchController.signal
        }
      );
    } catch (e) {
      console.warn('[LyricsService] LRCLIB search timed out or failed, falling back...');
    } finally {
      clearTimeout(searchTimeout);
    }

    if (searchRes && searchRes.ok) {
      const searchData = await searchRes.json() as any[];
      if (searchData && searchData.length > 0) {
        const best = searchData[0];
        return {
          syncedLyrics: best.syncedLyrics || null,
          plainLyrics: best.plainLyrics || null,
          trackName: best.trackName || trackName,
          artistName: best.artistName || artistName,
          albumName: best.albumName || albumName || '',
          duration: best.duration || duration || 0,
        };
      }
    }
  } catch (error) {
    console.error('[LyricsService] Error in fetchLrcLibLyrics:', error);
  }
  return null;
}

async function fetchYouTubeCaptions(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    console.log(`[LyricsService] Querying YouTube search for captions: ${artistName} - ${trackName}`);
    const results = await searchYouTube(`${artistName} ${trackName}`);
    if (!results || results.length === 0) {
      console.log('[LyricsService] YouTube captions search: No videos found.');
      return null;
    }

    const videoId = results[0].videoId;
    if (!videoId) return null;

    console.log(`[LyricsService] Fetching YouTube captions/transcript for videoId: ${videoId}`);
    const yt = await getClient();
    const info = await yt.getInfo(videoId);

    try {
      const transcriptData = await info.getTranscript();
      const segments = transcriptData?.transcript?.content?.body?.initial_segments;
      
      if (!segments || !Array.isArray(segments) || segments.length === 0) {
        console.log('[LyricsService] YouTube captions: No transcript segments found.');
        return null;
      }

      let lrcStr = '';
      let plainTextStr = '';
      for (const seg of segments) {
        const startMs = Number(seg.start_ms) || 0;
        const timeStr = formatLrcTime(startMs / 1000);
        const text = seg.snippet?.text || '';
        lrcStr += `[${timeStr}] ${text}\n`;
        plainTextStr += `${text}\n`;
      }

      console.log(`[LyricsService] YouTube captions retrieved successfully for videoId: ${videoId}`);
      return {
        syncedLyrics: lrcStr,
        plainLyrics: plainTextStr,
        trackName,
        artistName,
        albumName: 'YouTube Captions',
        duration: results[0].duration || 0,
      };
    } catch (e: any) {
      console.log(`[LyricsService] No captions/transcript available on YouTube for videoId: ${videoId} (${e.message || e})`);
      return null;
    }
  } catch (error) {
    console.error('[LyricsService] Error in fetchYouTubeCaptions:', error);
    return null;
  }
}

async function fetchNetEaseLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    console.log(`[LyricsService] Attempting NetEase fallback search for: ${artistName} - ${trackName}`);
    const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(`${artistName} ${trackName}`)}&type=1&limit=5`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json() as any;
    const songId = searchJson?.result?.songs?.[0]?.id;

    if (!songId) {
      console.log(`[LyricsService] NetEase fallback search: no tracks found`);
      return null;
    }

    const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
    const lyricRes = await fetch(lyricUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!lyricRes.ok) return null;
    const lyricJson = await lyricRes.json() as any;

    const syncedLyrics = lyricJson?.lrc?.lyric || null;
    const plainLyrics = lyricJson?.klyric?.lyric || null;

    if (!syncedLyrics && !plainLyrics) return null;

    if (syncedLyrics && syncedLyrics.trim() === '') {
      return null;
    }

    const result: LyricsResult = {
      syncedLyrics,
      plainLyrics,
      trackName,
      artistName,
      albumName: searchJson?.result?.songs?.[0]?.album?.name || '',
      duration: Math.round((searchJson?.result?.songs?.[0]?.duration || 0) / 1000),
    };

    console.log(`[LyricsService] NetEase fallback lyrics retrieved successfully for: ${artistName} - ${trackName}`);
    return result;
  } catch (error) {
    console.error('[LyricsService] NetEase fallback search failed:', error);
    return null;
  }
}

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LyricsResult | null> {
  // 1. Check in-memory cache
  const cached = lyricsCache.get(trackName, artistName);
  if (cached !== undefined) return cached;

  // 2. Check permanent disk cache
  const diskCached = await getLyricsFromDisk(trackName, artistName);
  if (diskCached !== undefined) {
    lyricsCache.set(trackName, artistName, diskCached);
    return diskCached;
  }

  // 3. Fallback Chain: Apple Music -> Musixmatch -> LRCLIB -> YouTube Captions -> NetEase

  // A0. Apple Music
  const appleRes = await fetchAppleMusicLyrics(trackName, artistName);
  if (appleRes) {
    lyricsCache.set(trackName, artistName, appleRes);
    await saveLyricsToDisk(trackName, artistName, appleRes);
    return appleRes;
  }

  // A. Musixmatch
  const musixmatchRes = await fetchMusixmatchLyrics(trackName, artistName);
  if (musixmatchRes) {
    lyricsCache.set(trackName, artistName, musixmatchRes);
    await saveLyricsToDisk(trackName, artistName, musixmatchRes);
    return musixmatchRes;
  }

  // B. LRCLIB
  const lrclibRes = await fetchLrcLibLyrics(trackName, artistName, albumName, duration);
  if (lrclibRes) {
    lyricsCache.set(trackName, artistName, lrclibRes);
    await saveLyricsToDisk(trackName, artistName, lrclibRes);
    return lrclibRes;
  }

  // C. YouTube Captions
  const ytCaptionsRes = await fetchYouTubeCaptions(trackName, artistName);
  if (ytCaptionsRes) {
    lyricsCache.set(trackName, artistName, ytCaptionsRes);
    await saveLyricsToDisk(trackName, artistName, ytCaptionsRes);
    return ytCaptionsRes;
  }

  // D. NetEase
  const neteaseResult = await fetchNetEaseLyrics(trackName, artistName);
  if (neteaseResult) {
    lyricsCache.set(trackName, artistName, neteaseResult);
    await saveLyricsToDisk(trackName, artistName, neteaseResult);
    return neteaseResult;
  }

  // No lyrics found — cache the miss on disk and memory
  lyricsCache.set(trackName, artistName, null);
  await saveLyricsToDisk(trackName, artistName, null);
  return null;
}

export async function saveLyrics(track: string, artist: string, data: LyricsResult): Promise<void> {
  lyricsCache.set(track, artist, data);
  await saveLyricsToDisk(track, artist, data);
}

export async function clearLyricsCache(): Promise<void> {
  lyricsCache.clear();
  try {
    ensureLyricsDir();
    const files = await fs.promises.readdir(LYRICS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.promises.unlink(path.join(LYRICS_DIR, file));
      }
    }
  } catch (e) {
    console.error('[LyricsService] Error clearing lyrics disk cache:', e);
  }
}
