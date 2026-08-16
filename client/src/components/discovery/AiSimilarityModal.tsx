import React, { useMemo } from 'react';
import { X, Sparkles, Disc, Activity, Play } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { classifyTrackMood } from '../../services/aiMoodClassifierService';
import { getAudioFeatures, getFeatureVector, cosineSimilarity } from '../../utils/musicMath';
import { api } from '../../utils/api';

interface AiSimilarityModalProps {
  onClose: () => void;
}

export const AiSimilarityModal: React.FC<AiSimilarityModalProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const mood = currentTrack ? classifyTrackMood(currentTrack) : 'Chill';

  // Compute real cosine similarity against queue tracks
  const rankedTracks = useMemo(() => {
    if (!currentTrack) return [];
    const sourceVec = getFeatureVector(getAudioFeatures(currentTrack));

    return queue
      .filter((t) => t.id !== currentTrack.id)
      .map((t) => {
        const targetVec = getFeatureVector(getAudioFeatures(t));
        const sim = cosineSimilarity(sourceVec, targetVec);
        return {
          track: t,
          similarity: Math.max(0.1, Math.min(0.99, sim))
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 6);
  }, [currentTrack, queue]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
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
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={api.coverUrl(currentTrack.coverArtUrl || (currentTrack as any).coverUrl, currentTrack.videoId) || '/icons.svg'}
                alt={currentTrack.title}
                className="w-12 h-12 rounded-lg object-cover border border-neutral-800"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate text-white">{currentTrack.title}</span>
                <span className="text-xs text-neutral-400 truncate">{currentTrack.artist}</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold shrink-0 ml-3">
              {mood}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Top Cosine Vector Matches</span>
          {rankedTracks.length > 0 ? (
            rankedTracks.map(({ track: t, similarity }) => (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-neutral-800/40 hover:bg-neutral-800/80 border border-neutral-800 flex justify-between items-center text-xs transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => playTrack(t)}
                    className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-black transition-colors shrink-0"
                    title="Play Track"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white truncate max-w-[220px]">{t.title}</span>
                    <span className="text-[11px] text-neutral-400 truncate max-w-[220px]">{t.artist}</span>
                  </div>
                </div>
                <span className="font-mono text-emerald-400 font-semibold shrink-0 ml-2">
                  {Math.round(similarity * 100)}% SIMILAR
                </span>
              </div>
            ))
          ) : (
            <p className="text-neutral-500 text-xs py-4 text-center font-mono">Queue more tracks to find similarity matches!</p>
          )}
        </div>
      </div>
    </div>
  );
};
