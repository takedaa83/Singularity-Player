import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { timeStore } from './useAudioEngine';

/**
 * Global keyboard shortcuts. Reads currentTime/duration from the external
 * time store (ref-based), so the listener registers ONCE and never re-registers.
 */
export const useKeyboardShortcuts = (seek: (time: number) => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      if (target.isContentEditable) return;

      const state = usePlayerStore.getState();
      // Read time from external store (not from closure/props)
      const { currentTime, duration } = timeStore.getSnapshot();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (state.currentTrack) {
            state.setPlaying(!state.isPlaying);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 5));
          break;
        case 'ArrowUp':
          e.preventDefault();
          state.setVolume(Math.min(1, state.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          state.setVolume(Math.max(0, state.volume - 0.05));
          break;
        case 'KeyN':
          if (!e.ctrlKey && !e.metaKey) {
            state.nextTrack(true);
          }
          break;
        case 'KeyP':
          if (!e.ctrlKey && !e.metaKey) {
            state.prevTrack();
          }
          break;
        case 'KeyM':
          if (!e.ctrlKey && !e.metaKey) {
            state.toggleMute();
          }
          break;
        case 'KeyS':
          if (!e.ctrlKey && !e.metaKey) {
            state.toggleShuffle();
          }
          break;
        case 'KeyR':
          if (!e.ctrlKey && !e.metaKey) {
            const modes: Array<'off' | 'one' | 'all'> = ['off', 'one', 'all'];
            const nextIdx = (modes.indexOf(state.repeat) + 1) % modes.length;
            state.setRepeat(modes[nextIdx]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seek]); // seek is now useCallback-memoized, so this effect runs ONCE
};
