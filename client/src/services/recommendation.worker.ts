import { Track, PlaySession, HistoryEntry, RecommendationSection } from '../types';
import { getAudioFeatures, cosineSimilarity } from './smartQueueService';

// --- HELPERS & DIVERSITY ---

function getFeatureVector(t: Track): number[] {
  const f = getAudioFeatures(t) || { energy: 0.5, valence: 0.5, danceability: 0.5, acousticness: 0.5, instrumentalness: 0.5 };
  return [
    f.energy ?? 0.5,
    f.valence ?? 0.5,
    f.danceability ?? 0.5,
    f.acousticness ?? 0.5,
    f.instrumentalness ?? 0.5
  ];
}

function enforceDiversity(tracks: Track[], maxPerArtist = 2): Track[] {
  const artistCounts = new Map<string, number>();
  const result: Track[] = [];
  for (const track of tracks) {
    const artist = (track.artist || '').toLowerCase().trim();
    const count = artistCounts.get(artist) || 0;
    if (count < maxPerArtist) {
      result.push(track);
      artistCounts.set(artist, count + 1);
    }
  }
  return result;
}

// --- CORE MATHEMATICS ---

function calculateAffinity(
  tracks: Track[],
  favoriteIds: Set<string>,
  sessions: PlaySession[],
  trackMap: Map<string, Track>
): { genreAffinity: Record<string, number>; artistAffinity: Record<string, number> } {
  const genreAffinity: Record<string, number> = {};
  const artistAffinity: Record<string, number> = {};

  // 1. Initialize with library tracks
  for (const track of tracks) {
    const isFav = favoriteIds.has(track.id);
    const weight = isFav ? 3.0 : 1.0;

    if (track.genre) {
      const g = track.genre.toLowerCase().trim();
      if (g && g !== 'unknown') {
        genreAffinity[g] = (genreAffinity[g] || 0) + weight;
      }
    }
    if (track.artist) {
      const a = track.artist.toLowerCase().trim();
      if (a && a !== 'unknown') {
        artistAffinity[a] = (artistAffinity[a] || 0) + weight;
      }
    }
  }

  // 2. Factor in recent play sessions with exponential recency decay (30-day decay)
  const now = Date.now();
  for (const session of sessions) {
    const track = trackMap.get(session.trackId);
    if (!track) continue;

    // Time decay calculation
    const days = (now - session.startTime) / (1000 * 60 * 60 * 24);
    const recencyDecay = Math.exp(-Math.max(0, days) / 30);

    const baseWeight = session.completed ? 2.0 : session.skipped ? -1.0 : 0.5;
    const sessionWeight = baseWeight * recencyDecay;

    if (track.genre) {
      const g = track.genre.toLowerCase().trim();
      if (g && g !== 'unknown') {
        genreAffinity[g] = Math.max(0, (genreAffinity[g] || 0) + sessionWeight);
      }
    }
    if (track.artist) {
      const a = track.artist.toLowerCase().trim();
      if (a && a !== 'unknown') {
        artistAffinity[a] = Math.max(0, (artistAffinity[a] || 0) + sessionWeight);
      }
    }
  }

  return { genreAffinity, artistAffinity };
}

function getContinueListening(
  sessions: PlaySession[],
  historyTrackIds: string[],
  trackMap: Map<string, Track>
): Track[] {
  const partiallyPlayed = new Set<string>();
  const trackLastSession: Record<string, PlaySession> = {};

  for (const s of sessions) {
    if (!trackLastSession[s.trackId] || s.startTime > trackLastSession[s.trackId].startTime) {
      trackLastSession[s.trackId] = s;
    }
  }

  for (const [trackId, session] of Object.entries(trackLastSession)) {
    const track = trackMap.get(trackId);
    if (track) {
      const progress = session.duration / (track.duration || 1);
      // Play duration > 60s or progress > 15% means they listened enough to want to resume, but didn't finish or skip
      if (!session.completed && !session.skipped && (session.duration > 60 || progress > 0.15)) {
        partiallyPlayed.add(trackId);
      }
    }
  }

  // Preserve history order for continuing playback
  const result: Track[] = [];
  const added = new Set<string>();
  for (const id of historyTrackIds) {
    if (partiallyPlayed.has(id) && !added.has(id)) {
      const t = trackMap.get(id);
      if (t) {
        result.push(t);
        added.add(id);
      }
    }
  }

  return result;
}

function getSimilarTracks(
  tracks: Track[],
  source: Track,
  favoriteIds: Set<string>
): Track[] {
  const sourceFeatures = getAudioFeatures(source);
  const srcVec = sourceFeatures ? [sourceFeatures.energy, sourceFeatures.valence, sourceFeatures.danceability, sourceFeatures.acousticness, sourceFeatures.instrumentalness] : null;

  return tracks
    .map((t) => {
      if (t.id === source.id) return { track: t, score: -1 };

      let similarity = 0;
      const tGenre = (t.genre || '').toLowerCase().trim();
      const srcGenre = (source.genre || '').toLowerCase().trim();
      const tArtist = (t.artist || '').toLowerCase().trim();
      const srcArtist = (source.artist || '').toLowerCase().trim();

      // Audio feature similarity (cosine similarity)
      if (srcVec) {
        const tFeatures = getAudioFeatures(t);
        if (tFeatures) {
          const tVec = [tFeatures.energy, tFeatures.valence, tFeatures.danceability, tFeatures.acousticness, tFeatures.instrumentalness];
          const cosSim = cosineSimilarity(srcVec, tVec);
          similarity += cosSim * 12.0; // 0 to 12 points
        }
      }

      // Metadata alignment
      if (tGenre && srcGenre && tGenre === srcGenre) {
        similarity += 4.0;
      }
      if (tArtist && srcArtist && tArtist === srcArtist) {
        similarity += 6.0;
      }
      if (t.album && source.album && t.album.toLowerCase().trim() === source.album.toLowerCase().trim()) {
        similarity += 2.0;
      }
      if (favoriteIds.has(t.id)) {
        similarity += 1.0;
      }

      return { track: t, score: similarity };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

function scoreAndRankTracks(
  tracks: Track[],
  favoriteIds: Set<string>,
  sessions: PlaySession[],
  genreAffinity: Record<string, number>,
  artistAffinity: Record<string, number>
): Track[] {
  const playCounts: Record<string, number> = {};
  const skipCounts: Record<string, number> = {};

  for (const s of sessions) {
    if (s.completed) playCounts[s.trackId] = (playCounts[s.trackId] || 0) + 1;
    if (s.skipped) skipCounts[s.trackId] = (skipCounts[s.trackId] || 0) + 1;
  }

  return tracks
    .map((t) => {
      let score = 50.0; // Base score

      const genre = (t.genre || '').toLowerCase().trim();
      const artist = (t.artist || '').toLowerCase().trim();

      if (genre && genreAffinity[genre]) {
        score += genreAffinity[genre] * 2.0;
      }
      if (artist && artistAffinity[artist]) {
        score += artistAffinity[artist] * 3.0;
      }

      const plays = playCounts[t.id] || 0;
      const skips = skipCounts[t.id] || 0;

      score += plays * 4.0;
      score -= skips * 6.0;

      // Small randomized factor to keep recommendations fresh without overriding score (max 0.5 points)
      score += Math.random() * 0.5;

      return { track: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

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
      if (plays > 2) return { track: t, score: -1 }; // Skip highly-played tracks

      let score = 0.0;
      const genre = (t.genre || '').toLowerCase().trim();
      const artist = (t.artist || '').toLowerCase().trim();

      if (genre && genreAffinity[genre]) score += genreAffinity[genre] * 1.5;
      if (artist && artistAffinity[artist]) score += artistAffinity[artist] * 2.0;
      if (favoriteIds.has(t.id)) score += 8.0;

      return { track: t, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

// --- WORKER HANDLER ---

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'calculate') {
    try {
      const { tracks, favorites, history, sessions } = payload as {
        tracks: Track[];
        favorites: string[];
        history: HistoryEntry[];
        sessions: PlaySession[];
      };

      const favoriteIds = new Set<string>(favorites);
      const historyTrackIds = history.map((h) => h.trackId);
      const trackMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));

      if (tracks.length === 0) {
        self.postMessage({ type: 'success', payload: { sections: [], smartRecs: [] } });
        return;
      }

      // 1. Calculate taste affinities
      const { genreAffinity, artistAffinity } = calculateAffinity(tracks, favoriteIds, sessions, trackMap);

      // 2. Generate Sections
      const sections: RecommendationSection[] = [];

      // Section A: Continue Listening
      const continueTracks = getContinueListening(sessions, historyTrackIds, trackMap);
      if (continueTracks.length > 0) {
        sections.push({
          id: 'continue-listening',
          title: 'Continue Listening',
          subtitle: 'Pick up where you left off',
          tracks: continueTracks.slice(0, 6),
          type: 'continue',
        });
      }

      // Section B: Because You Listened
      const lastTrackId = historyTrackIds[0]; // history is sorted desc
      const lastTrack = lastTrackId ? trackMap.get(lastTrackId) : null;
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

      // Section C: Recommended For You (Filtered out favorites, diversity-controlled)
      const rankedAll = scoreAndRankTracks(tracks, favoriteIds, sessions, genreAffinity, artistAffinity);
      const recommendedTracks = enforceDiversity(
        rankedAll.filter((t) => !favoriteIds.has(t.id) && !historyTrackIds.slice(0, 3).includes(t.id)),
        2
      ).slice(0, 8);

      sections.push({
        id: 'recommended-for-you',
        title: 'Recommended for You',
        subtitle: 'Personalized mix based on your taste',
        tracks: recommendedTracks,
        type: 'recommended',
      });

      // Section D: Hidden Gems (Low play count, high affinity)
      const hiddenGems = getHiddenGems(tracks, sessions, genreAffinity, artistAffinity, favoriteIds)
        .filter((t) => !favoriteIds.has(t.id))
        .slice(0, 6);
      if (hiddenGems.length > 0) {
        sections.push({
          id: 'hidden-gems',
          title: 'Hidden Gems',
          subtitle: 'Tracks you might have missed in your library',
          tracks: hiddenGems,
          type: 'hidden_gems',
        });
      }

      // Section E: Genre Explorer (Top affinity genre)
      const topGenre = Object.keys(genreAffinity).sort((a, b) => genreAffinity[b] - genreAffinity[a])[0];
      if (topGenre) {
        const genreTracks = scoreAndRankTracks(tracks, favoriteIds, sessions, genreAffinity, artistAffinity)
          .filter((t) => t.genre?.toLowerCase().trim() === topGenre.toLowerCase().trim() && !favoriteIds.has(t.id))
          .slice(0, 6);

        if (genreTracks.length > 0) {
          sections.push({
            id: `genre-${topGenre.toLowerCase().replace(/\s+/g, '-')}`,
            title: `Best of ${topGenre.charAt(0).toUpperCase() + topGenre.slice(1)}`,
            subtitle: `Handpicked tracks from your favorite genre`,
            tracks: genreTracks,
            type: 'mood',
          });
        }
      }

      // 3. Generate Smart Recommendations (Discover Weekly style)
      // taste vector calculations
      const favTracks = tracks.filter((t) => favoriteIds.has(t.id));
      const recentTracks = historyTrackIds.slice(0, 10).map((id) => trackMap.get(id)).filter((t): t is Track => !!t);

      const vectorsToAverage: number[][] = [];
      for (const t of favTracks) vectorsToAverage.push(getFeatureVector(t));
      for (const t of recentTracks) vectorsToAverage.push(getFeatureVector(t));

      let tasteVector = [0.5, 0.5, 0.5, 0.5, 0.5];
      if (vectorsToAverage.length > 0) {
        const sum = vectorsToAverage[0].map((_, i) => vectorsToAverage.reduce((acc, v) => acc + v[i], 0));
        tasteVector = sum.map((s) => s / vectorsToAverage.length);
      }

      const favoriteArtists = new Set<string>();
      const favoriteGenres = new Set<string>();
      for (const t of favTracks) {
        if (t.artist) favoriteArtists.add(t.artist.toLowerCase().trim());
        if (t.genre) favoriteGenres.add(t.genre.toLowerCase().trim());
      }
      for (const t of recentTracks) {
        if (t.artist) favoriteArtists.add(t.artist.toLowerCase().trim());
        if (t.genre) favoriteGenres.add(t.genre.toLowerCase().trim());
      }

      const playCountsSmart: Record<string, number> = {};
      const skipCountsSmart: Record<string, number> = {};
      for (const s of sessions) {
        if (s.completed) playCountsSmart[s.trackId] = (playCountsSmart[s.trackId] || 0) + 1;
        if (s.skipped) skipCountsSmart[s.trackId] = (skipCountsSmart[s.trackId] || 0) + 1;
      }

      const scoredSmart = tracks
        .filter((track) => !favoriteIds.has(track.id)) // Filter out already favorited songs
        .map((track) => {
          const vec = getFeatureVector(track);
          const sim = cosineSimilarity(tasteVector, vec);
          let score = sim * 50.0; // Base similarity 0-50

          const artist = (track.artist || '').toLowerCase().trim();
          const genre = (track.genre || '').toLowerCase().trim();

          if (artist && favoriteArtists.has(artist)) score += 15.0;
          if (genre && favoriteGenres.has(genre)) score += 10.0;

          const plays = playCountsSmart[track.id] || 0;
          const skips = skipCountsSmart[track.id] || 0;
          score += Math.min(15, plays * 3.0);
          score -= skips * 5.0;

          // Exclude very recently played tracks
          const recentIndex = historyTrackIds.slice(0, 5).indexOf(track.id);
          if (recentIndex !== -1) score -= 100.0;

          score += Math.random() * 0.5; // Small randomness

          return { track, score };
        });

      const smartRecs = enforceDiversity(
        scoredSmart.sort((a, b) => b.score - a.score).map((item) => item.track),
        2
      ).slice(0, 15);

      self.postMessage({
        type: 'success',
        payload: { sections, smartRecs },
      });
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        payload: err?.message || 'Error processing recommendation arrays',
      });
    }
  }
};
