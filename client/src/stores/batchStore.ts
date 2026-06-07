import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track } from '../types';

interface BatchState {
  tracks: Track[];
  addTrack: (track: Track) => void;
  addTracks: (tracks: Track[]) => void;
  removeTrack: (trackId: string) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>()(
  persist(
    (set, get) => ({
      tracks: [],

      addTrack: (track) => {
        const { tracks } = get();
        if (tracks.some((t) => t.id === track.id)) return;
        set({ tracks: [...tracks, track] });
      },

      addTracks: (newTracks) => {
        const { tracks } = get();
        const filtered = newTracks.filter(
          (nt) => !tracks.some((t) => t.id === nt.id)
        );
        if (filtered.length === 0) return;
        set({ tracks: [...tracks, ...filtered] });
      },

      removeTrack: (trackId) => {
        const { tracks } = get();
        set({ tracks: tracks.filter((t) => t.id !== trackId) });
      },

      clearBatch: () => set({ tracks: [] }),
    }),
    {
      name: 'singularity-batch-downloads',
    }
  )
);
