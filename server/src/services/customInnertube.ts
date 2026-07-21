import { YouTubeTrack } from './youtubeService';
import { getSignatureTimestamp, deobfuscateSignature, transformNParamInUrl } from './cipherDeobfuscator';
import crypto from 'crypto';

export interface InnerTubeClient {
  clientName: string;
  clientVersion: string;
  clientId: string;
  userAgent: string;
  origin: string;
  referer: string;
  osName?: string;
  osVersion?: string;
  deviceMake?: string;
  deviceModel?: string;
  androidSdkVersion?: string;
  isEmbedded?: boolean;
  loginSupported?: boolean;
}

import { getCookieHeader, getCookieMap, getSapisidHash } from './youtubeAuth';

let cachedVisitorData: string | null = null;
let lastVisitorDataFetch = 0;
const VISITOR_DATA_TTL = 30 * 60 * 1000; // 30 minutes

async function getVisitorData(): Promise<string | null> {
  if (cachedVisitorData && (Date.now() - lastVisitorDataFetch < VISITOR_DATA_TTL)) {
    return cachedVisitorData;
  }
  
  try {
    const res = await fetch('https://music.youtube.com/sw.js_data');
    if (!res.ok) return null;
    const text = await res.text();
    const jsonStr = text.substring(5); // Skip )]}'\n
    const data = JSON.parse(jsonStr);
    
    const findVisitorId = (val: any): string | null => {
      if (typeof val === 'string' && /^Cg[t|s]/.test(val)) {
        return val;
      }
      if (Array.isArray(val)) {
        for (const item of val) {
          const res = findVisitorId(item);
          if (res) return res;
        }
      } else if (typeof val === 'object' && val !== null) {
        for (const key of Object.keys(val)) {
          const res = findVisitorId(val[key]);
          if (res) return res;
        }
      }
      return null;
    };

    const visitorId = findVisitorId(data);
    if (visitorId) {
      cachedVisitorData = visitorId;
      lastVisitorDataFetch = Date.now();
      console.log(`[customInnertube] Dynamically resolved visitorData: ${visitorId}`);
      return visitorId;
    }
  } catch (err: any) {
    console.warn(`[customInnertube] Failed to fetch visitorData:`, err.message);
  }
  return null;
}

const clients: Record<string, InnerTubeClient> = {
  WEB: {
    clientName: "WEB",
    clientVersion: "2.20260213.00.00",
    clientId: "1",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  },
  WEB_REMIX: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20260213.01.00",
    clientId: "67",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://music.youtube.com",
    referer: "https://music.youtube.com/",
    loginSupported: true
  },
  WEB_CREATOR: {
    clientName: "WEB_CREATOR",
    clientVersion: "1.20260213.00.00",
    clientId: "62",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: true
  },
  TVHTML5: {
    clientName: "TVHTML5",
    clientVersion: "7.20260213.00.00",
    clientId: "7",
    userAgent: "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: true
  },
  TVHTML5_SIMPLY_EMBEDDED_PLAYER: {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    clientId: "85",
    userAgent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    isEmbedded: true,
    loginSupported: true
  },
  IOS: {
    clientName: "IOS",
    clientVersion: "21.03.1",
    clientId: "5",
    userAgent: "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    osName: "iOS",
    osVersion: "18.2.22C152",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  },
  IPADOS: {
    clientName: "IOS",
    clientVersion: "21.03.3",
    clientId: "5",
    userAgent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)",
    osName: "iPadOS",
    osVersion: "17.7.10.21H450",
    deviceMake: "Apple",
    deviceModel: "iPad7,6",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  },
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "19.30.34",
    clientId: "3",
    userAgent: "com.google.android.youtube/19.30.34 (Linux; U; Android 14; en_US; Pixel 8; Build/UD1A.230805.019; Cronet/127.0.6533.100)",
    osName: "Android",
    osVersion: "14",
    deviceMake: "Google",
    deviceModel: "Pixel 8",
    androidSdkVersion: "34",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: true
  },
  ANDROID_VR: {
    clientName: "ANDROID_VR",
    clientVersion: "1.61.48",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
    osName: "Android",
    osVersion: "12",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  },
  ANDROID_VR_1_43: {
    clientName: "ANDROID_VR",
    clientVersion: "1.43.32",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)",
    osName: "Android",
    osVersion: "12",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  },
  ANDROID_CREATOR: {
    clientName: "ANDROID_CREATOR",
    clientVersion: "25.03.101",
    clientId: "14",
    userAgent: "com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)",
    osName: "Android",
    osVersion: "15",
    deviceMake: "Google",
    deviceModel: "Pixel 9 Pro Fold",
    androidSdkVersion: "35",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: true
  },
  VISIONOS: {
    clientName: "VISIONOS",
    clientVersion: "0.1",
    clientId: "101",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    osName: "visionOS",
    osVersion: "1.3.21O771",
    deviceMake: "Apple",
    deviceModel: "RealityDevice14,1",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    loginSupported: false
  }
};

async function requestInnerTube(endpoint: string, clientKey: string, payload: any, extraParams: string = "", forceDomain: string | null = null, timeoutMs: number = 10000): Promise<any> {
  const client = clients[clientKey];
  if (!client) {
    throw new Error(`Unknown InnerTube client: ${clientKey}`);
  }
  
  const domain = forceDomain || (clientKey === "WEB_REMIX" ? "music.youtube.com" : "www.youtube.com");
  const url = `https://${domain}/youtubei/v1/${endpoint}?prettyPrint=false${extraParams}`;
  
  const context: any = {
    client: {
      clientName: client.clientName,
      clientVersion: client.clientVersion,
      hl: "en-US",
      gl: "US"
    }
  };
  
  if (client.osName) context.client.osName = client.osName;
  if (client.osVersion) context.client.osVersion = client.osVersion;
  if (client.deviceMake) context.client.deviceMake = client.deviceMake;
  if (client.deviceModel) context.client.deviceModel = client.deviceModel;
  if (client.androidSdkVersion) {
    context.client.androidSdkVersion = parseInt(client.androidSdkVersion, 10);
  }
  
  if (client.isEmbedded && payload.videoId) {
    context.thirdParty = {
      embedUrl: `https://www.youtube.com/watch?v=${payload.videoId}`
    };
  }
  
  const body = {
    context,
    ...payload
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": client.userAgent,
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client.clientId,
    "X-YouTube-Client-Version": client.clientVersion,
    "X-Origin": client.origin,
    "Referer": client.referer
  };

  try {
    const visitorId = await getVisitorData();
    if (visitorId) {
      headers["X-Goog-Visitor-Id"] = visitorId;
    }
  } catch (err: any) {
    // Ignore visitorId errors
  }

  const cookieHeader = getCookieHeader();
  if (client.loginSupported && cookieHeader) {
    headers["Cookie"] = cookieHeader;
    const cookieMap = getCookieMap();
    if (cookieMap["SAPISID"]) {
      const sapisidHash = getSapisidHash(cookieMap["SAPISID"], client.origin);
      headers["Authorization"] = `SAPISIDHASH ${sapisidHash}`;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`InnerTube request failed: ${res.status} ${await res.text()}`);
    }

    return res.json();
  } catch (error: any) {
    clearTimeout(timeout);
    throw error;
  }
}

export function parseMusicListItem(renderer: any): YouTubeTrack | null {
  try {
    if (!renderer) return null;
    const flexColumns = renderer.flexColumns;
    if (!flexColumns || flexColumns.length === 0) return null;
    
    const title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "Unknown Title";
    const videoId = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                    flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    
    if (!videoId) return null;

    // Artists runs
    let artist = "Unknown Artist";
    const artistCol = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    if (artistCol) {
      const artists = [];
      for (const run of artistCol) {
        if (run.text === " • ") break; // Stop at separator
        if (run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === "MUSIC_PAGE_TYPE_ARTIST") {
          artists.push(run.text);
        }
      }
      if (artists.length > 0) {
        artist = artists.join(", ");
      } else {
        artist = artistCol[0]?.text || "Unknown Artist";
      }
    }

    // Album
    let album = "Single";
    if (artistCol) {
      const dotIdx = artistCol.findIndex((r: any) => r.text === " • ");
      if (dotIdx !== -1 && dotIdx + 1 < artistCol.length) {
        const afterDot = artistCol.slice(dotIdx + 1);
        const albumRun = afterDot.find((r: any) => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === "MUSIC_PAGE_TYPE_ALBUM");
        if (albumRun) {
          album = albumRun.text;
        }
      }
    }

    // Duration
    let duration = 0;
    const durationRun = artistCol?.find((r: any) => {
      const text = (r.text || '').trim();
      return /^\d+:\d+(:\d+)?$/.test(text);
    });
    if (durationRun) {
      const parts = durationRun.text.trim().split(":");
      if (parts.length === 3) {
        duration = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      } else if (parts.length === 2) {
        duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      }
    }

    // Cover Art
    let coverArtUrl: string | null = null;
    const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    if (thumbnails && thumbnails.length > 0) {
      const sorted = [...thumbnails].sort((a: any, b: any) => b.width - a.width);
      coverArtUrl = sorted[0].url;
    }

    return {
      videoId,
      title,
      artist,
      album,
      duration,
      coverArtUrl,
      source: "youtube",
      quality: "YouTube Audio"
    };
  } catch (err) {
    console.warn("[InnerTube Parser] Failed to parse music list item:", err);
    return null;
  }
}

/**
 * Searches YouTube Music for tracks matching the query.
 */
export async function customSearch(query: string): Promise<YouTubeTrack[]> {
  try {
    const data = await requestInnerTube("search", "WEB_REMIX", {
      query,
      params: "EgWKAQIIAWoKEAkQBRAKEAMQHg==" // Songs filter
    });

    const tracks: YouTubeTrack[] = [];
    const contents = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    
    if (contents) {
      for (const section of contents) {
        if (section.musicShelfRenderer) {
          const shelf = section.musicShelfRenderer;
          if (shelf.contents) {
            for (const item of shelf.contents) {
              try {
                const renderer = item.musicResponsiveListItemRenderer;
                if (!renderer) continue;
                const parsed = parseMusicListItem(renderer);
                if (parsed) {
                  tracks.push(parsed);
                }
              } catch (itemErr) {
                console.warn("[InnerTube Search] Failed to parse item in search results:", itemErr);
              }
            }
          }
        }
      }
    }

    return tracks;
  } catch (error) {
    console.error("[InnerTube Search] Error:", error);
    return [];
  }
}

/**
 * Resolves track metadata and available audio formats using the IOS client.
 */
let lastSuccessfulClientKey = "VISIONOS";

function getClientKeysOrdered(clientKeyOverride?: string): string[] {
  if (clientKeyOverride) {
    return [clientKeyOverride];
  }

  const allKeys = Object.keys(clients);
  const isAndroid = (key: string) => key.startsWith("ANDROID");
  const androids = allKeys.filter(isAndroid);
  const nonAndroids = allKeys.filter(k => !isAndroid(k));

  const ordered: string[] = [];

  // 1. Add lastSuccessfulClientKey if non-Android and available
  if (lastSuccessfulClientKey && allKeys.includes(lastSuccessfulClientKey) && !isAndroid(lastSuccessfulClientKey)) {
    ordered.push(lastSuccessfulClientKey);
  }

  // 2. Add other non-Android clients
  for (const k of nonAndroids) {
    if (k !== lastSuccessfulClientKey) {
      ordered.push(k);
    }
  }

  // 3. Add lastSuccessfulClientKey if Android and available
  if (lastSuccessfulClientKey && allKeys.includes(lastSuccessfulClientKey) && isAndroid(lastSuccessfulClientKey)) {
    ordered.push(lastSuccessfulClientKey);
  }

  // 4. Add other Android clients
  for (const k of androids) {
    if (k !== lastSuccessfulClientKey) {
      ordered.push(k);
    }
  }

  return ordered;
}

export async function customPlayer(videoId: string, clientKey?: string): Promise<{ basicInfo: any; audioFormats: any[]; rawData?: any }> {
  const clientKeysToTry = getClientKeysOrdered(clientKey);

  let sts: number | null = null;
  try {
    sts = await getSignatureTimestamp();
  } catch (err: any) {
    console.warn(`[customInnertube] Failed to get signatureTimestamp:`, err.message);
  }

  let lastError: any = null;
  for (const key of clientKeysToTry) {
    try {
      console.log(`[customInnertube] Trying client ${key} for video ${videoId}...`);
      
      const payload: any = { videoId };
      if (sts && (key.startsWith("WEB") || key.startsWith("TVHTML5") || key.startsWith("VISIONOS"))) {
        payload.playbackContext = {
          contentPlaybackContext: {
            signatureTimestamp: sts
          }
        };
      }

      const data = await requestInnerTube("player", key, payload, "", null, 4000);
      
      const playabilityStatus = data.playabilityStatus?.status;
      if (playabilityStatus !== "OK") {
        throw new Error(`Playability status is ${playabilityStatus}: ${data.playabilityStatus?.reason || "unknown reason"}`);
      }

      if (!data.streamingData || !data.streamingData.adaptiveFormats) {
        throw new Error("Response is missing streamingData/adaptiveFormats");
      }

      const basicInfo = {
        title: data.videoDetails?.title || "Unknown",
        artist: data.videoDetails?.author || "Unknown Artist",
        album: "YouTube",
        duration: parseInt(data.videoDetails?.lengthSeconds, 10) || 0,
        coverArtUrl: data.videoDetails?.thumbnail?.thumbnails?.sort((a: any, b: any) => b.width - a.width)?.[0]?.url || null
      };

      const adaptiveFormats = data.streamingData.adaptiveFormats || [];
      const rawAudioFormats = adaptiveFormats.filter((f: any) => f.mimeType?.startsWith("audio/"));

      if (rawAudioFormats.length === 0) {
        throw new Error("No audio formats found in streamingData");
      }

      // Prioritize audio/mp4 (AAC) over audio/webm (Opus) for universal browser playback support
      let audioFormats = rawAudioFormats.filter((f: any) => f.mimeType?.includes('audio/mp4'));
      if (audioFormats.length === 0) {
        audioFormats = rawAudioFormats;
      }

      // Decipher and n-transform formats
      let bestFormat: any = null;
      for (const format of audioFormats) {
        let url = format.url;
        const cipherText = format.signatureCipher || format.cipher;
        if (!url && cipherText) {
          try {
            url = await deobfuscateSignature(cipherText, videoId);
          } catch (err: any) {
            console.warn(`[customInnertube] Signature deobfuscation failed for format itag ${format.itag} with client ${key}:`, err.message);
          }
        }
        
        if (url) {
          if (key.startsWith("WEB") || key.startsWith("TVHTML5") || key.startsWith("VISIONOS")) {
            try {
              url = await transformNParamInUrl(url);
            } catch (err: any) {
              console.warn(`[customInnertube] N-transform failed for format itag ${format.itag} with client ${key}:`, err.message);
            }
          }
          format.url = url;
        }
        
        if (url && (!bestFormat || (format.bitrate || 0) > (bestFormat.bitrate || 0))) {
          bestFormat = format;
        }
      }

      if (!bestFormat || !bestFormat.url) {
        throw new Error("No formats with valid URLs resolved");
      }

      console.log(`[customInnertube] Validating resolved stream URL for client ${key}...`);
      const isValid = await validateUrl(bestFormat.url);
      if (!isValid) {
        throw new Error(`Stream URL validation failed (Turnstile challenged or blocked)`);
      }

      console.log(`[customInnertube] Successfully resolved and validated video ${videoId} with client ${key}`);
      lastSuccessfulClientKey = key;
      return {
        basicInfo,
        audioFormats,
        rawData: data
      };
    } catch (err: any) {
      console.warn(`[customInnertube] Client ${key} failed for video ${videoId}:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error(`All InnerTube clients failed to resolve video ${videoId}`);
}

/**
 * Retrieves similar recommended tracks (autoplay/radio).
 */
export async function customGetRelated(videoId: string): Promise<any[]> {
  try {
    const nextData = await requestInnerTube("next", "WEB_REMIX", {
      videoId
    });

    const tabs = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
    const relatedTab = tabs?.find((t: any) => t.tabRenderer?.title?.toLowerCase() === "related" || t.tabRenderer?.title === "Related");
    const browseId = relatedTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    
    if (!browseId) {
      console.log("[InnerTube Related] No related browseId found.");
      return [];
    }

    const browseData = await requestInnerTube("browse", "WEB_REMIX", {
      browseId
    });

    const tracks: any[] = [];
    const contents = browseData.contents?.sectionListRenderer?.contents;
    if (contents) {
      for (const section of contents) {
        if (section.musicCarouselShelfRenderer) {
          const shelf = section.musicCarouselShelfRenderer;
          const title = shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text;
          if (title === "You might also like") {
            const items = shelf.contents || [];
            for (const item of items) {
              try {
                const renderer = item.musicResponsiveListItemRenderer;
                if (!renderer) continue;
                const parsed = parseMusicListItem(renderer);
                if (parsed) {
                  tracks.push({
                    id: `yt-${parsed.videoId}`,
                    title: parsed.title,
                    artist: parsed.artist,
                    album: parsed.album,
                    duration: parsed.duration,
                    coverArtUrl: parsed.coverArtUrl,
                    source: "youtube",
                    streamUrl: `/api/yt/stream/${parsed.videoId}`,
                    videoId: parsed.videoId,
                    addedAt: Date.now()
                  });
                }
              } catch (itemErr) {
                console.warn("[InnerTube Related] Failed to parse item in related shelf:", itemErr);
              }
            }
          }
        }
      }
    }

    return tracks;
  } catch (error) {
    console.error("[InnerTube Related] Error:", error);
    return [];
  }
}

/**
 * Lightweight player response fetcher specifically for transcripts.
 * Bypasses signature deciphering, n-parameter transform, and media URL validation.
 */
async function fetchPlayerResponseForTranscript(videoId: string, clientKey: string): Promise<any> {
  const payload: any = { videoId };
  return await requestInnerTube("player", clientKey, payload);
}

/**
 * Retrieves track transcripts (captions) via timedtext API.
 */
export async function customGetTranscript(videoId: string): Promise<any> {
  try {
    let playData: any = null;
    const captionClients = ["IOS", "IPADOS", "ANDROID", "WEB"];
    for (const clientKey of captionClients) {
      try {
        console.log(`[customInnertube] Fetching player response for transcript of ${videoId} via client ${clientKey}...`);
        const data = await fetchPlayerResponseForTranscript(videoId, clientKey);
        if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          playData = data;
          break;
        }
      } catch (e: any) {
        console.warn(`[customInnertube] Client ${clientKey} failed to get captions for ${videoId}:`, e.message || e);
      }
    }

    if (!playData) {
      console.warn(`[customInnertube] All caption clients failed to get player response for ${videoId}`);
      return null;
    }

    const captionTracks = playData.rawData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      console.warn(`[customInnertube] No caption tracks found in player response of ${videoId}`);
      return null;
    }
    
    // Prioritize English translation/subtitles, fallback to first track
    const track = captionTracks.find((t: any) => t.languageCode === 'en') || captionTracks[0];
    const timedTextUrl = `${track.baseUrl}&fmt=json3`;
    
    const timedTextRes = await fetch(timedTextUrl);
    if (!timedTextRes.ok) return null;
    
    const timedTextJson = await timedTextRes.json() as any;
    if (!timedTextJson.events) return null;
    
    const segments = timedTextJson.events
      .filter((e: any) => e.segs && e.segs.some((s: any) => s.utf8 && s.utf8.trim() !== ''))
      .map((e: any) => ({
        start_ms: e.tStartMs || 0,
        snippet: {
          text: e.segs.map((s: any) => s.utf8).join('')
        }
      }));
      
    return {
      transcript: {
        content: {
          body: {
            initial_segments: segments
          }
        }
      }
    };
  } catch (error) {
    console.error("[InnerTube Transcript] Error:", error);
    return null;
  }
}

async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Range": "bytes=0-1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (res.status === 200 || res.status === 206) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        return false;
      }
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Checks cookie health at server boot time by making a single, authenticated VISIONOS request.
 */
export async function checkCookieHealth(): Promise<void> {
  const cookieHeader = getCookieHeader();
  if (!cookieHeader) {
    console.log('[youtubeAuth] No YOUTUBE_COOKIE environment variable set. Running in anonymous mode.');
    return;
  }

  console.log('[youtubeAuth] YOUTUBE_COOKIE is set. Verifying credentials health...');
  try {
    const result = await customPlayer('dQw4w9WgXcQ', 'VISIONOS');
    if (result && result.audioFormats && result.audioFormats.length > 0) {
      console.log('[youtubeAuth] Credentials health check PASSED. Successfully authenticated and resolved formats.');
    } else {
      console.warn('[youtubeAuth] Credentials health check returned no formats, but did not throw.');
    }
  } catch (err: any) {
    const errMsg = err?.message || '';
    if (errMsg.includes('LOGIN_REQUIRED') || errMsg.includes('Sign in')) {
      console.error('========================================================================');
      console.error('[youtubeAuth] ERROR: YOUTUBE_COOKIE is set but appears EXPIRED or INVALID.');
      console.error('[youtubeAuth] YouTube returned: LOGIN_REQUIRED / Sign in required.');
      console.error('========================================================================');
    } else {
      console.warn('[youtubeAuth] Credentials check failed with a non-auth error:', errMsg);
    }
  }
}

