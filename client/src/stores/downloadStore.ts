import { create } from 'zustand';
import { DownloadQueueItem, DownloadStatus, Track } from '../types';
import { api } from '../utils/api';

interface DownloadStore {
  queue: DownloadQueueItem[];
  maxConcurrent: number;
  // Actions
  enqueue: (track: Track) => void;
  enqueueBatch: (tracks: Track[]) => void;
  startNext: () => void;
  updateProgress: (id: string, progress: number, speed?: number, eta?: number) => void;
  markComplete: (id: string) => void;
  markFailed: (id: string, error: string) => void;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  clearCompleted: () => void;
  setMaxConcurrent: (n: number) => void;
  // Computed
  getActiveCount: () => number;
  getQueuedCount: () => number;
}

function createDownloadId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],
  maxConcurrent: 3,

  enqueue: (track) => {
    const item: DownloadQueueItem = {
      id: createDownloadId(),
      track,
      status: 'queued',
      progress: 0,
      speed: 0,
      eta: 0,
      retryCount: 0,
    };
    set((state) => ({ queue: [...state.queue, item] }));
    // Auto-start if capacity available
    setTimeout(() => get().startNext(), 50);
  },

  enqueueBatch: (tracks) => {
    const items: DownloadQueueItem[] = tracks.map((track) => ({
      id: createDownloadId(),
      track,
      status: 'queued' as DownloadStatus,
      progress: 0,
      speed: 0,
      eta: 0,
      retryCount: 0,
    }));
    set((state) => ({ queue: [...state.queue, ...items] }));
    setTimeout(() => get().startNext(), 50);
  },

  startNext: () => {
    const state = get();
    const activeCount = state.queue.filter((d) => d.status === 'active').length;
    if (activeCount >= state.maxConcurrent) return;

    const slotsAvailable = state.maxConcurrent - activeCount;
    const nextQueued = state.queue
      .filter((d) => d.status === 'queued')
      .slice(0, slotsAvailable);

    if (nextQueued.length === 0) return;

    // Mark as active
    set((s) => ({
      queue: s.queue.map((d) =>
        nextQueued.some((n) => n.id === d.id)
          ? { ...d, status: 'active' as DownloadStatus, startedAt: Date.now() }
          : d
      ),
    }));

    // Start actual downloads
    for (const item of nextQueued) {
      performDownload(item, get, set);
    }
  },

  updateProgress: (id, progress, speed, eta) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id
          ? { ...d, progress, ...(speed !== undefined && { speed }), ...(eta !== undefined && { eta }) }
          : d
      ),
    }));
  },

  markComplete: (id) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id ? { ...d, status: 'completed', progress: 100, completedAt: Date.now() } : d
      ),
    }));
    // Start next in queue with a random pacing delay (1.0s - 2.5s) to avoid rate limits
    const delay = Math.floor(Math.random() * 1500) + 1000;
    setTimeout(() => get().startNext(), delay);
  },

  markFailed: (id, error) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id ? { ...d, status: 'failed', error } : d
      ),
    }));
    // Start next in queue with a random pacing delay
    const delay = Math.floor(Math.random() * 1500) + 1000;
    setTimeout(() => get().startNext(), delay);
  },

  retry: (id) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined, retryCount: d.retryCount + 1 } : d
      ),
    }));
    // Stagger retry triggers
    const delay = Math.floor(Math.random() * 1500) + 1000;
    setTimeout(() => get().startNext(), delay);
  },

  cancel: (id) => {
    set((state) => ({
      queue: state.queue.filter((d) => d.id !== id),
    }));
  },

  pause: (id) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id ? { ...d, status: 'paused' } : d
      ),
    }));
  },

  resume: (id) => {
    set((state) => ({
      queue: state.queue.map((d) =>
        d.id === id ? { ...d, status: 'queued' } : d
      ),
    }));
    setTimeout(() => get().startNext(), 50);
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter((d) => d.status !== 'completed'),
    }));
  },

  setMaxConcurrent: (n) => {
    set({ maxConcurrent: Math.max(1, Math.min(5, n)) });
  },

  getActiveCount: () => get().queue.filter((d) => d.status === 'active').length,
  getQueuedCount: () => get().queue.filter((d) => d.status === 'queued').length,
}));

// ─── Download execution ──────────────────────────────────────────────

function parseSpeedToBytes(speedStr: string): number {
  if (!speedStr) return 0;
  const match = speedStr.match(/([0-9.]+)\s*(\w+)/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('g')) return value * 1024 * 1024 * 1024;
  if (unit.startsWith('m')) return value * 1024 * 1024;
  if (unit.startsWith('k')) return value * 1024;
  return value;
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // mm:ss
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
  }
  return parseFloat(timeStr) || 0;
}

async function performDownload(
  item: DownloadQueueItem,
  get: () => DownloadStore,
  set: (fn: (s: DownloadStore) => Partial<DownloadStore>) => void
) {
  const { track } = item;

  try {
    let downloadUrl: string;

    if (track.source === 'youtube' && track.videoId) {
      // 1. Start server-side download job
      const startRes = await fetch(`${api.baseUrl}/api/downloads/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: track.videoId }),
      });
      if (!startRes.ok) throw new Error('Failed to start server-side download');
      const { jobId } = await startRes.json();

      // 2. Listen to progress via Server-Sent Events (SSE)
      await new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${api.baseUrl}/api/downloads/progress/${jobId}`);
        
        const checkInterval = setInterval(() => {
          const currentItem = get().queue.find((d) => d.id === item.id);
          if (!currentItem || currentItem.status === 'paused') {
            eventSource.close();
            clearInterval(checkInterval);
            if (!currentItem) {
              fetch(`${api.baseUrl}/api/downloads/cancel/${jobId}`, { method: 'DELETE' }).catch(() => {});
            }
            reject(new Error('Download cancelled or paused'));
          }
        }, 1000);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.status === 'active') {
              const speed = parseSpeedToBytes(data.speed);
              const eta = parseTimeToSeconds(data.eta);
              get().updateProgress(item.id, data.progress, speed, eta);
            } else if (data.status === 'completed') {
              eventSource.close();
              clearInterval(checkInterval);
              resolve();
            } else if (data.status === 'failed') {
              eventSource.close();
              clearInterval(checkInterval);
              reject(new Error(data.error || 'Download failed on server'));
            }
          } catch (err) {
            // Ignore parse errors
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          clearInterval(checkInterval);
          reject(new Error('SSE progress connection lost'));
        };
      });

      downloadUrl = `${api.baseUrl}/api/downloads/file/${jobId}?name=${encodeURIComponent(`${track.artist} - ${track.title}.m4a`)}`;
    } else if (track.source === 'local' && track.filePath) {
      downloadUrl = `${api.baseUrl}/api/download/single/${encodeURIComponent(track.filePath)}?name=${encodeURIComponent(`${track.artist} - ${track.title}`)}`;
    } else if (track.streamUrl) {
      downloadUrl = track.streamUrl;
    } else {
      throw new Error('No download source available');
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Download stream failed: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Unable to read download body');

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    const startTime = Date.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const currentItem = get().queue.find((d) => d.id === item.id);
      if (!currentItem || currentItem.status === 'paused') {
        reader.cancel();
        return;
      }

      chunks.push(value);
      receivedBytes += value.length;

      if (totalSize > 0) {
        const progress = Math.round((receivedBytes / totalSize) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? receivedBytes / elapsed : 0;
        const remaining = totalSize - receivedBytes;
        const eta = speed > 0 ? remaining / speed : 0;
        get().updateProgress(item.id, progress, speed, eta);
      } else {
        get().updateProgress(item.id, -1, 0, 0);
      }
    }

    const blob = new Blob(chunks as BlobPart[]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.artist} - ${track.title}.${track.source === 'youtube' ? 'm4a' : 'mp3'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    get().markComplete(item.id);
  } catch (error: any) {
    const errMsg = error?.message || 'Download failed';
    const currentItem = get().queue.find((d) => d.id === item.id);
    if (currentItem && currentItem.status === 'paused') {
      // Do not retry or mark as failed if it was explicitly paused
      return;
    }
    if (currentItem && currentItem.retryCount < 3) {
      get().retry(item.id);
    } else {
      get().markFailed(item.id, errMsg);
    }
  }
}

// ─── Selectors (prevent unnecessary re-renders) ─────────────────────

export const selectActiveDownloads = (state: DownloadStore) =>
  state.queue.filter((d) => d.status === 'active');

export const selectQueuedDownloads = (state: DownloadStore) =>
  state.queue.filter((d) => d.status === 'queued');

export const selectCompletedDownloads = (state: DownloadStore) =>
  state.queue.filter((d) => d.status === 'completed');

export const selectFailedDownloads = (state: DownloadStore) =>
  state.queue.filter((d) => d.status === 'failed');

export const selectTotalProgress = (state: DownloadStore) => {
  const active = state.queue.filter((d) => d.status === 'active' || d.status === 'completed');
  if (active.length === 0) return 0;
  return Math.round(active.reduce((sum, d) => sum + d.progress, 0) / active.length);
};
