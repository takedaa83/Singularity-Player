import { YouTubeTrack } from './youtubeService';

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
}

const clients: Record<string, InnerTubeClient> = {
  WEB: {
    clientName: "WEB",
    clientVersion: "2.20260213.00.00",
    clientId: "1",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/"
  },
  WEB_REMIX: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20260213.01.00",
    clientId: "67",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://music.youtube.com",
    referer: "https://music.youtube.com/"
  },
  WEB_CREATOR: {
    clientName: "WEB_CREATOR",
    clientVersion: "1.20260213.00.00",
    clientId: "62",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/"
  },
  TVHTML5: {
    clientName: "TVHTML5",
    clientVersion: "7.20260213.00.00",
    clientId: "7",
    userAgent: "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/"
  },
  TVHTML5_SIMPLY_EMBEDDED_PLAYER: {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    clientId: "85",
    userAgent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    isEmbedded: true
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
    referer: "https://www.youtube.com/"
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
    referer: "https://www.youtube.com/"
  },
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "21.03.38",
    clientId: "3",
    userAgent: "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/"
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
    referer: "https://www.youtube.com/"
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
    referer: "https://www.youtube.com/"
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
    referer: "https://www.youtube.com/"
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
    referer: "https://www.youtube.com/"
  }
};

async function requestInnerTube(endpoint: string, clientKey: string, payload: any, extraParams: string = "", forceDomain: string | null = null): Promise<any> {
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
  if (client.androidSdkVersion) context.client.androidSdkVersion = client.androidSdkVersion;
  
  if (client.isEmbedded && payload.videoId) {
    context.thirdParty = {
      embedUrl: `https://www.youtube.com/watch?v=${payload.videoId}`
    };
  }
  
  const body = {
    context,
    ...payload
  };

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": client.userAgent,
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client.clientId,
    "X-YouTube-Client-Version": client.clientVersion,
    "X-Origin": client.origin,
    "Referer": client.referer
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`InnerTube request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
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
              const renderer = item.musicResponsiveListItemRenderer;
              if (!renderer) continue;
              
              const flexColumns = renderer.flexColumns;
              if (!flexColumns || flexColumns.length === 0) continue;
              
              const title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "Unknown Title";
              const videoId = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                              flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
              
              if (!videoId) continue;

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
              const durationRun = artistCol?.find((r: any) => /^\d+:\d+$/.test(r.text));
              if (durationRun) {
                const parts = durationRun.text.split(":");
                duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
              }

              // Cover Art
              let coverArtUrl: string | null = null;
              const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
              if (thumbnails && thumbnails.length > 0) {
                const sorted = [...thumbnails].sort((a: any, b: any) => b.width - a.width);
                coverArtUrl = sorted[0].url;
              }

              tracks.push({
                videoId,
                title,
                artist,
                album,
                duration,
                coverArtUrl,
                source: "youtube",
                quality: "YouTube Audio"
              });
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
export async function customPlayer(videoId: string, clientKey?: string): Promise<{ basicInfo: any; audioFormats: any[]; rawData?: any }> {
  const clientKeysToTry = clientKey ? [clientKey] : [
    "VISIONOS",
    "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    "TVHTML5",
    "ANDROID_VR",
    "ANDROID_VR_1_43",
    "IOS",
    "IPADOS",
    "ANDROID_CREATOR",
    "ANDROID",
    "WEB"
  ];

  let lastError: any = null;
  for (const key of clientKeysToTry) {
    try {
      console.log(`[customInnertube] Trying client ${key} for video ${videoId}...`);
      const data = await requestInnerTube("player", key, { videoId });
      
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
      const audioFormats = adaptiveFormats.filter((f: any) => f.mimeType?.startsWith("audio/"));

      if (audioFormats.length === 0) {
        throw new Error("No audio formats found in streamingData");
      }

      console.log(`[customInnertube] Successfully resolved video ${videoId} with client ${key}`);
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
              const renderer = item.musicResponsiveListItemRenderer;
              if (!renderer) continue;

              const flexColumns = renderer.flexColumns;
              if (!flexColumns || flexColumns.length === 0) continue;

              const titleText = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "Unknown Title";
              const itemVideoId = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                                  flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

              if (!itemVideoId) continue;

              const artistCol = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
              let artistText = "Unknown Artist";
              if (artistCol) {
                const artists = [];
                for (const run of artistCol) {
                  if (run.text === " • ") break;
                  if (run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === "MUSIC_PAGE_TYPE_ARTIST") {
                    artists.push(run.text);
                  }
                }
                if (artists.length > 0) {
                  artistText = artists.join(", ");
                } else {
                  artistText = artistCol[0]?.text || "Unknown Artist";
                }
              }

              let albumText = "Single";
              if (artistCol) {
                const dotIdx = artistCol.findIndex((r: any) => r.text === " • ");
                if (dotIdx !== -1 && dotIdx + 1 < artistCol.length) {
                  const afterDot = artistCol.slice(dotIdx + 1);
                  const albumRun = afterDot.find((r: any) => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === "MUSIC_PAGE_TYPE_ALBUM");
                  if (albumRun) {
                    albumText = albumRun.text;
                  }
                }
              }

              let durationSec = 0;
              const durationRun = artistCol?.find((r: any) => /^\d+:\d+$/.test(r.text));
              if (durationRun) {
                const parts = durationRun.text.split(":");
                durationSec = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
              }

              let coverArtUrl = null;
              const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
              if (thumbnails && thumbnails.length > 0) {
                const sorted = [...thumbnails].sort((a: any, b: any) => b.width - a.width);
                coverArtUrl = sorted[0].url;
              }

              tracks.push({
                id: `yt-${itemVideoId}`,
                title: titleText,
                artist: artistText,
                album: albumText,
                duration: durationSec,
                coverArtUrl,
                source: "youtube",
                streamUrl: `/api/yt/stream/${itemVideoId}`,
                videoId: itemVideoId,
                addedAt: Date.now()
              });
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
 * Retrieves track transcripts (captions) via timedtext API.
 */
export async function customGetTranscript(videoId: string): Promise<any> {
  try {
    let playData: any = null;
    const captionClients = ["IOS", "IPADOS", "ANDROID", "WEB"];
    for (const clientKey of captionClients) {
      try {
        console.log(`[customInnertube] Trying client ${clientKey} for captions of ${videoId}...`);
        const data = await customPlayer(videoId, clientKey);
        if (data.rawData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
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
