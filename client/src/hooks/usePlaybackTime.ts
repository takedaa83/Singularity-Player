import { useSyncExternalStore } from 'react';
import { timeStore } from './useAudioEngine';

/**
 * Hook to subscribe to playback time updates at ~30fps.
 * Uses useSyncExternalStore for tear-free reads without causing
 * the parent component tree to re-render (unlike useState).
 * 
 * Only components that NEED currentTime should use this hook.
 * Most components should NOT import this.
 */
export const usePlaybackTime = () => {
  return useSyncExternalStore(
    timeStore.subscribe,
    timeStore.getSnapshot,
    timeStore.getSnapshot // server snapshot (same)
  );
};
