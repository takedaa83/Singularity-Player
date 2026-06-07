import React, { useEffect, useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track, HistoryEntry } from '../../types';
import { TrackCard } from '../search/TrackCard';

interface HistoryViewProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

interface HistoryTrackEntry {
  track: Track;
  playedAt: number;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ refreshTrigger, triggerRefresh }) => {
  const [entries, setEntries] = useState<HistoryTrackEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { getPlaybackHistory, clearPlaybackHistory, getAllTracks } = useLibraryDB();

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const [history, tracks] = await Promise.all([
          getPlaybackHistory(),
          getAllTracks()
        ]);

        const trackMap = new Map(tracks.map(t => [t.id, t]));
        const historyEntries: HistoryTrackEntry[] = [];

        for (const entry of history) {
          const track = trackMap.get(entry.trackId);
          if (track) {
            historyEntries.push({ track, playedAt: entry.playedAt });
          }
        }

        setEntries(historyEntries);
      } catch (e) {
        console.error('Failed to load history:', e);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [refreshTrigger]);

  const handleClearHistory = async () => {
    if (confirm('Clear all playback history?')) {
      await clearPlaybackHistory();
      setEntries([]);
      triggerRefresh();
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex flex-col gap-6 text-white h-full overflow-y-auto pb-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-bold tracking-wide">Playback History</h2>
          </div>
          <p className="text-xs text-neutral-400">
            Your recently played tracks ({entries.length} entries)
          </p>
        </div>

        {entries.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-xs font-semibold text-neutral-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear History
          </button>
        )}
      </div>

      {/* History List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, idx) => (
            <div key={idx} className="h-16 w-full rounded-lg shimmer" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-violet-400" />
          </div>
          <h3 className="text-md font-bold mb-1">No History Yet</h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            Start playing tracks and they'll appear here. Your playback history helps you rediscover music you've enjoyed.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, idx) => (
            <div key={`${entry.track.id}-${entry.playedAt}-${idx}`} className="relative group">
              <TrackCard 
                track={entry.track} 
                refreshTrigger={triggerRefresh}
              />
              <span className="absolute top-3 right-3 text-[9px] text-neutral-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTimeAgo(entry.playedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default HistoryView;
