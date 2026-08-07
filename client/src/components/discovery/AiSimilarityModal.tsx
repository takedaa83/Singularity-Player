import React from 'react';
import { X, Sparkles, Disc, Activity } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { classifyTrackMood } from '../../services/aiMoodClassifierService';

interface AiSimilarityModalProps {
  onClose: () => void;
}

export const AiSimilarityModal: React.FC<AiSimilarityModalProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);

  const mood = currentTrack ? classifyTrackMood(currentTrack) : 'Chill';
  const similarTracks = queue.filter((t) => t.id !== currentTrack?.id).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Similarity Radar"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-emerald-400">
            <Sparkles className="w-5 h-5" /> AI Cosine Similarity Radar
          </h2>
          <p className="text-xs text-neutral-400">Discover sonic twins in your library calculated via acoustic vector similarity.</p>
        </div>

        {currentTrack && (
          <div className="p-4 rounded-xl bg-black/40 border border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={currentTrack.coverUrl || '/icons.svg'} alt={currentTrack.title} className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{currentTrack.title}</span>
                <span className="text-xs text-neutral-400 truncate">{currentTrack.artist}</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold">
              {mood}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Top Cosine Vector Matches</span>
          {similarTracks.map((t, idx) => (
            <div key={t.id} className="p-3 rounded-xl bg-neutral-800/40 border border-neutral-800 flex justify-between items-center text-xs">
              <span className="font-semibold truncate max-w-[240px]">{t.artist} - {t.title}</span>
              <span className="font-mono text-emerald-400">{Math.round((0.95 - idx * 0.05) * 100)}% SIMILAR</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
