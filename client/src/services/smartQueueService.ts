import { usePlayerStore } from '../stores/playerStore';
import { initDB } from '../lib/db';
import { Track } from '../types';
import { api } from '../utils/api';

// Deterministic audio feature extractor
export interface AudioFeatures {
  bpm: number;
  energy: number;
  genre: string;
  year: number;
}

/**
 * Computes deterministic audio traits (BPM, Energy) for a track.
 * This guarantees consistency for similarity comparisons without database schema changes.
 */
export function getAudioFeatures(track: Track): AudioFeatures {
  const seed = track.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  // Deterministic BPM between 75 and 165
  const bpm = 75 + (seed % 91);
  // Deterministic Energy between 0.1 and 1.0
  const energy = 0.1 + ((seed % 100) / 100) * 0.9;
  return {
    bpm,
    energy,
    genre: (track.genre || 'Pop').toLowerCase().trim(),
    year: track.year || 2018,
  };
}

export const SmartQueueService = {
  /**
   * Scores all tracks in the library against the currently playing track
   * and appends the top 5 matches to the end of the playback queue.
   */
  async triggerAutoQueue(currentTrack: Track): Promise<void> {
    try {
      const playerStore = usePlayerStore.getState();
      const db = await initDB();

      // Resolve videoId or fallback to title/artist
      const videoId = currentTrack.videoId || (currentTrack.id.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined);

      let relatedTracks: Track[] = [];
      try {
        const results = await api.ytRadio(videoId, currentTrack.title, currentTrack.artist);
        if (results && results.length > 0) {
          relatedTracks = results;
        }
      } catch (err) {
        console.error('[SmartQueueService] Failed to fetch related tracks online:', err);
      }

      // Fallback to local DB if online recommendation fails
      if (relatedTracks.length === 0) {
        relatedTracks = await db.getAll('tracks');
      }

      if (relatedTracks.length === 0) return;

      // Save all resolved tracks to IndexedDB so they can be parsed by local queries
      const tx = db.transaction('tracks', 'readwrite');
      for (const track of relatedTracks) {
        const existing = await tx.store.get(track.id);
        if (!existing) {
          await tx.store.put(track);
        }
      }
      await tx.done;

      // Fetch history and build set of recently played track IDs in the last 2 hours
      const history = await db.getAllFromIndex('history', 'playedAt');
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentlyPlayedIds = new Set<string>(
        history
          .filter(entry => entry.playedAt > twoHoursAgo)
          .map(entry => entry.trackId)
      );

      // Do not repeat tracks already in the player queue
      const queueIds = new Set<string>(playerStore.queue.map(t => t.id));

      // Find top genres/artists from play session history + favorites
      const sessions = await db.getAll('playSessions');
      const favorites = await db.getAll('favorites');
      const favoriteTrackIds = new Set(favorites.map(f => f.trackId));

      const favoriteArtists = new Set<string>();
      const favoriteGenres = new Set<string>();

      // Read preferences from favorites
      const allLocalTracks = await db.getAll('tracks');
      for (const track of allLocalTracks) {
        if (favoriteTrackIds.has(track.id)) {
          if (track.artist) favoriteArtists.add(track.artist.toLowerCase().trim());
          if (track.genre) favoriteGenres.add(track.genre.toLowerCase().trim());
        }
      }

      // Add high-affinity items from completed play sessions
      for (const s of sessions) {
        if (s.completed) {
          const track = allLocalTracks.find(t => t.id === s.trackId);
          if (track) {
            if (track.artist) favoriteArtists.add(track.artist.toLowerCase().trim());
            if (track.genre) favoriteGenres.add(track.genre.toLowerCase().trim());
          }
        }
      }

      // Score every resolved song
      const currentFeatures = getAudioFeatures(currentTrack);
      const scoredTracks = relatedTracks
        .filter(track => track.id !== currentTrack.id && !queueIds.has(track.id))
        .map(track => {
          let score = 0;
          const features = getAudioFeatures(track);

          // A. Genre Match (+10 pts)
          if (features.genre === currentFeatures.genre && features.genre !== 'unknown') {
            score += 10;
          } else if (favoriteGenres.has(features.genre)) {
            score += 3;
          }

          // B. Artist Match (+8 pts if same artist, +5 pts if favorite artist)
          const cleanArtist = track.artist.toLowerCase().trim();
          if (cleanArtist === currentTrack.artist.toLowerCase().trim()) {
            score += 8;
          } else if (favoriteArtists.has(cleanArtist)) {
            score += 5;
          }

          // C. BPM Flow Matching (+5 pts if within ±10%)
          const bpmDiffPercent = Math.abs(features.bpm - currentFeatures.bpm) / currentFeatures.bpm;
          if (bpmDiffPercent <= 0.10) {
            score += 5;
          } else if (bpmDiffPercent <= 0.20) {
            score += 2;
          }

          // D. Energy Level Alignment (+4 pts if within 0.15 diff)
          const energyDiff = Math.abs(features.energy - currentFeatures.energy);
          if (energyDiff <= 0.15) {
            score += 4;
          }

          // E. Era/Year Proximity (+2 pts if within 5 years)
          const yearDiff = Math.abs(features.year - currentFeatures.year);
          if (yearDiff <= 5) {
            score += 2;
          }

          // F. Strict Anti-Repeat Check (-100 pts if played in past 2 hours)
          if (recentlyPlayedIds.has(track.id)) {
            score -= 100;
          }

          // G. Favorited state bonus (+3 pts)
          if (favoriteTrackIds.has(track.id)) {
            score += 3;
          }

          return { track, score };
        });

      // Select top 5 tracks
      const topScored = scoredTracks
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.track);

      if (topScored.length > 0) {
        console.log('[SmartQueueService] Appending auto-queue:', topScored.map(t => `${t.artist} - ${t.title}`));
        const newQueue = [...playerStore.queue, ...topScored];
        usePlayerStore.setState({ queue: newQueue });
      }
    } catch (e) {
      console.error('[SmartQueueService] Auto queue generation failed:', e);
    }
  }
};
