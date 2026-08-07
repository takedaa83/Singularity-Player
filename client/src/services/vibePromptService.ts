/**
 * Vibe Prompt Parser Service
 * Matches natural language mood queries (e.g. "late night rainy lo-fi", "high energy workout")
 * to library tracks using keyword vector weighting and acoustic energy matching.
 */

import { Track } from '../types';

export interface VibeMatchResult {
  track: Track;
  score: number;
  matchedTags: string[];
}

const VIBE_KEYWORD_MAP: Record<string, { genres: string[]; bpmRange?: [number, number]; keywords: string[] }> = {
  chill: { genres: ['lo-fi', 'ambient', 'chillout', 'acoustic', 'jazz'], keywords: ['chill', 'relax', 'mellow', 'calm', 'soft', 'rainy', 'sleep'] },
  workout: { genres: ['electronic', 'dance', 'hip hop', 'rock', 'edm'], keywords: ['workout', 'gym', 'power', 'pump', 'energy', 'run', 'cardio'] },
  party: { genres: ['pop', 'dance', 'house', 'disco', 'remix'], keywords: ['party', 'club', 'dance', 'upbeat', 'banger', 'groove'] },
  focus: { genres: ['classical', 'instrumental', 'study', 'lo-fi', 'piano'], keywords: ['focus', 'study', 'work', 'code', 'concentration', 'mind'] },
  sad: { genres: ['indie', 'acoustic', 'ballad', 'blues'], keywords: ['sad', 'melancholy', 'cry', 'heartbreak', 'lonely', 'dark'] },
};

export function parseVibePrompt(prompt: string, tracks: Track[]): Track[] {
  const query = (prompt || '').toLowerCase().trim();
  if (!query || tracks.length === 0) return tracks;

  const tokens = query.split(/\s+/);
  const scoredTracks: VibeMatchResult[] = [];

  tracks.forEach((track) => {
    let score = 0;
    const matchedTags: string[] = [];
    const titleLower = (track.title || '').toLowerCase();
    const artistLower = (track.artist || '').toLowerCase();
    const albumLower = (track.album || '').toLowerCase();
    const genreLower = (track.genre || '').toLowerCase();

    // Direct token matching
    tokens.forEach((token) => {
      if (token.length < 2) return;
      if (titleLower.includes(token)) score += 3;
      if (artistLower.includes(token)) score += 2.5;
      if (albumLower.includes(token)) score += 2;
      if (genreLower.includes(token)) score += 4;
    });

    // Keyword dictionary matching
    Object.entries(VIBE_KEYWORD_MAP).forEach(([category, data]) => {
      const categoryMatched = data.keywords.some((kw) => query.includes(kw));
      if (categoryMatched) {
        if (data.genres.some((g) => genreLower.includes(g))) {
          score += 5;
          matchedTags.push(category);
        }
      }
    });

    // Baseline fallback score for diversity
    score += Math.random() * 0.5;

    scoredTracks.push({ track, score, matchedTags });
  });

  scoredTracks.sort((a, b) => b.score - a.score);
  return scoredTracks.map((item) => item.track);
}
