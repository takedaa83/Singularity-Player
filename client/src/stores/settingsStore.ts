import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../types';
import { usePlayerStore } from './playerStore';

interface SettingsStore {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_USER_SETTINGS },

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));

        // Propagate updates to playerStore for matching keys
        const playerState = usePlayerStore.getState();
        if (key === 'volume') {
          playerState.setVolume(value as number);
        } else if (key === 'shuffle') {
          usePlayerStore.setState({ shuffle: value as boolean });
        } else if (key === 'repeat') {
          playerState.setRepeat(value as any);
        } else if (key === 'crossfadeDuration') {
          playerState.setCrossfadeDuration(value as number);
        } else if (key === 'playbackSpeed') {
          playerState.setPlaybackSpeed(value as number);
        } else if (key === 'eqBands') {
          playerState.setEqualizerBands(value as number[]);
        } else if (key === 'spatialAudioEnabled') {
          playerState.setSpatialAudioEnabled(value as boolean);
        } else if (key === 'spatialAudioConfig') {
          playerState.setSpatialAudioConfig(value as any);
        }
      },

      resetSettings: () => {
        set({ settings: { ...DEFAULT_USER_SETTINGS } });
        
        // Also reset the player state equivalents
        const playerState = usePlayerStore.getState();
        playerState.setVolume(DEFAULT_USER_SETTINGS.volume);
        usePlayerStore.setState({ shuffle: DEFAULT_USER_SETTINGS.shuffle });
        playerState.setRepeat(DEFAULT_USER_SETTINGS.repeat);
        playerState.setCrossfadeDuration(DEFAULT_USER_SETTINGS.crossfadeDuration);
        playerState.setPlaybackSpeed(DEFAULT_USER_SETTINGS.playbackSpeed);
        playerState.setEqualizerBands(DEFAULT_USER_SETTINGS.eqBands);
        playerState.setSpatialAudioEnabled(DEFAULT_USER_SETTINGS.spatialAudioEnabled);
        playerState.setSpatialAudioConfig(DEFAULT_USER_SETTINGS.spatialAudioConfig);
        playerState.setStreamingQuality('high');
      },
    }),
    {
      name: 'singularity-settings',
    }
  )
);
