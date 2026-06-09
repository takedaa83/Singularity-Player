import { initDB } from '../lib/db';
import { Track, RecommendationSection, HistoryEntry, PlaySession } from '../types';

// Cache for results
let cachedSections: RecommendationSection[] | null = null;
let cachedSmartRecs: Track[] | null = null;

// Worker instance & concurrency reference
let workerInstance: Worker | null = null;
let pendingCalculation: {
  resolve: (value: { sections: RecommendationSection[]; smartRecs: Track[] }) => void;
  reject: (reason: any) => void;
} | null = null;
let activeCalculationPromise: Promise<{ sections: RecommendationSection[]; smartRecs: Track[] }> | null = null;

const getWorker = (): Worker | null => {
  if (typeof window !== 'undefined' && !workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('./recommendation.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      console.error('Failed to spawn recommendation Web Worker:', err);
    }
  }
  return workerInstance;
};

const runWorkerCalculation = (payload: {
  tracks: Track[];
  favorites: string[];
  history: HistoryEntry[];
  sessions: PlaySession[];
}): Promise<{ sections: RecommendationSection[]; smartRecs: Track[] }> => {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('Web Worker not supported or failed to start'));
      return;
    }

    // Cancel in-flight duplicate requests
    if (pendingCalculation) {
      pendingCalculation.reject(new Error('Newer calculation triggered'));
    }

    pendingCalculation = { resolve, reject };

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload: responsePayload } = e.data;
      if (type === 'success') {
        if (pendingCalculation) {
          pendingCalculation.resolve(responsePayload);
          pendingCalculation = null;
        }
      } else if (type === 'error') {
        if (pendingCalculation) {
          pendingCalculation.reject(new Error(responsePayload));
          pendingCalculation = null;
        }
      }
    };

    worker.postMessage({ type: 'calculate', payload });
  });
};

const calculateAll = async (): Promise<{ sections: RecommendationSection[]; smartRecs: Track[] }> => {
  if (activeCalculationPromise) {
    return activeCalculationPromise;
  }

  activeCalculationPromise = (async () => {
    try {
      const db = await initDB();

      // 1. Fetch tracks metadata (metadata array is small, required for full similarity matrix)
      const tracks = await db.getAll('tracks');
      
      // 2. Fetch favorites list
      const favorites = await db.getAll('favorites');

      // 3. Fetch only the most recent 100 history entries using reverse cursor
      const historyTx = db.transaction('history', 'readonly');
      const historyIndex = historyTx.store.index('playedAt');
      let historyCursor = await historyIndex.openCursor(null, 'prev');
      const history: HistoryEntry[] = [];
      while (historyCursor && history.length < 100) {
        history.push(historyCursor.value);
        historyCursor = await historyCursor.continue();
      }

      // 4. Fetch only the most recent 100 play sessions using reverse cursor
      const sessionsTx = db.transaction('playSessions', 'readonly');
      const sessionsIndex = sessionsTx.store.index('startTime');
      let sessionsCursor = await sessionsIndex.openCursor(null, 'prev');
      const sessions: PlaySession[] = [];
      while (sessionsCursor && sessions.length < 100) {
        sessions.push(sessionsCursor.value);
        sessionsCursor = await sessionsCursor.continue();
      }

      const payload = {
        tracks,
        favorites: favorites.map((f) => f.trackId),
        history,
        sessions,
      };

      return await runWorkerCalculation(payload);
    } finally {
      activeCalculationPromise = null;
    }
  })();

  return activeCalculationPromise;
};

export const recommendationEngine = {
  /**
   * Generates recommendation sections utilizing cached values or offloading math to worker.
   */
  generateRecommendations: async (): Promise<RecommendationSection[]> => {
    if (cachedSections) {
      return cachedSections;
    }

    try {
      const result = await calculateAll();
      cachedSections = result.sections;
      cachedSmartRecs = result.smartRecs;
      return cachedSections;
    } catch (err) {
      console.error('Failed to generate worker-based recommendations:', err);
      return [];
    }
  },

  /**
   * Generates custom smart recommendations utilizing cached values or offloading to worker.
   */
  getSmartRecommendations: async (): Promise<Track[]> => {
    if (cachedSmartRecs) {
      return cachedSmartRecs;
    }

    try {
      const result = await calculateAll();
      cachedSections = result.sections;
      cachedSmartRecs = result.smartRecs;
      return cachedSmartRecs;
    } catch (err) {
      console.error('Failed to generate worker-based smart recommendations:', err);
      return [];
    }
  },

  /**
   * Invalidates taste cache (to be called on favorites updates or session log completions).
   */
  invalidateCache: (): void => {
    cachedSections = null;
    cachedSmartRecs = null;
    activeCalculationPromise = null;
  },
};
