import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../types';

interface SettingsStore {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_USER_SETTINGS },

      updateSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),

      resetSettings: () =>
        set({ settings: { ...DEFAULT_USER_SETTINGS } }),
    }),
    {
      name: 'singularity-settings',
    }
  )
);
