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
      genre: string;
      album: string;
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
      trackId_playedAt: [string, number];
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
      trackId_startTime: [string, number];
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
const DB_VERSION = 3;

// Singleton: reuse the same DB connection across all hook instances
let dbPromise: Promise<IDBPDatabase<MusicDB>> | null = null;

export const initDB = (): Promise<IDBPDatabase<MusicDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion === 0) {
          // --- FRESH INSTALL: Create all version 3 stores and indexes directly ---
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('addedAt', 'addedAt');
          trackStore.createIndex('artist', 'artist');
          trackStore.createIndex('source', 'source');
          trackStore.createIndex('genre', 'genre');
          trackStore.createIndex('album', 'album');
          
          db.createObjectStore('playlists', { keyPath: 'id' });
          db.createObjectStore('favorites', { keyPath: 'trackId' });
          
          const historyStore = db.createObjectStore('history', {
            keyPath: 'id',
            autoIncrement: true,
          });
          historyStore.createIndex('playedAt', 'playedAt');
          historyStore.createIndex('trackId', 'trackId');
          historyStore.createIndex('trackId_playedAt', ['trackId', 'playedAt']);
          
          db.createObjectStore('settings', { keyPath: 'key' });
          
          const sessionsStore = db.createObjectStore('playSessions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          sessionsStore.createIndex('trackId', 'trackId');
          sessionsStore.createIndex('startTime', 'startTime');
          sessionsStore.createIndex('trackId_startTime', ['trackId', 'startTime']);

          const searchStore = db.createObjectStore('searchHistory', {
            keyPath: 'id',
            autoIncrement: true,
          });
          searchStore.createIndex('timestamp', 'timestamp');
        } else {
          // --- UPGRADE PROCESS: Apply migrations incrementally ---
          
          // --- Version 1 -> Version 2 Upgrades ---
          if (oldVersion < 2) {
            if (transaction.objectStoreNames.contains('tracks')) {
              const existingTrackStore = transaction.objectStore('tracks');
              if (!existingTrackStore.indexNames.contains('source')) {
                existingTrackStore.createIndex('source', 'source');
              }
            }

            if (transaction.objectStoreNames.contains('history')) {
              const existingHistoryStore = transaction.objectStore('history');
              if (!existingHistoryStore.indexNames.contains('trackId')) {
                existingHistoryStore.createIndex('trackId', 'trackId');
              }
            }

            if (!db.objectStoreNames.contains('playSessions')) {
              const sessionsStore = db.createObjectStore('playSessions', {
                keyPath: 'id',
                autoIncrement: true,
              });
              sessionsStore.createIndex('trackId', 'trackId');
              sessionsStore.createIndex('startTime', 'startTime');
            }

            if (!db.objectStoreNames.contains('searchHistory')) {
              const searchStore = db.createObjectStore('searchHistory', {
                keyPath: 'id',
                autoIncrement: true,
              });
              searchStore.createIndex('timestamp', 'timestamp');
            }
          }

          // --- Version 2 -> Version 3 Upgrades ---
          if (oldVersion < 3) {
            if (transaction.objectStoreNames.contains('tracks')) {
              const trStore = transaction.objectStore('tracks');
              if (!trStore.indexNames.contains('genre')) {
                trStore.createIndex('genre', 'genre');
              }
              if (!trStore.indexNames.contains('album')) {
                trStore.createIndex('album', 'album');
              }
            }

            if (transaction.objectStoreNames.contains('history')) {
              const histStore = transaction.objectStore('history');
              if (!histStore.indexNames.contains('trackId_playedAt')) {
                histStore.createIndex('trackId_playedAt', ['trackId', 'playedAt']);
              }
            }

            if (transaction.objectStoreNames.contains('playSessions')) {
              const sessStore = transaction.objectStore('playSessions');
              if (!sessStore.indexNames.contains('trackId_startTime')) {
                sessStore.createIndex('trackId_startTime', ['trackId', 'startTime']);
              }
            }
          }
        }
      },
    });
  }
  return dbPromise;
};
