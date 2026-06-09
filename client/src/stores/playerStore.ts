import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, SpatialAudioConfig, DEFAULT_USER_SETTINGS } from '../types';
import { initDB } from '../lib/db';
import { api } from '../utils/api';
import { isDuplicateTrack } from '../utils/trackUtils';

const triggerPrefetch = (track: Track | null) => {
  if (!track || track.source !== 'youtube') return;
  fetch(`${api.baseUrl}/api/yt/prefetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoIds: [track.videoId] })
  }).catch(() => {});
};

const prefetchNextQueuedTrack = (queue: Track[], activeQueueIndex: number, shuffle: boolean, repeat: 'off' | 'one' | 'all') => {
  if (queue.length === 0) return;
  let nextIndex = activeQueueIndex + 1;
  if (nextIndex >= queue.length) {
    if (repeat === 'all') nextIndex = 0;
    else return;
  }
  const nextTrack = queue[nextIndex];
  triggerPrefetch(nextTrack);
};

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  originalQueue: Track[]; // preserved order for un-shuffle
  activeQueueIndex: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  playbackSpeed: number;
  crossfadeDuration: number;
  equalizerBands: number[]; // 10 ISO band gains
  visualizerStyle: 'bars' | 'wave' | 'circular';
  isMuted: boolean;
  prevVolume: number;
  spatialAudioEnabled: boolean;
  spatialAudioConfig: SpatialAudioConfig;
  favorites: string[]; // Track IDs of favorited tracks
  isBuffering: boolean;
  streamingQuality: 'high' | 'medium' | 'low';
  measuredAudioLatency: number;
  
  // Actions
  setPlaying: (playing: boolean) => void;
  playTrack: (track: Track, newQueue?: Track[]) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  setQueue: (queue: Track[], startIndex?: number) => void;
  nextTrack: (force?: boolean) => void;
  prevTrack: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  setRepeat: (repeat: 'off' | 'one' | 'all') => void;
  setPlaybackSpeed: (speed: number) => void;
  setCrossfadeDuration: (duration: number) => void;
  setEqualizerBands: (bands: number[]) => void;
  setVisualizerStyle: (style: 'bars' | 'wave' | 'circular') => void;
  setSpatialAudioEnabled: (enabled: boolean) => void;
  setSpatialAudioConfig: (config: SpatialAudioConfig) => void;
  clearQueue: () => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (newQueue: Track[]) => void;
  loadFavorites: () => Promise<void>;
  setBuffering: (buffering: boolean) => void;
  setStreamingQuality: (quality: 'high' | 'medium' | 'low') => void;
}

// Helper to shuffle queue using Fisher-Yates
const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      queue: [],
      originalQueue: [],
      activeQueueIndex: -1,
      spatialAudioEnabled: false,
      spatialAudioConfig: DEFAULT_USER_SETTINGS.spatialAudioConfig,
      volume: 0.8,
      shuffle: false,
      repeat: 'off',
      playbackSpeed: 1.0,
      crossfadeDuration: 3, // 3 seconds default
      equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // flat 0dB default
      visualizerStyle: 'bars',
      isMuted: false,
      prevVolume: 0.8,
      favorites: [],
      isBuffering: false,
      streamingQuality: 'high',
      measuredAudioLatency: 0,

      setPlaying: (playing) => set({ isPlaying: playing }),
      setBuffering: (buffering) => set({ isBuffering: buffering }),
      setStreamingQuality: (quality) => set({ streamingQuality: quality }),

      playTrack: (track, newQueue) => {
        const { queue } = get();
        let updatedQueue = newQueue || [...queue];
        
        // If not in the queue, prepend or insert next
        let index = updatedQueue.findIndex(t => t.id === track.id);
        if (index === -1) {
          updatedQueue = [track, ...updatedQueue];
          index = 0;
        }

        set({
          currentTrack: track,
          queue: updatedQueue,
          activeQueueIndex: index,
          isPlaying: true
        });
        prefetchNextQueuedTrack(updatedQueue, index, get().shuffle, get().repeat);
      },

      addToQueue: (track) => {
        const { queue, currentTrack } = get();
        // Prevent exact ID duplicates or alternate duplicate versions (remixes, lofi, etc.) of already queued songs
        if (queue.some(t => t.id === track.id || isDuplicateTrack(t, track))) return;
        const newQueue = [...queue, track];
        if (!currentTrack) {
          set({
            queue: newQueue,
            currentTrack: track,
            activeQueueIndex: 0,
            isPlaying: false
          });
        } else {
          set({ queue: newQueue });
        }
      },

      playNext: (track) => {
        const { queue, currentTrack } = get();
        
        // Remove track or duplicate versions from queue if already present to prevent duplicates
        let updatedQueue = queue.filter(t => t.id !== track.id && !isDuplicateTrack(t, track));
        
        if (!currentTrack) {
          // If nothing is playing, play immediately
          set({
            queue: [track, ...updatedQueue],
            currentTrack: track,
            activeQueueIndex: 0,
            isPlaying: true
          });
          prefetchNextQueuedTrack([track, ...updatedQueue], 0, get().shuffle, get().repeat);
          return;
        }
        
        // Find current track index in the updated queue
        const currIndex = updatedQueue.findIndex(t => t.id === currentTrack.id);
        const insertIndex = currIndex !== -1 ? currIndex + 1 : 0;
        
        // Insert track next
        updatedQueue.splice(insertIndex, 0, track);
        
        // Recalculate new active queue index
        const newActiveIndex = updatedQueue.findIndex(t => t.id === currentTrack.id);
        
        set({
          queue: updatedQueue,
          activeQueueIndex: newActiveIndex >= 0 ? newActiveIndex : 0
        });
        
        prefetchNextQueuedTrack(updatedQueue, newActiveIndex >= 0 ? newActiveIndex : 0, get().shuffle, get().repeat);
      },

      setQueue: (newQueue, startIndex = 0) => {
        if (newQueue.length === 0) {
          set({
            queue: [],
            currentTrack: null,
            activeQueueIndex: -1,
            isPlaying: false
          });
          return;
        }
        
        const index = Math.max(0, Math.min(startIndex, newQueue.length - 1));
        set({
          queue: newQueue,
          activeQueueIndex: index,
          currentTrack: newQueue[index],
          isPlaying: true
        });
        prefetchNextQueuedTrack(newQueue, index, get().shuffle, get().repeat);
      },

      nextTrack: (force = false) => {
        const { queue, activeQueueIndex, repeat, shuffle } = get();
        if (queue.length === 0) return;

        // Handle repeat one (unless skipped manually)
        if (repeat === 'one' && !force) {
          // Keep playing the same track
          set({ isPlaying: true });
          return;
        }

        let nextIndex = activeQueueIndex;

        if (shuffle) {
          // Pick a random track index that is different if possible
          nextIndex = Math.floor(Math.random() * queue.length);
        } else {
          nextIndex = activeQueueIndex + 1;
          if (nextIndex >= queue.length) {
            if (repeat === 'all') {
              nextIndex = 0;
            } else {
              // End of queue, stop playback
              set({ isPlaying: false });
              return;
            }
          }
        }

        set({
          activeQueueIndex: nextIndex,
          currentTrack: queue[nextIndex],
          isPlaying: true
        });
        prefetchNextQueuedTrack(queue, nextIndex, shuffle, repeat);
      },

      prevTrack: () => {
        const { queue, activeQueueIndex, repeat } = get();
        if (queue.length === 0) return;

        let prevIndex = activeQueueIndex - 1;
        if (prevIndex < 0) {
          if (repeat === 'all') {
            prevIndex = queue.length - 1;
          } else {
            // Stay on first track
            prevIndex = 0;
          }
        }

        set({
          activeQueueIndex: prevIndex,
          currentTrack: queue[prevIndex],
          isPlaying: true
        });
        prefetchNextQueuedTrack(queue, prevIndex, get().shuffle, repeat);
      },

      setVolume: (vol) => {
        const volume = Math.max(0, Math.min(vol, 1));
        set({ volume, isMuted: volume === 0 });
      },

      toggleMute: () => {
        const { isMuted, volume, prevVolume } = get();
        if (isMuted) {
          set({ isMuted: false, volume: prevVolume });
        } else {
          set({ isMuted: true, prevVolume: volume, volume: 0 });
        }
      },

      toggleShuffle: () => {
        const { shuffle, queue, originalQueue, currentTrack } = get();
        const nextShuffle = !shuffle;
        
        if (nextShuffle && queue.length > 0 && currentTrack) {
          // Save original order before shuffling
          const remaining = queue.filter(t => t.id !== currentTrack.id);
          const shuffled = [currentTrack, ...shuffleArray(remaining)];
          set({
            shuffle: nextShuffle,
            originalQueue: [...queue], // preserve original order
            queue: shuffled,
            activeQueueIndex: 0
          });
          prefetchNextQueuedTrack(shuffled, 0, nextShuffle, get().repeat);
        } else if (!nextShuffle && originalQueue.length > 0 && currentTrack) {
          // Restore original order
          const restoredIndex = originalQueue.findIndex(t => t.id === currentTrack.id);
          set({
            shuffle: nextShuffle,
            queue: [...originalQueue],
            activeQueueIndex: restoredIndex >= 0 ? restoredIndex : 0,
          });
          prefetchNextQueuedTrack(originalQueue, restoredIndex >= 0 ? restoredIndex : 0, nextShuffle, get().repeat);
        } else {
          set({ shuffle: nextShuffle });
        }
      },

      setRepeat: (repeat) => set({ repeat }),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setCrossfadeDuration: (duration) => set({ crossfadeDuration: duration }),
      setEqualizerBands: (bands) => set({ equalizerBands: bands }),
      setVisualizerStyle: (style) => set({ visualizerStyle: style }),
      setSpatialAudioEnabled: (enabled) => set({ spatialAudioEnabled: enabled }),
      setSpatialAudioConfig: (config) => set({ spatialAudioConfig: config }),

      clearQueue: () => set({
        queue: [],
        activeQueueIndex: -1,
        currentTrack: null,
        isPlaying: false
      }),

      removeFromQueue: (index) => {
        const { queue, activeQueueIndex } = get();
        if (index < 0 || index >= queue.length) return;

        const newQueue = queue.filter((_, idx) => idx !== index);
        let newActiveIndex = activeQueueIndex;

        if (newQueue.length === 0) {
          set({
            queue: [],
            currentTrack: null,
            activeQueueIndex: -1,
            isPlaying: false
          });
          return;
        }

        if (index === activeQueueIndex) {
          // Removing currently playing track
          newActiveIndex = index >= newQueue.length ? 0 : index;
          set({
            queue: newQueue,
            activeQueueIndex: newActiveIndex,
            currentTrack: newQueue[newActiveIndex]
          });
        } else {
          if (index < activeQueueIndex) {
            newActiveIndex = activeQueueIndex - 1;
          }
          set({
            queue: newQueue,
            activeQueueIndex: newActiveIndex
          });
        }
      },

      reorderQueue: (newQueue) => {
        const { currentTrack } = get();
        let newIndex = -1;
        if (currentTrack) {
          newIndex = newQueue.findIndex(t => t.id === currentTrack.id);
        }
        set({
          queue: newQueue,
          activeQueueIndex: newIndex
        });
      },

      loadFavorites: async () => {
        try {
          const db = await initDB();
          const favs = await db.getAll('favorites');
          const sortedIds = favs.sort((a, b) => b.addedAt - a.addedAt).map(f => f.trackId);
          set({ favorites: sortedIds });
        } catch (err) {
          console.error('Failed to load favorites in playerStore:', err);
        }
      }
    }),
    {
      name: 'singularity-player-settings',
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        prevVolume: state.prevVolume,
        playbackSpeed: state.playbackSpeed,
        crossfadeDuration: state.crossfadeDuration,
        equalizerBands: state.equalizerBands,
        visualizerStyle: state.visualizerStyle,
        spatialAudioEnabled: state.spatialAudioEnabled,
        spatialAudioConfig: state.spatialAudioConfig,
        streamingQuality: state.streamingQuality,
      }),
    }
  )
);
