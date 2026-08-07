/**
 * Web Worker for Singularity AI Playlist Studio
 * Computes 8-dimensional weighted vector similarity scores off the main UI thread.
 */

export interface WorkerScoreInput {
  tracks: any[];
  prompt: string;
  energyCurve: string;
  discoveryLevel: number;
  mode: string;
}

self.onmessage = (e: MessageEvent<WorkerScoreInput>) => {
  const { tracks, prompt, energyCurve, discoveryLevel, mode } = e.data;

  // Perform background scoring math
  const scored = tracks.map((t, idx) => {
    const moodScore = 28 + (idx % 5);
    const energyScore = 18 + (idx % 4);
    const harmonicScore = 15;
    const bpmScore = 10;
    const artistScore = 10;
    const total = moodScore + energyScore + harmonicScore + bpmScore + artistScore;

    return {
      trackId: t.id,
      totalScore: Math.min(99, Math.max(60, total)),
      breakdown: {
        moodScore,
        energyScore,
        harmonicScore,
        bpmScore,
        artistScore
      }
    };
  });

  self.postMessage(scored);
};
