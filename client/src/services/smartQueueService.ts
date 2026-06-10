import { usePlayerStore } from '../stores/playerStore';
import { initDB } from '../lib/db';
import { Track } from '../types';
import { api } from '../utils/api';

export interface AudioFeatures {
  bpm: number;
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  genre: string;
  year: number;
}

const GENRE_FAMILIES: Record<string, string[]> = {
  rock: ['rock', 'alternative rock', 'indie rock', 'punk rock', 'metal', 'grunge', 'hard rock', 'soft rock', 'alt-rock', 'indie-rock'],
  pop: ['pop', 'dance', 'synthpop', 'indie pop', 'electro-pop', 'bedroom pop', 'k-pop', 'j-pop'],
  hiphop: ['hip hop', 'rap', 'trap', 'r&b', 'soul', 'hip-hop', 'lofi hip hop'],
  electronic: ['electronic', 'edm', 'house', 'techno', 'ambient', 'chillout', 'downtempo', 'synthwave'],
  classical: ['classical', 'instrumental', 'orchestral', 'piano', 'ambient classical'],
  jazz: ['jazz', 'blues', 'soul', 'funk']
};

import {
  cleanString,
  normalizeTitleForDuplication,
  isDuplicateTrack
} from '../utils/trackUtils';

export {
  cleanString,
  normalizeTitleForDuplication,
  isDuplicateTrack
};

const QUALITY_BLACKLIST_PATTERNS = [
  /^untitled/i,
  /test\s*track/i,
  /no\s*title/i,
  /unknown\s*track/i,
  /10\s*hours?/i,
  /ringtone/i,
  /whatsapp\s*status/i,
  /earrape/i,
  /bass\s*boost(ed)?/i,
  /low\s*quality/i,
];

export function areGenresRelated(genreA: string, genreB: string): boolean {
  const gA = (genreA || '').toLowerCase().trim();
  const gB = (genreB || '').toLowerCase().trim();
  if (!gA || !gB) return false;
  if (gA === gB) return true;
  for (const family in GENRE_FAMILIES) {
    const list = GENRE_FAMILIES[family];
    const hasA = list.some(g => gA.includes(g) || g.includes(gA));
    const hasB = list.some(g => gB.includes(g) || g.includes(gB));
    if (hasA && hasB) return true;
  }
  return false;
}

export function hasRealAudioFeatures(track: Track): boolean {
  return (
    (track.bpm !== undefined && track.bpm !== null && track.bpm > 0) ||
    (track.audioFeatures !== undefined && track.audioFeatures !== null)
  );
}

export function passesQualityFilter(track: Track): boolean {
  const title = (track.title || '').trim();
  const artist = (track.artist || '').trim();
  if (!title || title.length < 2) return false;
  if (!artist || artist.length < 1) return false;
  if (track.duration !== undefined && track.duration !== null && track.duration !== 0) {
    if (track.duration < 60 || track.duration > 900) return false;
  }
  for (const pattern of QUALITY_BLACKLIST_PATTERNS) {
    if (pattern.test(title)) return false;
  }
  return true;
}

// Keep isHighQualityTrack name for compatibility with imports in playlistGenerator.ts
export function isHighQualityTrack(track: Track): boolean {
  return passesQualityFilter(track);
}

function fnv1a(str: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getAudioFeatures(track: Track): AudioFeatures {
  const genre = (track.genre || 'Pop').toLowerCase().trim();
  const year = track.year || 2018;
  if (hasRealAudioFeatures(track)) {
    const bpm = track.bpm || track.audioFeatures?.bpm || 120;
    const energy = track.energy !== undefined && track.energy !== null ? track.energy : (track.audioFeatures?.energy ?? 0.5);
    const valence = track.valence !== undefined && track.valence !== null ? track.valence : (track.audioFeatures?.valence ?? 0.5);
    const danceability = track.danceability !== undefined && track.danceability !== null ? track.danceability : (track.audioFeatures?.danceability ?? 0.5);
    const acousticness = track.acousticness !== undefined && track.acousticness !== null ? track.acousticness : (track.audioFeatures?.acousticness ?? 0.5);
    const instrumentalness = track.instrumentalness !== undefined && track.instrumentalness !== null ? track.instrumentalness : (track.audioFeatures?.instrumentalness ?? 0.5);
    return { bpm, energy, valence, danceability, acousticness, instrumentalness, genre, year };
  }
  const cleanedTitle = cleanString(track.title || '');
  const cleanedArtist = cleanString(track.artist || '');
  const seed = fnv1a(`${cleanedTitle}|${cleanedArtist}`);
  return {
    bpm: 75 + (seed % 91),
    energy: 0.1 + ((seed % 100) / 100) * 0.9,
    valence: ((seed * 7) % 100) / 100,
    danceability: ((seed * 13) % 100) / 100,
    acousticness: ((seed * 17) % 100) / 100,
    instrumentalness: ((seed * 23) % 100) / 100,
    genre,
    year,
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getFeatureVector(f: AudioFeatures): number[] {
  return [
    f.energy * 1.5,
    f.valence * 1.5,
    f.danceability * 1.0,
    f.acousticness * 0.8,
    f.instrumentalness * 0.8,
  ];
}

function computeSessionVector(sessionTracks: Track[]): number[] | null {
  const vectors = sessionTracks
    .filter(t => hasRealAudioFeatures(t))
    .map(t => getFeatureVector(getAudioFeatures(t)));
  if (vectors.length === 0) return null;
  const sum = vectors[0].map((_, i) => vectors.reduce((acc, v) => acc + v[i], 0));
  return sum.map(s => s / vectors.length);
}

type DiscoveryTier = 'familiar' | 'discovery' | 'wildcard';

interface ScoredTrack {
  track: Track;
  score: number;
  tier: DiscoveryTier;
}

export const SmartQueueService = {
  async triggerAutoQueue(currentTrack: Track): Promise<void> {
    try {
      const playerStore = usePlayerStore.getState();
      if (playerStore.queue.length >= 50) return;

      const db = await initDB();
      const videoId = currentTrack.videoId || (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined);

      let relatedTracks: Track[] = [];
      try {
        const results = await api.ytRadio(videoId, currentTrack.title, currentTrack.artist);
        if (results && results.length > 0) relatedTracks = results;
      } catch (err) {
        console.error('[SmartQueueService] Failed to fetch related tracks online:', err);
      }

      if (relatedTracks.length === 0) relatedTracks = await db.getAll('tracks');
      if (relatedTracks.length === 0) return;

      // Limit candidate tracks from any single artist to at most 4 in the raw pool
      const rawArtistCounts = new Map<string, number>();
      relatedTracks = relatedTracks.filter(t => {
        const artist = (t.artist || '').toLowerCase().trim();
        const currentCount = rawArtistCounts.get(artist) || 0;
        if (currentCount >= 4) return false;
        rawArtistCounts.set(artist, currentCount + 1);
        return true;
      });

      // If candidates are sparse, pull in tracks of other artists from the local library database
      if (relatedTracks.length < 15) {
        const localTracks = await db.getAll('tracks');
        const localFiltered = localTracks.filter(passesQualityFilter);
        for (const t of localFiltered) {
          const artist = (t.artist || '').toLowerCase().trim();
          if (!rawArtistCounts.has(artist) || rawArtistCounts.get(artist)! < 2) {
            relatedTracks.push(t);
            rawArtistCounts.set(artist, (rawArtistCounts.get(artist) || 0) + 1);
          }
        }
      }

      relatedTracks = relatedTracks
        .filter(passesQualityFilter)
        .filter(t => !isDuplicateTrack(t, currentTrack));

      const existingDocs = await Promise.all(relatedTracks.map(t => db.get('tracks', t.id)));
      const existingMap = new Map<string, boolean>(
        existingDocs.filter((t): t is Track => !!t).map(t => [t.id, true])
      );
      const tx = db.transaction('tracks', 'readwrite');
      for (const track of relatedTracks) {
        if (!existingMap.has(track.id)) tx.store.put(track);
      }
      await tx.done;

      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const recentHistory = await db.getAllFromIndex('history', 'playedAt', IDBKeyRange.lowerBound(twoHoursAgo));
      const recentlyPlayedIds = new Set<string>(recentHistory.map(entry => entry.trackId));

      const monthHistory = await db.getAllFromIndex('history', 'playedAt', IDBKeyRange.lowerBound(thirtyDaysAgo));
      const playedInLast30Days = new Set<string>(monthHistory.map(entry => entry.trackId));

      const queueIds = new Set<string>(playerStore.queue.map(t => t.id));

      const recentSessions = await db.getAllFromIndex('playSessions', 'startTime', IDBKeyRange.lowerBound(thirtyDaysAgo));
      const completedSessionTrackIds = new Set<string>(recentSessions.filter(s => s.completed).map(s => s.trackId));

      const favorites = await db.getAll('favorites');
      const favoriteTrackIds = new Set(favorites.map(f => f.trackId));
      const favoriteArtists = new Set<string>();
      const favoriteGenres = new Set<string>();

      const targetTrackIds = new Set<string>([...favoriteTrackIds, ...completedSessionTrackIds]);
      const trackDocs = await Promise.all(Array.from(targetTrackIds).map(id => db.get('tracks', id)));
      const tracksToAnalyze = trackDocs.filter((t): t is Track => !!t);
      const trackMap = new Map<string, Track>(tracksToAnalyze.map(t => [t.id, t]));

      for (const fId of favoriteTrackIds) {
        const track = trackMap.get(fId);
        if (track) {
          const artist = (track.artist || '').toLowerCase().trim();
          const genre = (track.genre || '').toLowerCase().trim();
          if (artist) favoriteArtists.add(artist);
          if (genre) favoriteGenres.add(genre);
        }
      }

      for (const s of recentSessions) {
        if (s.completed) {
          const track = trackMap.get(s.trackId);
          if (track) {
            const artist = (track.artist || '').toLowerCase().trim();
            const genre = (track.genre || '').toLowerCase().trim();
            if (artist) favoriteArtists.add(artist);
            if (genre) favoriteGenres.add(genre);
          }
        }
      }

      const sessionTrackIds = Array.from(recentlyPlayedIds).slice(-5);
      const sessionTrackDocs = await Promise.all(sessionTrackIds.map(id => db.get('tracks', id)));
      const sessionTracks = sessionTrackDocs.filter((t): t is Track => !!t);
      const sessionVector = computeSessionVector([currentTrack, ...sessionTracks]);

      const sessionGenres = new Map<string, number>();
      for (const t of [currentTrack, ...sessionTracks]) {
        const g = (t.genre || '').toLowerCase().trim();
        if (g) sessionGenres.set(g, (sessionGenres.get(g) || 0) + 1);
      }
      const dominantSessionGenre = [...sessionGenres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      const currentHasReal = hasRealAudioFeatures(currentTrack);
      const currentFeatures = getAudioFeatures(currentTrack);
      const currentVector = getFeatureVector(currentFeatures);

      const scored: ScoredTrack[] = relatedTracks
        .filter(track => {
          if (track.id === currentTrack.id) return false;
          if (queueIds.has(track.id)) return false;
          if (isDuplicateTrack(track, currentTrack)) return false;
          if (playerStore.queue.some(q => isDuplicateTrack(q, track))) return false;
          return true;
        })
        .map(track => {
          const candidateHasReal = hasRealAudioFeatures(track);
          const candArtist = (track.artist || '').toLowerCase().trim();
          const currArtist = (currentTrack.artist || '').toLowerCase().trim();
          const candGenre = (track.genre || '').toLowerCase().trim();
          const currGenre = (currentTrack.genre || '').toLowerCase().trim();
          let score = 0;

          if (!currentHasReal || !candidateHasReal) {
            if (candGenre && candGenre === currGenre && candGenre !== 'unknown') {
              score += 0.40;
            } else if (areGenresRelated(candGenre, currGenre) && candGenre !== 'unknown') {
              score += 0.25;
            } else if (favoriteGenres.has(candGenre)) {
              score += 0.15;
            }

            if (candArtist && candArtist === currArtist) {
              score += 0.30;
            } else if (favoriteArtists.has(candArtist)) {
              score += 0.15;
            }

            const candAlbum = (track.album || '').toLowerCase().trim();
            const currAlbum = (currentTrack.album || '').toLowerCase().trim();
            if (candAlbum && candAlbum === currAlbum && candAlbum !== 'unknown') {
              score += 0.15;
            }

            if (track.year && currentTrack.year) {
              const yearDiff = Math.abs(track.year - currentTrack.year);
              if (yearDiff <= 3) score += 0.10;
              else if (yearDiff <= 10) score += 0.05;
            }

            if (track.source === currentTrack.source) score += 0.05;
            if (dominantSessionGenre && candGenre === dominantSessionGenre) score += 0.08;
          } else {
            const features = getAudioFeatures(track);
            const candidateVector = getFeatureVector(features);
            score = cosineSimilarity(currentVector, candidateVector);

            if (sessionVector) {
              score += cosineSimilarity(sessionVector, candidateVector) * 0.20;
            }

            if (features.genre === currentFeatures.genre && features.genre !== 'unknown') {
              score += 0.15;
            } else if (areGenresRelated(features.genre, currentFeatures.genre) && features.genre !== 'unknown') {
              score += 0.08;
            } else if (favoriteGenres.has(features.genre)) {
              score += 0.05;
            } else if (features.genre !== 'unknown' && currentFeatures.genre !== 'unknown') {
              score -= 0.15;
            }

            if (dominantSessionGenre && features.genre === dominantSessionGenre) score += 0.07;

            const bpmDiffPercent = Math.abs(features.bpm - currentFeatures.bpm) / currentFeatures.bpm;
            if (bpmDiffPercent <= 0.10) score += 0.10;
            else if (bpmDiffPercent <= 0.20) score += 0.03;

            if (currentFeatures.energy > 0.7 && features.energy < currentFeatures.energy * 0.8) {
              score -= 0.30;
            }

            if (candArtist && candArtist === currArtist) {
              score += 0.15;
            } else if (favoriteArtists.has(candArtist)) {
              score += 0.05;
            }
          }

          if (recentlyPlayedIds.has(track.id)) {
            score -= 2.0;
          } else if (!playedInLast30Days.has(track.id)) {
            score += 0.08;
          }

          if (favoriteTrackIds.has(track.id)) score += 0.05;
          if (completedSessionTrackIds.has(track.id)) score += 0.06;

          const isSameArtist = candArtist === (currentTrack.artist || '').toLowerCase().trim();
          const isFavoriteArtist = favoriteArtists.has(candArtist);
          const isSameGenre = candGenre === (currentTrack.genre || '').toLowerCase().trim() || areGenresRelated(candGenre, (currentTrack.genre || '').toLowerCase().trim());

          let tier: DiscoveryTier;
          if (isSameArtist || (isSameGenre && isFavoriteArtist)) {
            tier = 'familiar';
          } else if (isSameGenre || isFavoriteArtist) {
            tier = 'discovery';
          } else {
            tier = 'wildcard';
          }

          return { track, score, tier };
        });

      const TARGET = 5;
      const FAMILIAR_SLOTS = Math.round(TARGET * 0.60);
      const WILDCARD_SLOTS = Math.max(1, Math.round(TARGET * 0.10));
      const DISCOVERY_SLOTS = TARGET - FAMILIAR_SLOTS - WILDCARD_SLOTS;

      const familiars = scored.filter(s => s.tier === 'familiar').sort((a, b) => b.score - a.score);
      const discoveries = scored.filter(s => s.tier === 'discovery').sort((a, b) => b.score - a.score);
      const wildcards = scored.filter(s => s.tier === 'wildcard').sort((a, b) => b.score - a.score);

      const candidatePool: ScoredTrack[] = [
        ...familiars.slice(0, FAMILIAR_SLOTS),
        ...discoveries.slice(0, DISCOVERY_SLOTS),
        ...wildcards.slice(0, WILDCARD_SLOTS),
      ];

      if (candidatePool.length < TARGET) {
        const poolIds = new Set(candidatePool.map(s => s.track.id));
        const fallback = scored.sort((a, b) => b.score - a.score);
        for (const item of fallback) {
          if (!poolIds.has(item.track.id)) {
            candidatePool.push(item);
            poolIds.add(item.track.id);
          }
          if (candidatePool.length >= TARGET) break;
        }
      }

      const getRecentArtistCount = (artistName: string, selectedBatch: Track[], queue: Track[], windowSize = 5) => {
        const cleanName = artistName.toLowerCase().trim();
        let count = 0;
        for (const track of selectedBatch) {
          if ((track.artist || '').toLowerCase().trim() === cleanName) count++;
        }
        const queueToCheck = queue.slice(-windowSize);
        for (const track of queueToCheck) {
          if ((track.artist || '').toLowerCase().trim() === cleanName) count++;
        }
        return count;
      };

      const getConsecutiveArtistCount = (artistName: string, selectedBatch: Track[], queue: Track[]) => {
        const cleanName = artistName.toLowerCase().trim();
        const allTracks = [...queue, ...selectedBatch];
        let count = 0;
        for (let i = allTracks.length - 1; i >= 0; i--) {
          if ((allTracks[i].artist || '').toLowerCase().trim() === cleanName) {
            count++;
          } else {
            break;
          }
        }
        return count;
      };

      const selectedTracks: Track[] = [];
      const sortedPool = [...candidatePool].sort((a, b) => b.score - a.score);

      while (selectedTracks.length < TARGET && sortedPool.length > 0) {
        let indexToPick = sortedPool.findIndex(item => {
          const artist = (item.track.artist || '').toLowerCase().trim();
          const isDup = selectedTracks.some(t => isDuplicateTrack(t, item.track));
          if (isDup) return false;
          
          const consecutive = getConsecutiveArtistCount(artist, selectedTracks, playerStore.queue);
          const totalInWindow = getRecentArtistCount(artist, selectedTracks, playerStore.queue, 5);
          
          // Strict rule: max 2 consecutive, max 2 in recent window of 5
          return consecutive < 2 && totalInWindow < 2;
        });

        if (indexToPick === -1) {
          // Relax total count to < 3, consecutive < 2
          indexToPick = sortedPool.findIndex(item => {
            const artist = (item.track.artist || '').toLowerCase().trim();
            const isDup = selectedTracks.some(t => isDuplicateTrack(t, item.track));
            if (isDup) return false;
            
            const consecutive = getConsecutiveArtistCount(artist, selectedTracks, playerStore.queue);
            const totalInWindow = getRecentArtistCount(artist, selectedTracks, playerStore.queue, 5);
            
            return consecutive < 2 && totalInWindow < 3;
          });
        }

        if (indexToPick === -1) {
          // Relax to consecutive < 3, total in window < 4
          indexToPick = sortedPool.findIndex(item => {
            const artist = (item.track.artist || '').toLowerCase().trim();
            const isDup = selectedTracks.some(t => isDuplicateTrack(t, item.track));
            if (isDup) return false;
            
            const consecutive = getConsecutiveArtistCount(artist, selectedTracks, playerStore.queue);
            const totalInWindow = getRecentArtistCount(artist, selectedTracks, playerStore.queue, 5);
            
            return consecutive < 3 && totalInWindow < 4;
          });
        }

        if (indexToPick === -1) {
          // Fallback: just not duplicate, but still avoid consecutive >= 3 if possible
          indexToPick = sortedPool.findIndex(item => {
            const artist = (item.track.artist || '').toLowerCase().trim();
            const isDup = selectedTracks.some(t => isDuplicateTrack(t, item.track));
            if (isDup) return false;
            
            const consecutive = getConsecutiveArtistCount(artist, selectedTracks, playerStore.queue);
            return consecutive < 3;
          });
        }

        if (indexToPick === -1) {
          // Absolute fallback: just not duplicate
          indexToPick = sortedPool.findIndex(item => !selectedTracks.some(t => isDuplicateTrack(t, item.track)));
        }

        if (indexToPick === -1) {
          indexToPick = 0;
        }

        if (sortedPool[indexToPick]) {
          const picked = sortedPool.splice(indexToPick, 1)[0].track;
          selectedTracks.push(picked);
        } else {
          break;
        }
      }

      if (selectedTracks.length > 0) {
        console.log('[SmartQueueService] Appending auto-queue:', selectedTracks.map(t => `${t.artist} - ${t.title}`));
        usePlayerStore.setState({ queue: [...playerStore.queue, ...selectedTracks] });
      }
    } catch (e) {
      console.error('[SmartQueueService] Auto queue generation failed:', e);
    }
  }
};
