/**
 * Metadata Fixer Service
 * Cleans dirty track titles (stripping "[Official Video]", "(HD 1080p)")
 * and queries iTunes Search API for 4K album artwork and exact genre tags.
 */

import { Track } from '../types';
import { cleanString } from '../utils/trackUtils';

export interface RepairedMetadata {
  title: string;
  artist: string;
  album: string;
  coverArtUrl?: string | null;
  coverUrl?: string | null;
  genre?: string;
  year?: number | null;
}

export async function fixTrackMetadata(track: Track): Promise<RepairedMetadata> {
  const cleanedTitle = cleanString(track.title || '');
  const cleanedArtist = (track.artist || '').replace(/^official\s+/i, '').trim();

  const query = `${cleanedArtist} ${cleanedTitle}`.trim();
  let coverArtUrl = track.coverArtUrl || track.coverUrl || null;
  let album = track.album || 'Single';
  let genre = track.genre;
  let year = track.year;

  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await fetch(searchUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        if (item.artworkUrl100) {
          // Upgrade artwork to 1400x1400 HD resolution
          coverArtUrl = item.artworkUrl100.replace('100x100bb', '1400x1400bb');
        }
        if (item.collectionName) album = item.collectionName;
        if (item.primaryGenreName) genre = item.primaryGenreName;
        if (item.releaseDate) year = new Date(item.releaseDate).getFullYear();
      }
    }
  } catch (err) {
    console.warn('[MetadataFixer] iTunes artwork lookup fallback:', err);
  }

  return {
    title: cleanedTitle || track.title,
    artist: cleanedArtist || track.artist,
    album,
    coverArtUrl,
    coverUrl: coverArtUrl,
    genre,
    year
  };
}
