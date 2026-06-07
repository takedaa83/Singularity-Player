import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track, Playlist, UserSettings, HistoryEntry, FavoriteEntry, PlaySession, SearchHistoryEntry } from '../types';

interface MusicDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: {
      addedAt: number;
      artist: string;
      source: string;
    };
  };
  playlists: {
    key: string;
    value: Playlist;
  };
  favorites: {
    key: string;
    value: FavoriteEntry;
  };
  history: {
    key: number;
    value: HistoryEntry;
    indexes: {
      playedAt: number;
      trackId: string;
    };
  };
  settings: {
    key: string;
    value: { key: string; value: any };
  };
  playSessions: {
    key: number;
    value: PlaySession;
    indexes: {
      trackId: string;
      startTime: number;
    };
  };
  searchHistory: {
    key: number;
    value: SearchHistoryEntry;
    indexes: {
      timestamp: number;
    };
  };
}

const DB_NAME = 'professional_music_downloader_db';
const DB_VERSION = 2;

// Singleton: reuse the same DB connection across all hook instances
let dbPromise: Promise<IDBPDatabase<MusicDB>> | null = null;

export const initDB = (): Promise<IDBPDatabase<MusicDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // Version 1: original stores
        if (oldVersion < 1) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('addedAt', 'addedAt');
          trackStore.createIndex('artist', 'artist');
          db.createObjectStore('playlists', { keyPath: 'id' });
          db.createObjectStore('favorites', { keyPath: 'trackId' });
          const historyStore = db.createObjectStore('history', {
            keyPath: 'id',
            autoIncrement: true,
          });
          historyStore.createIndex('playedAt', 'playedAt');
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Version 2: analytics stores + new indexes
        if (oldVersion < 2) {
          // Add source index to tracks (for filtering)
          if (db.objectStoreNames.contains('tracks')) {
            const trackStore = transaction.objectStore('tracks');
            if (!trackStore.indexNames.contains('source')) {
              trackStore.createIndex('source', 'source');
            }
          }

          // Add trackId index to history (for lookup by track)
          if (db.objectStoreNames.contains('history')) {
            const historyStore = transaction.objectStore('history');
            if (!historyStore.indexNames.contains('trackId')) {
              historyStore.createIndex('trackId', 'trackId');
            }
          }

          // Play sessions store (analytics)
          if (!db.objectStoreNames.contains('playSessions')) {
            const sessionsStore = db.createObjectStore('playSessions', {
              keyPath: 'id',
              autoIncrement: true,
            });
            sessionsStore.createIndex('trackId', 'trackId');
            sessionsStore.createIndex('startTime', 'startTime');
          }

          // Search history store
          if (!db.objectStoreNames.contains('searchHistory')) {
            const searchStore = db.createObjectStore('searchHistory', {
              keyPath: 'id',
              autoIncrement: true,
            });
            searchStore.createIndex('timestamp', 'timestamp');
          }
        }
      },
    });
  }
  return dbPromise;
};
