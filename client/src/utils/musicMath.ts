import { Track } from '../types';
import { cleanString } from './trackUtils';

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

export function hasRealAudioFeatures(track: Track): boolean {
  return (
    (track.bpm !== undefined && track.bpm !== null && track.bpm > 0) ||
    (track.audioFeatures !== undefined && track.audioFeatures !== null)
  );
}

export function fnv1a(str: string): number {
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

export function getFeatureVector(f: AudioFeatures): number[] {
  return [
    f.energy * 1.5,
    f.valence * 1.5,
    f.danceability * 1.0,
    f.acousticness * 0.8,
    f.instrumentalness * 0.8,
  ];
}
