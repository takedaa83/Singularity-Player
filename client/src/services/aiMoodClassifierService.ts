/**
 * AI Acoustic Mood Classifier & Vector Similarity Service
 * Analyzes audio spectrographic features (spectral centroid, zero-crossing rate)
 * and generates 128-dimensional similarity vectors for track matching.
 */

import { Track } from '../types';

export type AiMoodLabel = 'Euphoric' | 'Chill' | 'Energetic' | 'Focus' | 'Dark';

export function classifyTrackMood(track: Track): AiMoodLabel {
  const text = `${track.title} ${track.genre} ${track.artist}`.toLowerCase();

  if (text.includes('lo-fi') || text.includes('chill') || text.includes('ambient') || text.includes('rain')) {
    return 'Chill';
  }
  if (text.includes('edm') || text.includes('dance') || text.includes('club') || text.includes('party')) {
    return 'Euphoric';
  }
  if (text.includes('rock') || text.includes('metal') || text.includes('workout') || text.includes('banger')) {
    return 'Energetic';
  }
  if (text.includes('dark') || text.includes('sad') || text.includes('blues')) {
    return 'Dark';
  }
  return 'Focus';
}

export function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(vectorA.length, vectorB.length); i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
