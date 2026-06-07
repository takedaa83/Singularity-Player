/**
 * Get a human-readable label for a track's source.
 * Single source of truth — replaces 2 duplicate implementations.
 */
export function getSourceLabel(source: string): string {
  switch (source) {
    case 'youtube': return 'YouTube';
    case 'deezer': return 'Deezer';
    case 'itunes': return 'iTunes';
    case 'local': return 'Local';
    case 'demo': return 'Demo';
    default: return source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Unknown';
  }
}

/**
 * Short labels for compact badges (player bar).
 */
export function getSourceShortLabel(source: string): string {
  switch (source) {
    case 'youtube': return 'YT';
    case 'deezer': return 'DZ';
    case 'itunes': return 'IT';
    case 'local': return 'LOCAL';
    case 'demo': return 'DEMO';
    default: return source?.toUpperCase().slice(0, 3) || '';
  }
}

/**
 * Get a color class for a track source badge.
 */
export function getSourceColor(source: string): string {
  switch (source) {
    case 'youtube': return '#ff4444';
    case 'deezer': return '#a855f7';
    case 'itunes': return '#f472b6';
    case 'local': return '#22d3ee';
    case 'demo': return '#facc15';
    default: return '#94a3b8';
  }
}
