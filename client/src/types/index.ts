// ─── Core Track ───────────────────────────────────────────────────────

export interface Track {
  id: string;                  // UUID (local) or API track ID
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  duration: number;            // seconds
  bitrate: number | null;      // kbps
  sampleRate: number | null;   // Hz
  fileSize: number;            // bytes
  mimeType: string;
  coverArtUrl: string | null;  // Relative server path or external CDN URL
  source: 'local' | 'deezer' | 'itunes' | 'demo' | 'youtube';
  streamUrl: string;           // API path or external preview CDN URL
  filePath: string | null;     // Relative server uploaded filename if local
  addedAt: number;             // timestamp
  videoId?: string;            // YouTube video ID for proxy streaming
  // Real analyzed audio features (optional, populated via analysis)
  bpm?: number | null;
  energy?: number | null;
  valence?: number | null;
  danceability?: number | null;
  acousticness?: number | null;
  instrumentalness?: number | null;
  audioFeatures?: {
    bpm: number;
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    instrumentalness: number;
  } | null;
  // Analytics fields (populated from playSessions)
  playCount?: number;
  lastPlayedAt?: number;
  skipCount?: number;
  totalListenDuration?: number; // total seconds this track has been listened to
  // Offline & lyrics
  isDownloaded?: boolean;
  lyrics?: string | null;       // cached plain text lyrics
  syncedLyrics?: string | null; // cached LRC format lyrics
  replayGain?: number | null;   // ReplayGain track gain in dB
}

// ─── Playlists ────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  trackIds: string[];          // ordered array of Track ids
  createdAt: number;
  updatedAt?: number;
  // Smart playlist
  isSmartPlaylist?: boolean;
  rules?: SmartPlaylistRule[];
  // Customization
  color?: string;
  icon?: string;
}

export interface SmartPlaylistRule {
  field: 'genre' | 'artist' | 'album' | 'year' | 'playCount' | 'addedAt' | 'source';
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'isOneOf';
  value: string | number | string[];
}

// ─── Settings ─────────────────────────────────────────────────────────

export interface UserSettings {
  // Appearance
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  compactMode: boolean;
  // Playback
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  crossfadeDuration: number;   // 0 (disabled) to 10 seconds
  playbackSpeed: number;
  autoPlayNext: boolean;
  // Audio
  eqPreset: string;
  eqBands: number[];           // 10 bands gains in dB (-12 to 12)
  spatialAudioEnabled: boolean;
  spatialAudioConfig: SpatialAudioConfig;
  // Downloads
  concurrentDownloads: number;
  autoDownloadFavorites: boolean;
  // Lyrics
  autoFetchLyrics: boolean;
  lyricsFontSize: number;
  // Recommendations
  enableRecommendations: boolean;
  // Sync
  autoSync: boolean;
  lastSyncTimestamp: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  accentColor: '#a855f7',
  compactMode: false,
  volume: 0.7,
  shuffle: false,
  repeat: 'off',
  crossfadeDuration: 0,
  playbackSpeed: 1,
  autoPlayNext: true,
  eqPreset: 'flat',
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  spatialAudioEnabled: false,
  spatialAudioConfig: { stereoWidth: 100, roomSize: 'none', elevation: 0 },
  concurrentDownloads: 3,
  autoDownloadFavorites: false,
  autoFetchLyrics: true,
  lyricsFontSize: 16,
  enableRecommendations: true,
  autoSync: false,
  lastSyncTimestamp: 0,
};

// ─── History & Favorites ──────────────────────────────────────────────

export interface HistoryEntry {
  id?: number;                 // auto-increment key
  trackId: string;
  playedAt: number;
}

export interface FavoriteEntry {
  trackId: string;
  addedAt: number;
}

// ─── Play Sessions (Analytics) ────────────────────────────────────────

export interface PlaySession {
  id?: number;                 // auto-increment key
  trackId: string;
  startTime: number;           // timestamp
  duration: number;            // seconds listened
  completed: boolean;          // did user listen to >80% of track?
  skipped: boolean;            // did user skip before 30%?
}

// ─── Downloads ────────────────────────────────────────────────────────

export type DownloadStatus = 'queued' | 'active' | 'paused' | 'completed' | 'failed';

export interface DownloadQueueItem {
  id: string;                  // unique download ID
  track: Track;                // track being downloaded
  status: DownloadStatus;
  progress: number;            // 0–100
  speed: number;               // bytes/sec
  eta: number;                 // seconds remaining
  error?: string;
  retryCount: number;
  startedAt?: number;
  completedAt?: number;
}

// ─── Recommendations ──────────────────────────────────────────────────

export interface RecommendationSection {
  id: string;
  title: string;
  subtitle?: string;
  tracks: Track[];
  type: 'continue' | 'because' | 'recommended' | 'hidden_gems' | 'trending' | 'mood' | 'top';
  sourceTrack?: Track;         // "Because you listened to X"
}

// ─── Search History ───────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id?: number;
  query: string;
  timestamp: number;
  resultCount?: number;
}

// ─── Spatial Audio ────────────────────────────────────────────────────

export interface SpatialAudioConfig {
  stereoWidth: number;         // 0–200 (100 = normal, 200 = max widening)
  roomSize: 'none' | 'small' | 'medium' | 'large';
  elevation: number;           // -90 to 90 degrees
}

// ─── EQ Presets ───────────────────────────────────────────────────────

export interface EQPreset {
  name: string;
  label: string;
  bands: number[];             // 10 band gains in dB
}

export const EQ_PRESETS: EQPreset[] = [
  { name: 'flat',       label: 'Flat',       bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'bass',       label: 'Bass Boost', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'treble',     label: 'Treble Boost', bands: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] },
  { name: 'rock',       label: 'Rock',       bands: [4, 3, 1, -1, -2, -1, 1, 3, 4, 5] },
  { name: 'pop',        label: 'Pop',        bands: [-1, 1, 3, 4, 3, 1, -1, -1, 1, 2] },
  { name: 'vocal',      label: 'Vocal',      bands: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { name: 'electronic', label: 'Electronic', bands: [5, 4, 2, 0, -2, -1, 1, 3, 5, 6] },
  { name: 'jazz',       label: 'Jazz',       bands: [3, 2, 0, 1, -1, -1, 0, 1, 3, 4] },
  { name: 'classical',  label: 'Classical',  bands: [4, 3, 1, 0, -1, -1, 0, 2, 3, 5] },
  { name: 'nightcore',  label: 'Nightcore',  bands: [-2, 0, 2, 4, 5, 5, 3, 1, -1, -2] },
];
