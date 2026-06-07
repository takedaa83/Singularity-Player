import { create } from 'zustand';
import { RecommendationSection } from '../types';
import { recommendationEngine } from '../services/recommendationEngine';

interface RecommendationStore {
  sections: RecommendationSection[];
  isLoading: boolean;
  error: string | null;
  fetchRecommendations: () => Promise<void>;
  invalidate: () => void;
}

export const useRecommendationStore = create<RecommendationStore>((set) => ({
  sections: [],
  isLoading: false,
  error: null,

  fetchRecommendations: async () => {
    set({ isLoading: true, error: null });
    try {
      const sections = await recommendationEngine.generateRecommendations();
      set({ sections, isLoading: false });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to load recommendations', isLoading: false });
    }
  },

  invalidate: () => {
    set({ sections: [] });
  },
}));
