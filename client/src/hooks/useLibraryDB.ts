import { initDB } from '../lib/db';
import { Track, Playlist, UserSettings, HistoryEntry, PlaySession, SearchHistoryEntry } from '../types';
import { DEMO_TRACKS } from '../lib/demoTracks';
import { usePlayerStore } from '../stores/playerStore';

export const useLibraryDB = () => {
  // --- TRACKS METHODS ---

  const saveTrack = async (track: Track): Promise<void> => {
    const db = await initDB();
    await db.put('tracks', track);
  };

  const getAllTracks = async (): Promise<Track[]> => {
    const db = await initDB();
    
    // Auto populate demo content on first launch
    const demoLoaded = await db.get('settings', 'demo_loaded');
    if (!demoLoaded) {
      for (const track of DEMO_TRACKS) {
        await db.put('tracks', track);
      }
      await db.put('settings', { key: 'demo_loaded', value: { key: 'demo_loaded', value: true } });
    }

    const tracks = await db.getAll('tracks');
    return tracks.sort((a, b) => b.addedAt - a.addedAt); // newest first
  };

  const deleteTrack = async (trackId: string): Promise<void> => {
    const db = await initDB();
    await db.delete('tracks', trackId);
    
    // Also remove this track from any playlists
    const playlists = await db.getAll('playlists');
    for (const playlist of playlists) {
      if (playlist.trackIds.includes(trackId)) {
        playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
        await db.put('playlists', playlist);
      }
    }

    // Also remove from favorites
    await db.delete('favorites', trackId);
  };

  const getTrackCount = async (): Promise<number> => {
    const db = await initDB();
    return db.count('tracks');
  };

  // --- PLAYLISTS METHODS ---

  const savePlaylist = async (playlist: Playlist): Promise<void> => {
    const db = await initDB();
    await db.put('playlists', { ...playlist, updatedAt: Date.now() });
  };

  const getAllPlaylists = async (): Promise<Playlist[]> => {
    const db = await initDB();
    return db.getAll('playlists');
  };

  const deletePlaylist = async (playlistId: string): Promise<void> => {
    const db = await initDB();
    await db.delete('playlists', playlistId);
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string): Promise<void> => {
    const db = await initDB();
    const playlist = await db.get('playlists', playlistId);
    if (playlist && !playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      playlist.updatedAt = Date.now();
      await db.put('playlists', playlist);
    }
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string): Promise<void> => {
    const db = await initDB();
    const playlist = await db.get('playlists', playlistId);
    if (playlist) {
      playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
      playlist.updatedAt = Date.now();
      await db.put('playlists', playlist);
    }
  };

  // --- FAVORITES METHODS ---

  const toggleFavorite = async (trackId: string): Promise<boolean> => {
    const db = await initDB();
    const existing = await db.get('favorites', trackId);
    let isFav = false;
    if (existing) {
      await db.delete('favorites', trackId);
      isFav = false;
    } else {
      await db.put('favorites', { trackId, addedAt: Date.now() });
      isFav = true;
    }
    
    // Sync with usePlayerStore
    try {
      await usePlayerStore.getState().loadFavorites();
    } catch (e) {
      console.error('Failed to sync favorites with player store:', e);
    }
    
    return isFav;
  };

  const isFavorite = async (trackId: string): Promise<boolean> => {
    const db = await initDB();
    const val = await db.get('favorites', trackId);
    return !!val;
  };

  const getAllFavorites = async (): Promise<string[]> => {
    const db = await initDB();
    const favs = await db.getAll('favorites');
    return favs.sort((a, b) => b.addedAt - a.addedAt).map(f => f.trackId);
  };

  const getFavoriteCount = async (): Promise<number> => {
    const db = await initDB();
    return db.count('favorites');
  };

  // --- PLAYBACK HISTORY METHODS ---

  const addHistoryEntry = async (trackId: string): Promise<void> => {
    const db = await initDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    await store.add({ trackId, playedAt: Date.now() });

    // Maintain max 200 entries
    const entries = await store.index('playedAt').getAll();
    if (entries.length > 200) {
      const oldest = entries[0];
      if (oldest && oldest.id) {
        await store.delete(oldest.id);
      }
    }
    await tx.done;
  };

  const getPlaybackHistory = async (): Promise<HistoryEntry[]> => {
    const db = await initDB();
    const entries = await db.getAllFromIndex('history', 'playedAt');
    return entries.reverse(); // newest first
  };

  const clearPlaybackHistory = async (): Promise<void> => {
    const db = await initDB();
    await db.clear('history');
  };

  // --- PLAY SESSION METHODS (Analytics) ---

  const recordPlaySession = async (session: Omit<PlaySession, 'id'>): Promise<void> => {
    const db = await initDB();
    await db.add('playSessions', session as PlaySession);
  };

  const getPlaySessionsForTrack = async (trackId: string): Promise<PlaySession[]> => {
    const db = await initDB();
    return db.getAllFromIndex('playSessions', 'trackId', trackId);
  };

  const getTotalListeningTime = async (): Promise<number> => {
    const db = await initDB();
    const sessions = await db.getAll('playSessions');
    return sessions.reduce((sum, s) => sum + s.duration, 0);
  };

  const getTopTracks = async (limit = 10): Promise<Array<{ trackId: string; playCount: number; totalDuration: number }>> => {
    const db = await initDB();
    const sessions = await db.getAll('playSessions');
    const statsMap = new Map<string, { playCount: number; totalDuration: number }>();

    for (const s of sessions) {
      const existing = statsMap.get(s.trackId) || { playCount: 0, totalDuration: 0 };
      existing.playCount++;
      existing.totalDuration += s.duration;
      statsMap.set(s.trackId, existing);
    }

    return Array.from(statsMap.entries())
      .map(([trackId, stats]) => ({ trackId, ...stats }))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  };

  // --- SEARCH HISTORY METHODS ---

  const addSearchHistoryEntry = async (query: string, resultCount?: number): Promise<void> => {
    const db = await initDB();
    const tx = db.transaction('searchHistory', 'readwrite');
    const store = tx.objectStore('searchHistory');
    await store.add({ query, timestamp: Date.now(), resultCount } as SearchHistoryEntry);

    // Keep max 50 entries
    const all = await store.index('timestamp').getAll();
    if (all.length > 50) {
      const oldest = all[0];
      if (oldest?.id) await store.delete(oldest.id);
    }
    await tx.done;
  };

  const getSearchHistory = async (limit = 10): Promise<SearchHistoryEntry[]> => {
    const db = await initDB();
    const entries = await db.getAllFromIndex('searchHistory', 'timestamp');
    // Deduplicate by query (keep most recent)
    const seen = new Map<string, SearchHistoryEntry>();
    for (const entry of entries) {
      seen.set(entry.query.toLowerCase(), entry);
    }
    return Array.from(seen.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  };

  const clearSearchHistory = async (): Promise<void> => {
    const db = await initDB();
    await db.clear('searchHistory');
  };

  // --- USER SETTINGS METHODS ---

  const saveUserSettings = async (settings: UserSettings): Promise<void> => {
    const db = await initDB();
    await db.put('settings', { key: 'user_settings', value: settings });
  };

  const getUserSettings = async (): Promise<UserSettings | null> => {
    const db = await initDB();
    const entry = await db.get('settings', 'user_settings');
    return entry ? entry.value : null;
  };

  return {
    // Tracks
    saveTrack,
    getAllTracks,
    deleteTrack,
    getTrackCount,
    // Playlists
    savePlaylist,
    getAllPlaylists,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    // Favorites
    toggleFavorite,
    isFavorite,
    getAllFavorites,
    getFavoriteCount,
    // History
    addHistoryEntry,
    getPlaybackHistory,
    clearPlaybackHistory,
    // Play Sessions (Analytics)
    recordPlaySession,
    getPlaySessionsForTrack,
    getTotalListeningTime,
    getTopTracks,
    // Search History
    addSearchHistoryEntry,
    getSearchHistory,
    clearSearchHistory,
    // Settings
    saveUserSettings,
    getUserSettings
  };
};

