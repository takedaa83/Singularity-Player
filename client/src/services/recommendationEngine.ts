import { initDB } from '../lib/db';
import { Track, Playlist, HistoryEntry, PlaySession, RecommendationSection } from '../types';

export const recommendationEngine = {
  /**
   * Generates all recommendation sections for the user.
   */
  generateRecommendations: async (): Promise<RecommendationSection[]> => {
    try {
      const db = await initDB();
      const tracks = await db.getAll('tracks');
      const favorites = await db.getAll('favorites');
      const history = await db.getAllFromIndex('history', 'playedAt');
      const sessions = await db.getAll('playSessions');

      const favoriteIds = new Set(favorites.map((f) => f.trackId));
      const historyTrackIds = history.map((h) => h.trackId);

      if (tracks.length === 0) {
        return [];
      }

      // Calculate user profiles (genre affinity and artist affinity)
      const { genreAffinity, artistAffinity } = calculateAffinity(tracks, favoriteIds, sessions);

      const sections: RecommendationSection[] = [];

      // 1. Continue Listening (tracks played partially: duration > 10s and < 85%)
      const continueTracks = getContinueListening(tracks, sessions, historyTrackIds);
      if (continueTracks.length > 0) {
        sections.push({
          id: 'continue-listening',
          title: 'Continue Listening',
          subtitle: 'Pick up where you left off',
          tracks: continueTracks.slice(0, 6),
          type: 'continue',
        });
      }

      // 2. Because You Listened (based on the last played track)
      const lastTrackId = historyTrackIds[historyTrackIds.length - 1];
      const lastTrack = tracks.find((t) => t.id === lastTrackId);
      if (lastTrack) {
        const becauseTracks = getSimilarTracks(tracks, lastTrack, favoriteIds)
          .filter((t) => t.id !== lastTrackId)
          .slice(0, 6);

        if (becauseTracks.length > 0) {
          sections.push({
            id: 'because-you-listened',
            title: `Because you listened to ${lastTrack.title}`,
            subtitle: `Similar to ${lastTrack.artist}`,
            tracks: becauseTracks,
            type: 'because',
            sourceTrack: lastTrack,
          });
        }
      }

      // 3. Recommended For You (Composite Scored)
      const recommendedTracks = scoreAndRankTracks(tracks, favoriteIds, sessions, genreAffinity, artistAffinity)
        // Filter out very recently played (last 3 tracks)
        .filter((t) => !historyTrackIds.slice(-3).includes(t.id))
        .slice(0, 8);

      sections.push({
        id: 'recommended-for-you',
        title: 'Recommended for You',
        subtitle: 'Personalized mix based on your taste',
        tracks: recommendedTracks,
        type: 'recommended',
      });

      // 4. Hidden Gems (Low play count but high affinity/favorites)
      const hiddenGems = getHiddenGems(tracks, sessions, genreAffinity, artistAffinity, favoriteIds).slice(0, 6);
      if (hiddenGems.length > 0) {
        sections.push({
          id: 'hidden-gems',
          title: 'Hidden Gems',
          subtitle: 'Tracks you might have missed in your library',
          tracks: hiddenGems,
          type: 'hidden_gems',
        });
      }

      // 5. Genre explorer or Mood mixes based on top genre
      const topGenre = Object.keys(genreAffinity).sort((a, b) => genreAffinity[b] - genreAffinity[a])[0];
      if (topGenre) {
        const genreTracks = tracks
          .filter((t) => t.genre?.toLowerCase() === topGenre.toLowerCase())
          .sort(() => 0.5 - Math.random())
          .slice(0, 6);

        if (genreTracks.length > 0) {
          sections.push({
            id: `genre-${topGenre.toLowerCase()}`,
            title: `Best of ${topGenre}`,
            subtitle: `Handpicked tracks from your favorite genre`,
            tracks: genreTracks,
            type: 'mood',
          });
        }
      }

      return sections;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  },
};

/**
 * Calculates user affinity maps for genres and artists.
 */
function calculateAffinity(
  tracks: Track[],
  favoriteIds: Set<string>,
  sessions: PlaySession[]
): { genreAffinity: Record<string, number>; artistAffinity: Record<string, number> } {
  const genreAffinity: Record<string, number> = {};
  const artistAffinity: Record<string, number> = {};

  // Initialize with library tracks
  for (const track of tracks) {
    const isFav = favoriteIds.has(track.id);
    const weight = isFav ? 3 : 1;

    if (track.genre) {
      genreAffinity[track.genre] = (genreAffinity[track.genre] || 0) + weight;
    }
    if (track.artist) {
      artistAffinity[track.artist] = (artistAffinity[track.artist] || 0) + weight;
    }
  }

  // Factor in actual play session counts
  for (const session of sessions) {
    const track = tracks.find((t) => t.id === session.trackId);
    if (!track) continue;

    const sessionWeight = session.completed ? 2 : session.skipped ? -1 : 0.5;

    if (track.genre) {
      genreAffinity[track.genre] = Math.max(0, (genreAffinity[track.genre] || 0) + sessionWeight);
    }
    if (track.artist) {
      artistAffinity[track.artist] = Math.max(0, (artistAffinity[track.artist] || 0) + sessionWeight);
    }
  }

  return { genreAffinity, artistAffinity };
}

/**
 * Finds tracks the user started but didn't finish.
 */
function getContinueListening(tracks: Track[], sessions: PlaySession[], historyTrackIds: string[]): Track[] {
  // Find tracks where last session was not completed but duration was > 10s
  const partiallyPlayed = new Set<string>();
  
  // Group sessions by track, get the most recent session
  const trackLastSession: Record<string, PlaySession> = {};
  for (const s of sessions) {
    if (!trackLastSession[s.trackId] || s.startTime > trackLastSession[s.trackId].startTime) {
      trackLastSession[s.trackId] = s;
    }
  }

  for (const [trackId, session] of Object.entries(trackLastSession)) {
    if (!session.completed && !session.skipped && session.duration > 10) {
      partiallyPlayed.add(trackId);
    }
  }

  return tracks.filter((t) => partiallyPlayed.has(t.id));
}

/**
 * Finds tracks similar to a given track based on genre and artist.
 */
function getSimilarTracks(tracks: Track[], source: Track, favoriteIds: Set<string>): Track[] {
  return tracks
    .map((t) => {
      let similarity = 0;
      if (t.id === source.id) return { track: t, score: -1 };

      if (t.genre && source.genre && t.genre.toLowerCase() === source.genre.toLowerCase()) {
        similarity += 5;
      }
      if (t.artist && source.artist && t.artist.toLowerCase() === source.artist.toLowerCase()) {
        similarity += 8;
      }
      if (t.album && source.album && t.album.toLowerCase() === source.album.toLowerCase()) {
        similarity += 3;
      }
      if (favoriteIds.has(t.id)) {
        similarity += 1;
      }

      return { track: t, score: similarity };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

/**
 * Scores and ranks tracks based on affinity metrics, plays, skips, and favorites.
 */
function scoreAndRankTracks(
  tracks: Track[],
  favoriteIds: Set<Set<string> | string>,
  sessions: PlaySession[],
  genreAffinity: Record<string, number>,
  artistAffinity: Record<string, number>
): Track[] {
  const playCounts: Record<string, number> = {};
  const skipCounts: Record<string, number> = {};

  for (const s of sessions) {
    if (s.completed) {
      playCounts[s.trackId] = (playCounts[s.trackId] || 0) + 1;
    }
    if (s.skipped) {
      skipCounts[s.trackId] = (skipCounts[s.trackId] || 0) + 1;
    }
  }

  const favSet = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds);

  return tracks
    .map((t) => {
      let score = 50; // Base score

      // Genre affinity contribution
      if (t.genre && genreAffinity[t.genre]) {
        score += genreAffinity[t.genre] * 2;
      }

      // Artist affinity contribution
      if (t.artist && artistAffinity[t.artist]) {
        score += artistAffinity[t.artist] * 3;
      }

      // Play history signals
      const plays = playCounts[t.id] || 0;
      const skips = skipCounts[t.id] || 0;

      score += plays * 5;
      score -= skips * 8;

      // Favorite status
      if (favSet.has(t.id)) {
        score += 25;
      }

      // Random perturbation for discovery variety (up to 10 points)
      score += Math.random() * 10;

      return { track: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

/**
 * Gets tracks with high affinities but low plays.
 */
function getHiddenGems(
  tracks: Track[],
  sessions: PlaySession[],
  genreAffinity: Record<string, number>,
  artistAffinity: Record<string, number>,
  favoriteIds: Set<string>
): Track[] {
  const playCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.completed) {
      playCounts[s.trackId] = (playCounts[s.trackId] || 0) + 1;
    }
  }

  return tracks
    .map((t) => {
      const plays = playCounts[t.id] || 0;
      if (plays > 2) return { track: t, score: -1 }; // Too popular

      let score = 0;
      if (t.genre && genreAffinity[t.genre]) {
        score += genreAffinity[t.genre] * 1.5;
      }
      if (t.artist && artistAffinity[t.artist]) {
        score += artistAffinity[t.artist] * 2;
      }
      if (favoriteIds.has(t.id)) {
        score += 10;
      }

      return { track: t, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}
