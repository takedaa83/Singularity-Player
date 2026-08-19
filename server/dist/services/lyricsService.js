"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLyrics = fetchLyrics;
exports.saveLyrics = saveLyrics;
exports.clearLyricsCache = clearLyricsCache;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const youtubeService_1 = require("./youtubeService");
const paths_1 = require("../utils/paths");
const LYRICS_DIR = (0, paths_1.getLyricsDir)();
function ensureLyricsDir() {
    // Handled safely by getLyricsDir()
}
function getLyricsFileHash(track, artist) {
    return crypto
        .createHash('md5')
        .update(`${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`)
        .digest('hex');
}
async function getLyricsFromDisk(track, artist) {
    try {
        ensureLyricsDir();
        const hash = getLyricsFileHash(track, artist);
        const filePath = path.join(LYRICS_DIR, `${hash}.json`);
        if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch (e) {
        console.error('[LyricsService] Error reading lyrics from disk:', e);
    }
    return undefined; // cache miss
}
async function saveLyricsToDisk(track, artist, data) {
    try {
        ensureLyricsDir();
        const hash = getLyricsFileHash(track, artist);
        const filePath = path.join(LYRICS_DIR, `${hash}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('[LyricsService] Error writing lyrics to disk:', e);
    }
}
class LyricsCache {
    cache = new Map();
    TTL = 60 * 60 * 1000; // 1 hour
    MAX_SIZE = 500;
    makeKey(track, artist) {
        return `${track.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
    }
    get(track, artist) {
        const key = this.makeKey(track, artist);
        const entry = this.cache.get(key);
        if (!entry)
            return undefined; // cache miss
        if (entry.expiry < Date.now()) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.data; // may be null ("no lyrics found" is cached too)
    }
    set(track, artist, data) {
        if (this.cache.size >= this.MAX_SIZE) {
            // Evict oldest
            const oldest = this.cache.keys().next().value;
            if (oldest)
                this.cache.delete(oldest);
        }
        const key = this.makeKey(track, artist);
        this.cache.set(key, { data, expiry: Date.now() + this.TTL });
    }
    clear() {
        this.cache.clear();
    }
}
const lyricsCache = new LyricsCache();
class AppleTokenManager {
    cachedToken = null;
    tokenExpiry = 0;
    async getToken() {
        const now = Date.now();
        if (this.cachedToken && now < this.tokenExpiry) {
            return this.cachedToken;
        }
        try {
            console.log('[LyricsService] Fetching new Apple Music developer token...');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const pageRes = await fetch('https://beta.music.apple.com', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller.signal
            }).finally(() => clearTimeout(timeout));
            if (!pageRes.ok)
                throw new Error(`Apple Music index returned status ${pageRes.status}`);
            const pageBody = await pageRes.text();
            const indexJsRegex = /\/assets\/(index|web-player|main|app)~?[^/"]+\.js/g;
            const matches = Array.from(pageBody.matchAll(indexJsRegex));
            let token = null;
            for (const match of matches) {
                const indexJsUri = match[0];
                try {
                    const jsController = new AbortController();
                    const jsTimeout = setTimeout(() => jsController.abort(), 2500);
                    const jsRes = await fetch(`https://beta.music.apple.com${indexJsUri}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        signal: jsController.signal
                    }).finally(() => clearTimeout(jsTimeout));
                    if (!jsRes.ok)
                        continue;
                    const jsBody = await jsRes.text();
                    const tokenMatch = jsBody.match(/eyJhY2NvdW50SWQiOiIwI[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|eyJh[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{10,}/);
                    if (tokenMatch) {
                        token = tokenMatch[0];
                        break;
                    }
                }
                catch (e) {
                    // ignore
                }
            }
            if (!token) {
                console.warn('[LyricsService] Could not extract Apple Music token from web JS, skipping Apple Music.');
                return null;
            }
            this.cachedToken = token;
            this.tokenExpiry = now + 24 * 60 * 60 * 1000; // 24 hours validity
            console.log('[LyricsService] Successfully fetched Apple Music developer token');
            return token;
        }
        catch (e) {
            console.warn('[LyricsService] Error fetching Apple Music developer token:', e?.message || e);
            return null;
        }
    }
    clearToken() {
        this.cachedToken = null;
        this.tokenExpiry = 0;
    }
}
const appleTokenManager = new AppleTokenManager();
function cleanSearchString(str) {
    return str
        .replace(/\s*\|\|.*$/g, '') // strip double pipe suffixes like "|| Cover || Kabir Singh"
        .replace(/\s*\|\s*.*$/g, '') // strip single pipe suffixes like "| T-Series"
        .replace(/\s*-\s*cover.*$/gi, '')
        .replace(/\s*\(from\s+["'].*?["']\)/gi, '')
        .replace(/\s*\(from\s+.*?\)/gi, '')
        .replace(/\s*\[from\s+.*?\]/gi, '')
        .replace(/\s*-\s*from\s+.*?$/gi, '')
        .replace(/\s*\(feat\..*?\)/gi, '')
        .replace(/\s*\(ft\..*?\)/gi, '')
        .replace(/\s*feat\..*/gi, '')
        .replace(/\s*ft\..*/gi, '')
        .replace(/\s*\(.*?official.*?\)/gi, '')
        .replace(/\s*\[.*?official.*?\]/gi, '')
        .replace(/\s*\(.*?video.*?\)/gi, '')
        .replace(/\s*\[.*?video.*?\]/gi, '')
        .replace(/\s*\(.*?audio.*?\)/gi, '')
        .replace(/\s*\[.*?audio.*?\]/gi, '')
        .replace(/\s*\(.*?lyrics?.*?\)/gi, '')
        .replace(/\s*\[.*?lyrics?.*?\]/gi, '')
        .replace(/\s*\(full\s+song.*?\)/gi, '')
        .replace(/\s*\(remaster(ed)?.*?\)/gi, '')
        .replace(/\s*\(cover\)/gi, '')
        .replace(/\s*\[cover\]/gi, '')
        .replace(/\s*\(live.*?\)/gi, '')
        .replace(/\s*\[live.*?\]/gi, '')
        .replace(/\s*\(slowed\s*(\+|\&)?\s*reverb\)/gi, '')
        .replace(/\s*\(sped\s*up\)/gi, '')
        .replace(/\s*【.*?】/g, '')
        .trim();
}
function formatLrcMs(timeMs) {
    const totalSeconds = timeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centiseconds = Math.floor((timeMs % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}
async function fetchAppleMusicLyrics(trackName, artistName, retryCount = 0) {
    if (retryCount > 1)
        return null;
    try {
        const token = await appleTokenManager.getToken();
        if (!token)
            return null;
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
            return fetchAppleMusicLyrics(trackName, artistName, retryCount + 1);
        }
        if (!searchRes.ok) {
            console.warn(`[LyricsService] Apple Music catalog search returned status ${searchRes.status}`);
            return null;
        }
        const searchJson = await searchRes.json();
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
        const lyricsJson = await lyricsRes.json();
        let syncedLyrics = null;
        let plainLyrics = lyricsJson.plain || null;
        let ttml = lyricsJson.ttml || null;
        if (lyricsJson.ttml && typeof lyricsJson.ttml === 'string' && lyricsJson.ttml.includes('<tt')) {
            ttml = lyricsJson.ttml;
            syncedLyrics = lyricsJson.ttml;
        }
        else if (lyricsJson.elrcMultiPerson) {
            syncedLyrics = lyricsJson.elrcMultiPerson;
        }
        else if (lyricsJson.elrc) {
            syncedLyrics = lyricsJson.elrc;
        }
        else if (lyricsJson.content && Array.isArray(lyricsJson.content)) {
            const lrcLines = [];
            const plainLines = [];
            for (const line of lyricsJson.content) {
                const timeMs = line.timestamp || 0;
                const timeStr = formatLrcMs(timeMs);
                let agentPrefix = '';
                if (line.background)
                    agentPrefix = '{bg}';
                else if (line.oppositeTurn)
                    agentPrefix = '{agent:v2}';
                if (Array.isArray(line.text) && line.text.length > 0) {
                    let lineStr = `[${timeStr}]${agentPrefix}`;
                    let plainStr = '';
                    for (const w of line.text) {
                        const wTimeMs = w.timestamp !== undefined ? w.timestamp : timeMs;
                        const wTimeStr = formatLrcMs(wTimeMs);
                        const wText = w.text || '';
                        lineStr += `<${wTimeStr}>${wText} `;
                        plainStr += wText + ' ';
                    }
                    lrcLines.push(lineStr.trimEnd());
                    plainLines.push(plainStr.trimEnd());
                }
                else if (typeof line.text === 'string' && line.text.trim()) {
                    lrcLines.push(`[${timeStr}]${agentPrefix}${line.text.trim()}`);
                    plainLines.push(line.text.trim());
                }
            }
            syncedLyrics = lrcLines.join('\n');
            if (!plainLyrics) {
                plainLyrics = plainLines.join('\n');
            }
        }
        if (!syncedLyrics && !plainLyrics && !ttml) {
            return null;
        }
        return {
            syncedLyrics: syncedLyrics || ttml,
            plainLyrics,
            ttml,
            isSyllableSynced: Boolean(ttml && ttml.includes('<span')),
            isWordSynced: Boolean(ttml || (syncedLyrics && syncedLyrics.includes('<'))),
            provider: 'apple-music',
            trackName: attr.name || trackName,
            artistName: attr.artistName || artistName,
            albumName,
            duration,
        };
    }
    catch (error) {
        console.error('[LyricsService] Error in fetchAppleMusicLyrics:', error);
        return null;
    }
}
let musixmatchToken = null;
let musixmatchTokenExpiry = 0;
async function getMusixmatchToken() {
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
        if (!res.ok)
            throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
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
    }
    catch (e) {
        console.error('[LyricsService] Failed to get Musixmatch token:', e);
    }
    return null;
}
function formatLrcTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 100);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}
async function fetchMusixmatchLyrics(trackName, artistName) {
    try {
        const token = await getMusixmatchToken();
        if (!token)
            return null;
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
        if (!searchRes.ok)
            return null;
        const searchJson = await searchRes.json();
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
        if (!bestTrack)
            return null;
        const trackId = bestTrack.track_id;
        const commontrackId = bestTrack.commontrack_id;
        const albumName = bestTrack.album_name || '';
        const duration = bestTrack.track_length || 0;
        console.log(`[LyricsService] Musixmatch found track_id: ${trackId}, commontrack_id: ${commontrackId}`);
        let syncedLyrics = null;
        let plainLyrics = null;
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
                const richsyncJson = await richsyncRes.json();
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
        }
        catch (richsyncErr) {
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
                    const subtitleJson = await subtitleRes.json();
                    if (subtitleJson?.message?.header?.status_code === 200) {
                        syncedLyrics = subtitleJson?.message?.body?.subtitle?.subtitle_body || null;
                        console.log('[LyricsService] Successfully fetched line-level subtitle lyrics.');
                    }
                }
            }
            catch (subErr) {
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
                const plainJson = await plainRes.json();
                if (plainJson?.message?.header?.status_code === 200) {
                    plainLyrics = plainJson?.message?.body?.lyrics?.lyrics_body || null;
                    if (plainLyrics) {
                        plainLyrics = plainLyrics.replace(/\*\*\*\*\*\*\* This Lyrics is NOT for Commercial use \*\*\*\*\*\*\*/g, '').trim();
                        plainLyrics = plainLyrics.replace(/\(\d+\)/g, '').trim();
                    }
                }
            }
        }
        catch (plainErr) {
            console.warn('[LyricsService] Musixmatch plain lyrics fetching failed:', plainErr);
        }
        if (!syncedLyrics && !plainLyrics)
            return null;
        return {
            syncedLyrics,
            plainLyrics,
            trackName: bestTrack.track_name || trackName,
            artistName: bestTrack.artist_name || artistName,
            albumName,
            duration,
        };
    }
    catch (error) {
        console.error('[LyricsService] Error in fetchMusixmatchLyrics:', error);
        return null;
    }
}
async function fetchLrcLibLyrics(trackName, artistName, albumName, duration) {
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
        }
        catch (e) {
            console.warn('[LyricsService] LRCLIB get timed out or failed, falling back...');
        }
        finally {
            clearTimeout(timeout);
        }
        if (res && res.ok) {
            const data = await res.json();
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
            searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`, {
                headers: {
                    'User-Agent': 'Singularity Music Player/1.0 (https://github.com/singularity-player)',
                },
                signal: searchController.signal
            });
        }
        catch (e) {
            console.warn('[LyricsService] LRCLIB search timed out or failed, falling back...');
        }
        finally {
            clearTimeout(searchTimeout);
        }
        if (searchRes && searchRes.ok) {
            const searchData = await searchRes.json();
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
    }
    catch (error) {
        console.error('[LyricsService] Error in fetchLrcLibLyrics:', error);
    }
    return null;
}
async function fetchYouTubeCaptions(trackName, artistName) {
    try {
        console.log(`[LyricsService] Querying YouTube search for captions: ${artistName} - ${trackName}`);
        const results = await (0, youtubeService_1.searchYouTube)(`${artistName} ${trackName}`);
        if (!results || results.length === 0) {
            console.log('[LyricsService] YouTube captions search: No videos found.');
            return null;
        }
        const videoId = results[0].videoId;
        if (!videoId)
            return null;
        console.log(`[LyricsService] Fetching YouTube captions/transcript for videoId: ${videoId}`);
        try {
            const transcriptData = await (0, youtubeService_1.getYouTubeTranscript)(videoId);
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
        }
        catch (e) {
            console.log(`[LyricsService] No captions/transcript available on YouTube for videoId: ${videoId} (${e.message || e})`);
            return null;
        }
    }
    catch (error) {
        console.error('[LyricsService] Error in fetchYouTubeCaptions:', error);
        return null;
    }
}
async function fetchNetEaseLyrics(trackName, artistName) {
    try {
        console.log(`[LyricsService] Attempting NetEase fallback search for: ${artistName} - ${trackName}`);
        const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(`${artistName} ${trackName}`)}&type=1&limit=5`;
        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 3000);
        let searchRes;
        try {
            searchRes = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller1.signal
            });
        }
        finally {
            clearTimeout(timeout1);
        }
        if (!searchRes || !searchRes.ok)
            return null;
        const searchJson = await searchRes.json();
        const songId = searchJson?.result?.songs?.[0]?.id;
        if (!songId) {
            console.log(`[LyricsService] NetEase fallback search: no tracks found`);
            return null;
        }
        const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 3000);
        let lyricRes;
        try {
            lyricRes = await fetch(lyricUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller2.signal
            });
        }
        finally {
            clearTimeout(timeout2);
        }
        if (!lyricRes || !lyricRes.ok)
            return null;
        const lyricJson = await lyricRes.json();
        const syncedLyrics = lyricJson?.lrc?.lyric || null;
        const plainLyrics = lyricJson?.klyric?.lyric || null;
        if (!syncedLyrics && !plainLyrics)
            return null;
        if (syncedLyrics && syncedLyrics.trim() === '') {
            return null;
        }
        const result = {
            syncedLyrics,
            plainLyrics,
            trackName,
            artistName,
            albumName: searchJson?.result?.songs?.[0]?.album?.name || '',
            duration: Math.round((searchJson?.result?.songs?.[0]?.duration || 0) / 1000),
        };
        console.log(`[LyricsService] NetEase fallback lyrics retrieved successfully for: ${artistName} - ${trackName}`);
        return result;
    }
    catch (error) {
        console.error('[LyricsService] NetEase fallback search failed:', error);
        return null;
    }
}
/**
 * Better Lyrics API provider (https://github.com/better-lyrics/better-lyrics)
 * Fetches syllable-synced and word-synced TTML / LRC lyrics with multi-singer metadata.
 */
async function fetchBetterLyrics(trackName, artistName, duration) {
    const cleanTrack = cleanSearchString(trackName);
    const cleanArtist = cleanSearchString(artistName);
    const endpoints = [
        `https://api.better-lyrics.org/getLyrics?s=${encodeURIComponent(cleanTrack)}&a=${encodeURIComponent(cleanArtist)}${duration ? `&d=${Math.round(duration)}` : ''}`,
        `https://cf-api.better-lyrics.org/getLyrics?s=${encodeURIComponent(cleanTrack)}&a=${encodeURIComponent(cleanArtist)}${duration ? `&d=${Math.round(duration)}` : ''}`,
    ];
    for (const endpoint of endpoints) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(endpoint, {
                headers: {
                    'User-Agent': 'SingularityPlayer/1.5.0 (https://github.com/better-lyrics/better-lyrics)',
                    'Accept': 'application/json, text/plain, */*'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (data && (data.ttml || data.syncedLyrics || data.lyrics || data.lrc)) {
                    const ttml = data.ttml || null;
                    const syncedLyrics = data.syncedLyrics || data.lrc || (ttml ? ttml : null);
                    const plainLyrics = data.plainLyrics || data.lyrics || null;
                    return {
                        syncedLyrics,
                        plainLyrics,
                        ttml,
                        isSyllableSynced: Boolean(ttml && ttml.includes('<span')),
                        isWordSynced: Boolean(ttml || (syncedLyrics && syncedLyrics.includes('<'))),
                        provider: 'better-lyrics',
                        translations: data.translations || null,
                        romanization: data.romanization || data.romaji || null,
                        trackName,
                        artistName,
                        albumName: data.album || '',
                        duration: duration || data.duration || 0
                    };
                }
            }
        }
        catch (err) {
            // Fall through to next provider
        }
    }
    return null;
}
async function fetchLyrics(rawTrackName, rawArtistName, albumName, duration) {
    const trackName = cleanSearchString(rawTrackName) || rawTrackName;
    const artistName = cleanSearchString(rawArtistName) || rawArtistName;
    // 1. Check in-memory cache
    const cached = lyricsCache.get(trackName, artistName);
    if (cached !== undefined)
        return cached;
    // 2. Check permanent disk cache
    const diskCached = await getLyricsFromDisk(trackName, artistName);
    if (diskCached !== undefined) {
        lyricsCache.set(trackName, artistName, diskCached);
        return diskCached;
    }
    // 3. Fallback Chain: Better Lyrics -> Apple Music TTML -> Musixmatch -> LRCLIB -> YouTube Captions -> NetEase
    // A0. Better Lyrics (Highest precision syllable TTML & word-sync)
    const betterLyricsRes = await fetchBetterLyrics(trackName, artistName, duration);
    if (betterLyricsRes) {
        lyricsCache.set(trackName, artistName, betterLyricsRes);
        await saveLyricsToDisk(trackName, artistName, betterLyricsRes);
        return betterLyricsRes;
    }
    // A1. Apple Music
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
async function saveLyrics(track, artist, data) {
    lyricsCache.set(track, artist, data);
    await saveLyricsToDisk(track, artist, data);
}
async function clearLyricsCache() {
    lyricsCache.clear();
    try {
        ensureLyricsDir();
        const files = await fs.promises.readdir(LYRICS_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                await fs.promises.unlink(path.join(LYRICS_DIR, file));
            }
        }
    }
    catch (e) {
        console.error('[LyricsService] Error clearing lyrics disk cache:', e);
    }
}
