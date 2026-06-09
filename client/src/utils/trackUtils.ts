import { Track } from '../types';

export const DUPLICATE_VARIANT_KEYWORDS = [
  'lofi', 'lo-fi', 'lo fi',
  'slowed', 'reverb', 'slowed reverb', 'slowed + reverb',
  'nightcore',
  'remix', 'remixed',
  'instrumental',
  'karaoke',
  'live', 'live version', 'live at', 'live from',
  'acoustic', 'acoustic version',
  'extended', 'extended version', 'extended mix',
  'radio edit', 'radio version',
  'fan edit', 'fan made',
  'reupload', 're-upload',
  'cover', 'covered by',
  'sped up', 'speed up', 'pitched up', 'pitched down',
  'bass boosted', 'bass boost',
  'reverbed', 'slowed down',
  '8d audio', '8d',
  'choir version', 'orchestral version',
  'piano version', 'guitar version',
];

export function cleanString(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(official video|official audio|lyric video|lyrics|audio|video|official|hd|4k|hq|remastered|remaster)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitleForDuplication(title: string): string {
  let normalized = (title || '').toLowerCase();
  normalized = normalized.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]/g, '');
  for (const kw of DUPLICATE_VARIANT_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isDuplicateTrack(trackA: Track, trackB: Track): boolean {
  const titleA = normalizeTitleForDuplication(trackA.title || '');
  const titleB = normalizeTitleForDuplication(trackB.title || '');
  const artistA = cleanString(trackA.artist || '');
  const artistB = cleanString(trackB.artist || '');
  
  const sameArtist = artistA === artistB || artistA.includes(artistB) || artistB.includes(artistA);
  if (titleA === titleB && sameArtist) return true;
  if (sameArtist && titleA.length > 0 && titleB.length > 0) {
    const distance = levenshteinDistance(titleA, titleB);
    const maxLen = Math.max(titleA.length, titleB.length);
    if (maxLen > 0 && distance / maxLen < 0.15) return true;
  }
  return false;
}
