import React, { useState, useEffect } from 'react';
import { X, Sparkles, Play, Plus, Check, Disc } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { generateAiSongSuggestions, AiTrackRecommendation } from '../../services/aiRecommendationService';

interface AiSongSuggestionsModalProps {
  onClose: () => void;
}

export const AiSongSuggestionsModal: React.FC<AiSongSuggestionsModalProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const [suggestions, setSuggestions] = useState<AiTrackRecommendation[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentTrack) {
      const results = generateAiSongSuggestions(currentTrack, queue, 8);
      setSuggestions(results);
    }
  }, [currentTrack, queue]);

  const handlePlayNow = (rec: AiTrackRecommendation) => {
    playTrack(rec.track);
  };

  const handleAddToQueue = (rec: AiTrackRecommendation) => {
    addToQueue(rec.track);
    setAddedIds(new Set(addedIds).add(rec.track.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-xl rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close AI Song Suggestions"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-purple-400">
            <Sparkles className="w-5 h-5" /> AI Song Recommendations
          </h2>
          <p className="text-xs text-neutral-400">Neural vector matching based on acoustic energy, genre affinity, and tempo.</p>
        </div>

        {currentTrack && (
          <div className="p-3.5 rounded-xl bg-black/40 border border-neutral-800 flex items-center gap-3">
            <img src={currentTrack.coverUrl || '/icons.svg'} alt={currentTrack.title} className="w-12 h-12 rounded-lg object-cover" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-neutral-400 font-mono uppercase tracking-wider">Seed Track</span>
              <span className="text-sm font-semibold truncate">{currentTrack.title}</span>
              <span className="text-xs text-neutral-400 truncate">{currentTrack.artist}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
          {suggestions.map((rec) => {
            const isAdded = addedIds.has(rec.track.id);
            return (
              <div
                key={rec.track.id}
                className="p-3 rounded-xl bg-neutral-800/40 border border-neutral-800 flex items-center justify-between gap-3 hover:bg-neutral-800/70 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img src={rec.track.coverUrl || '/icons.svg'} alt={rec.track.title} className="w-10 h-10 rounded-md object-cover" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold truncate">{rec.track.title}</span>
                    <span className="text-xs text-neutral-400 truncate">{rec.track.artist}</span>
                    <span className="text-[10px] text-purple-400 font-mono">{rec.reason}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-xs font-bold">
                    {rec.matchScore}% AI
                  </span>
                  <button
                    onClick={() => handlePlayNow(rec)}
                    className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    title="Play Now"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => handleAddToQueue(rec)}
                    className={`p-2 rounded-lg border transition-colors ${
                      isAdded ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white'
                    }`}
                    title="Add to Queue"
                  >
                    {isAdded ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
