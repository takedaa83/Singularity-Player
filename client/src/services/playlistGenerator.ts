import { Track, Playlist } from '../types';
import { initDB } from '../lib/db';
import { getAudioFeatures, cosineSimilarity, areGenresRelated, hasRealAudioFeatures, isDuplicateTrack, isHighQualityTrack } from './smartQueueService';
import { api } from '../utils/api';

export type VibeType = 'Workout' | 'Focus' | 'Late Night' | 'Chill' | 'Party';

export interface VibeConfig {
  minEnergy: number;
  maxEnergy: number;
  minBpm: number;
  maxBpm: number;
  color: string;
  description: string;
}

export const VIBE_CONFIGS: Record<VibeType, VibeConfig> = {
  Workout: {
    minEnergy: 0.7,
    maxEnergy: 1.0,
    minBpm: 120,
    maxBpm: 180,
    color: 'linear-gradient(135deg, #f97316, #ef4444)', // Orange to Red
    description: 'High energy, fast-paced tracks to power your workout.'
  },
  Focus: {
    minEnergy: 0.1,
    maxEnergy: 0.45,
    minBpm: 70,
    maxBpm: 115,
    color: 'linear-gradient(135deg, #0d9488, #2563eb)', // Teal to Blue
    description: 'Calm, steady rhythms to keep you locked in and productive.'
  },
  'Late Night': {
    minEnergy: 0.1,
    maxEnergy: 0.5,
    minBpm: 60,
    maxBpm: 95,
    color: 'linear-gradient(135deg, #581c87, #0f172a)', // Indigo to dark slate
    description: 'Deep, atmospheric tracks for the late night hours.'
  },
  Chill: {
    minEnergy: 0.3,
    maxEnergy: 0.6,
    minBpm: 75,
    maxBpm: 110,
    color: 'linear-gradient(135deg, #10b981, #06b6d4)', // Emerald to Cyan
    description: 'Smooth and relaxed tunes to wind down and destress.'
  },
  Party: {
    minEnergy: 0.75,
    maxEnergy: 1.0,
    minBpm: 115,
    maxBpm: 160,
    color: 'linear-gradient(135deg, #ec4899, #8b5cf6)', // Pink to Purple
    description: 'Vibrant, upbeat bangers to get the energy pumping.'
  }
};

export const PlaylistGenerator = {
  /**
   * Generates a vibe-based playlist from the user's library and saves it.
   */
  async generateVibePlaylist(vibe: VibeType): Promise<Playlist | null> {
    try {
      const db = await initDB();
      const config = VIBE_CONFIGS[vibe];

      // Determine search term based on vibe
      let searchQuery = '';
      switch (vibe) {
        case 'Workout':
          searchQuery = 'Workout gym motivation hits';
          break;
        case 'Focus':
          searchQuery = 'Lofi focus study beats';
          break;
        case 'Late Night':
          searchQuery = 'Late night chill lofi jazz';
          break;
        case 'Chill':
          searchQuery = 'Chillout relaxing acoustic lounge';
          break;
        case 'Party':
          searchQuery = 'Party dance club hits';
          break;
        default:
          searchQuery = `${vibe} mix`;
      }

      // Fetch tracks online matching the vibe
      let onlineTracks: Track[] = [];
      try {
        const results = await api.search(searchQuery);
        if (results && results.length > 0) {
          onlineTracks = results;
        }
      } catch (err) {
        console.error(`Failed to fetch online tracks for vibe ${vibe}:`, err);
      }

      // Fallback to local DB if search returns nothing
      if (onlineTracks.length === 0) {
        onlineTracks = await db.getAll('tracks');
      }

      if (onlineTracks.length === 0) return null;

      // Filter tracks based on energy and BPM range
      let matchingTracks = onlineTracks.filter(track => {
        const features = getAudioFeatures(track);
        return (
          features.energy >= config.minEnergy &&
          features.energy <= config.maxEnergy &&
          features.bpm >= config.minBpm &&
          features.bpm <= config.maxBpm
        );
      });

      // If strict filter yields too few tracks, relax filter to use all results
      if (matchingTracks.length < 5) {
        matchingTracks = onlineTracks;
      }

      // Pre-check track presence in IndexedDB to avoid nested awaits inside transaction
      const existingDocs = await Promise.all(
        matchingTracks.map(track => db.get('tracks', track.id))
      );
      const existingMap = new Map<string, boolean>(
        existingDocs.filter((t): t is Track => !!t).map(t => [t.id, true])
      );

      const tx = db.transaction('tracks', 'readwrite');
      for (const track of matchingTracks) {
        if (!existingMap.has(track.id)) {
          tx.store.put(track);
        }
      }
      await tx.done;

      // Sequence tracks using a bell curve (moderate -> peak -> cool down)
      const sequencedTracks = sequenceByEnergyCurve(matchingTracks);
      const trackIds = sequencedTracks.map(t => t.id);

      const newPlaylist: Playlist = {
        id: `vibe-${vibe.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        name: `${vibe} Mix`,
        description: config.description,
        coverUrl: sequencedTracks[0]?.coverArtUrl || null,
        trackIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isSmartPlaylist: true,
        color: config.color,
        icon: 'Sparkles'
      };

      await db.put('playlists', newPlaylist);
      return newPlaylist;
    } catch (e) {
      console.error('Failed to generate vibe playlist:', e);
      return null;
    }
  },

  /**
   * Generates a playlist similar to a source track and saves it.
   */
  async generateSimilarPlaylist(sourceTrack: Track): Promise<Playlist | null> {
    try {
      const db = await initDB();

      // Resolve videoId or fallback to title/artist
      const videoId = sourceTrack.videoId || (sourceTrack.id.startsWith('yt-') ? sourceTrack.id.replace('yt-', '') : undefined);

      let relatedTracks: Track[] = [];
      try {
        const results = await api.ytRadio(videoId, sourceTrack.title, sourceTrack.artist);
        if (results && results.length > 0) {
          relatedTracks = results;
        }
      } catch (err) {
        console.error('Failed to fetch similar tracks from ytRadio api:', err);
      }

      // Fallback to local DB if online radio recommendation fails
      if (relatedTracks.length === 0) {
        const allTracks = await db.getAll('tracks');
        const sourceHasReal = hasRealAudioFeatures(sourceTrack);
        const sourceFeatures = getAudioFeatures(sourceTrack);
        const getVector = (f: any) => [
          f.energy * 1.5,
          f.valence * 1.5,
          f.danceability * 1.0,
          f.acousticness * 0.8,
          f.instrumentalness * 0.8
        ];
        const sourceVector = getVector(sourceFeatures);
        
        relatedTracks = allTracks
          .filter(track => track.id !== sourceTrack.id && !isDuplicateTrack(sourceTrack, track) && isHighQualityTrack(track))
          .map(track => {
            const candidateHasReal = hasRealAudioFeatures(track);
            let similarity = 0;
            
            if (!sourceHasReal || !candidateHasReal) {
              // Cold start fallback scoring mapped to similarity range [0.0, 1.0]
              const candGenre = (track.genre || '').toLowerCase().trim();
              const srcGenre = (sourceTrack.genre || '').toLowerCase().trim();
              if (candGenre && candGenre === srcGenre && candGenre !== 'unknown') {
                similarity += 0.40;
              } else if (areGenresRelated(candGenre, srcGenre) && candGenre !== 'unknown') {
                similarity += 0.25;
              }
              
              const candArtist = (track.artist || '').toLowerCase().trim();
              const srcArtist = (sourceTrack.artist || '').toLowerCase().trim();
              if (candArtist && candArtist === srcArtist) {
                similarity += 0.30;
              }
              
              const candAlbum = (track.album || '').toLowerCase().trim();
              const srcAlbum = (sourceTrack.album || '').toLowerCase().trim();
              if (candAlbum && candAlbum === srcAlbum && candAlbum !== 'unknown') {
                similarity += 0.15;
              }
              
              if (track.year && sourceTrack.year) {
                const yearDiff = Math.abs(track.year - sourceTrack.year);
                if (yearDiff <= 3) {
                  similarity += 0.10;
                } else if (yearDiff <= 10) {
                  similarity += 0.05;
                }
              }
            } else {
              const features = getAudioFeatures(track);
              const candidateVector = getVector(features);
              similarity = cosineSimilarity(sourceVector, candidateVector);
              
              // Add genre bonus
              if (features.genre === sourceFeatures.genre && sourceFeatures.genre !== 'unknown') {
                similarity += 0.15;
              } else if (areGenresRelated(features.genre, sourceFeatures.genre) && features.genre !== 'unknown') {
                similarity += 0.08;
              }
              // Add BPM alignment bonus
              const bpmDiff = Math.abs(features.bpm - sourceFeatures.bpm) / sourceFeatures.bpm;
              if (bpmDiff <= 0.10) {
                similarity += 0.05;
              }
            }
            return { track, similarity: Math.min(1.0, similarity) };
          })
          .filter(item => item.similarity >= 0.25)
          .sort((a, b) => b.similarity - a.similarity)
          .map(item => item.track);
      }

      // Make sure sourceTrack itself is in IndexedDB
      const existingSource = await db.get('tracks', sourceTrack.id);
      if (!existingSource) {
        await db.put('tracks', sourceTrack);
      }

      // Ensure all online tracks are written to IndexedDB
      if (relatedTracks.length > 0) {
        const existingDocs = await Promise.all(
          relatedTracks.map(track => db.get('tracks', track.id))
        );
        const existingMap = new Map<string, boolean>(
          existingDocs.filter((t): t is Track => !!t).map(t => [t.id, true])
        );

        const tx = db.transaction('tracks', 'readwrite');
        for (const track of relatedTracks) {
          if (!existingMap.has(track.id)) {
            tx.store.put(track);
          }
        }
        await tx.done;
      }

      const allPlaylistTracks = [sourceTrack, ...relatedTracks];
      const uniqueTracks: Track[] = [];
      const seenIds = new Set<string>();
      for (const track of allPlaylistTracks) {
        if (!seenIds.has(track.id)) {
          seenIds.add(track.id);
          uniqueTracks.push(track);
        }
      }

      // Sequence all similar tracks (excluding the sourceTrack itself) using a bell curve, then place the source track first
      const restTracks = uniqueTracks.filter(t => t.id !== sourceTrack.id);
      const sequencedRest = sequenceByEnergyCurve(restTracks);
      const finalTracks = [sourceTrack, ...sequencedRest];
      const trackIds = finalTracks.map(t => t.id);

      const colorGradient = `linear-gradient(135deg, #a855f7, #6366f1)`; // Purple to indigo default

      const newPlaylist: Playlist = {
        id: `similar-${sourceTrack.id}-${Date.now()}`,
        name: `${sourceTrack.title} Radio`,
        description: `Custom radio mix inspired by ${sourceTrack.title} by ${sourceTrack.artist}.`,
        coverUrl: sourceTrack.coverArtUrl,
        trackIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isSmartPlaylist: true,
        color: colorGradient,
        icon: 'Radio'
      };

      await db.put('playlists', newPlaylist);
      return newPlaylist;
    } catch (e) {
      console.error('Failed to generate similar playlist:', e);
      return null;
    }
  },

  /**
   * Generates similar tracks matching the source track (does NOT save a playlist object in the DB).
   */
  async generateSimilarTracks(sourceTrack: Track): Promise<Track[] | null> {
    try {
      const db = await initDB();

      // Resolve videoId or fallback to title/artist
      const videoId = sourceTrack.videoId || (sourceTrack.id.startsWith('yt-') ? sourceTrack.id.replace('yt-', '') : undefined);

      let relatedTracks: Track[] = [];
      try {
        const results = await api.ytRadio(videoId, sourceTrack.title, sourceTrack.artist);
        if (results && results.length > 0) {
          relatedTracks = results;
        }
      } catch (err) {
        console.error('Failed to fetch similar tracks from ytRadio api:', err);
      }

      // Fallback to local DB if online radio recommendation fails
      if (relatedTracks.length === 0) {
        const allTracks = await db.getAll('tracks');
        const sourceHasReal = hasRealAudioFeatures(sourceTrack);
        const sourceFeatures = getAudioFeatures(sourceTrack);
        const getVector = (f: any) => [
          f.energy * 1.5,
          f.valence * 1.5,
          f.danceability * 1.0,
          f.acousticness * 0.8,
          f.instrumentalness * 0.8
        ];
        const sourceVector = getVector(sourceFeatures);
        
        relatedTracks = allTracks
          .filter(track => track.id !== sourceTrack.id && !isDuplicateTrack(sourceTrack, track) && isHighQualityTrack(track))
          .map(track => {
            const candidateHasReal = hasRealAudioFeatures(track);
            let similarity = 0;
            
            if (!sourceHasReal || !candidateHasReal) {
              // Cold start fallback scoring mapped to similarity range [0.0, 1.0]
              const candGenre = (track.genre || '').toLowerCase().trim();
              const srcGenre = (sourceTrack.genre || '').toLowerCase().trim();
              if (candGenre && candGenre === srcGenre && candGenre !== 'unknown') {
                similarity += 0.40;
              } else if (areGenresRelated(candGenre, srcGenre) && candGenre !== 'unknown') {
                similarity += 0.25;
              }
              
              const candArtist = (track.artist || '').toLowerCase().trim();
              const srcArtist = (sourceTrack.artist || '').toLowerCase().trim();
              if (candArtist && candArtist === srcArtist) {
                similarity += 0.30;
              }
              
              const candAlbum = (track.album || '').toLowerCase().trim();
              const srcAlbum = (sourceTrack.album || '').toLowerCase().trim();
              if (candAlbum && candAlbum === srcAlbum && candAlbum !== 'unknown') {
                similarity += 0.15;
              }
              
              if (track.year && sourceTrack.year) {
                const yearDiff = Math.abs(track.year - sourceTrack.year);
                if (yearDiff <= 3) {
                  similarity += 0.10;
                } else if (yearDiff <= 10) {
                  similarity += 0.05;
                }
              }
            } else {
              const features = getAudioFeatures(track);
              const candidateVector = getVector(features);
              similarity = cosineSimilarity(sourceVector, candidateVector);
              
              // Add genre bonus
              if (features.genre === sourceFeatures.genre && sourceFeatures.genre !== 'unknown') {
                similarity += 0.15;
              } else if (areGenresRelated(features.genre, sourceFeatures.genre) && features.genre !== 'unknown') {
                similarity += 0.08;
              }
              // Add BPM alignment bonus
              const bpmDiff = Math.abs(features.bpm - sourceFeatures.bpm) / sourceFeatures.bpm;
              if (bpmDiff <= 0.10) {
                similarity += 0.05;
              }
            }
            return { track, similarity: Math.min(1.0, similarity) };
          })
          .filter(item => item.similarity >= 0.25)
          .sort((a, b) => b.similarity - a.similarity)
          .map(item => item.track);
      }

      // Make sure sourceTrack itself is in IndexedDB
      const existingSource = await db.get('tracks', sourceTrack.id);
      if (!existingSource) {
        await db.put('tracks', sourceTrack);
      }

      // Ensure all online tracks are written to IndexedDB
      if (relatedTracks.length > 0) {
        const existingDocs = await Promise.all(
          relatedTracks.map(track => db.get('tracks', track.id))
        );
        const existingMap = new Map<string, boolean>(
          existingDocs.filter((t): t is Track => !!t).map(t => [t.id, true])
        );

        const tx = db.transaction('tracks', 'readwrite');
        for (const track of relatedTracks) {
          if (!existingMap.has(track.id)) {
            tx.store.put(track);
          }
        }
        await tx.done;
      }

      const allPlaylistTracks = [sourceTrack, ...relatedTracks];
      const uniqueTracks: Track[] = [];
      const seenIds = new Set<string>();
      for (const track of allPlaylistTracks) {
        if (!seenIds.has(track.id)) {
          seenIds.add(track.id);
          uniqueTracks.push(track);
        }
      }

      // Sequence all similar tracks (excluding the sourceTrack itself) using a bell curve, then place the source track first
      const restTracks = uniqueTracks.filter(t => t.id !== sourceTrack.id);
      const sequencedRest = sequenceByEnergyCurve(restTracks);
      return [sourceTrack, ...sequencedRest];
    } catch (e) {
      console.error('Failed to generate similar tracks:', e);
      return null;
    }
  }
};

/**
 * Sequences tracks by energy in a bell curve: starts moderate, ramps up to peak, ramps down.
 */
function sequenceByEnergyCurve(tracks: Track[]): Track[] {
  // Sort tracks by energy ascending
  const sorted = [...tracks].sort((a, b) => getAudioFeatures(a).energy - getAudioFeatures(b).energy);
  
  const rampUp: Track[] = [];
  const rampDown: Track[] = [];
  
  sorted.forEach((track, index) => {
    if (index % 2 === 0) {
      rampUp.push(track);
    } else {
      rampDown.unshift(track); // Insert at the beginning to reverse order for ramping down
    }
  });
  
  return [...rampUp, ...rampDown];
}
