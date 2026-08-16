/**
 * 10/10+ World-Class Singularity AI Playlist Studio Modal
 * Interactive Studio UI featuring Conversational Playlist Refinement, Per-Track Song Locking (🔒),
 * DJ Transition Flow Diagrams, Statistical Confidence Bars, and Similarity Graph Launcher.
 */

import React, { useState } from 'react';
import { X, Sparkles, Play, Plus, Check, Sliders, Activity, Zap, RefreshCw, BookmarkPlus, Info, Compass, Lock, Unlock, Network, ArrowRight } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useToast } from '../../hooks/useToast';
import { api } from '../../utils/api';
import {
  aiPlaylistStudioService,
  PlaylistMode,
  EnergyCurveType,
  GeneratedAiPlaylist,
  PlaylistTrackRecommendation
} from '../../services/aiPlaylistStudioService';

interface AiPlaylistStudioModalProps {
  onClose: () => void;
  onPlaylistSaved?: () => void;
  onOpenSimilarityGraph?: () => void;
}

export const AiPlaylistStudioModal: React.FC<AiPlaylistStudioModalProps> = ({
  onClose,
  onPlaylistSaved,
  onOpenSimilarityGraph
}) => {
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const { savePlaylist, saveTracksBulk } = useLibraryDB();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState('Late-night rainy lo-fi beats with smooth saxophone');
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [mode, setMode] = useState<PlaylistMode>('perfect_flow');
  const [energyCurve, setEnergyCurve] = useState<EnergyCurveType>('arc');
  const [trackCount, setTrackCount] = useState<number>(15);
  const [discoveryLevel, setDiscoveryLevel] = useState<number>(0.4);

  const [selectedTrackBreakdown, setSelectedTrackBreakdown] = useState<PlaylistTrackRecommendation | null>(null);

  const [generatedPlaylist, setGeneratedPlaylist] = useState<GeneratedAiPlaylist | null>(() =>
    aiPlaylistStudioService.generatePlaylist(queue, {
      prompt: 'Late-night rainy lo-fi beats with smooth saxophone',
      mode: 'perfect_flow',
      energyCurve: 'arc',
      trackCount: 15,
      discoveryLevel: 0.4,
      artistSpacingMinGap: 2
    })
  );

  const [isSaved, setIsSaved] = useState(false);

  const handleGenerate = () => {
    const result = aiPlaylistStudioService.generatePlaylist(queue, {
      prompt,
      mode,
      energyCurve,
      trackCount,
      discoveryLevel,
      artistSpacingMinGap: 2
    });
    setGeneratedPlaylist(result);
    setIsSaved(false);
  };

  const handleRefine = () => {
    if (!generatedPlaylist || !refinementPrompt.trim()) return;
    const refined = aiPlaylistStudioService.refinePlaylist(generatedPlaylist, refinementPrompt, queue);
    setGeneratedPlaylist(refined);
    setRefinementPrompt('');
  };

  const handleToggleTrackLock = (trackId: string) => {
    if (!generatedPlaylist) return;
    const updatedTracks = generatedPlaylist.tracks.map((t) =>
      t.track.id === trackId ? { ...t, locked: !t.locked } : t
    );
    setGeneratedPlaylist({ ...generatedPlaylist, tracks: updatedTracks });
  };

  const handleSaveToLibrary = async () => {
    if (!generatedPlaylist) return;
    try {
      const playlistId = `ai-playlist-${Date.now()}`;
      const playlistTracks = generatedPlaylist.tracks.map(t => t.track);
      
      await saveTracksBulk(playlistTracks);
      await savePlaylist({
        id: playlistId,
        name: generatedPlaylist.title,
        description: generatedPlaylist.description,
        coverUrl: null,
        trackIds: playlistTracks.map(t => t.id),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setIsSaved(true);
      toast(`Saved "${generatedPlaylist.title}" to your library!`, 'success');
      if (onPlaylistSaved) onPlaylistSaved();
    } catch (err) {
      console.error('[AiPlaylistStudio] Failed to save playlist:', err);
      toast('Failed to save playlist to library', 'error');
    }
  };

  const handlePlayFirst = () => {
    if (generatedPlaylist && generatedPlaylist.tracks.length > 0) {
      playTrack(generatedPlaylist.tracks[0].track);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] rounded-2xl bg-neutral-900/95 border border-neutral-800 text-white shadow-2xl overflow-hidden flex flex-col glass-card">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Singularity AI Playlist Studio
              </h2>
              <p className="text-xs text-neutral-400">Conversational Refinement • Per-Track Locking 🔒 • DJ Flow Diagrams • Statistical Confidence.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSimilarityGraph && (
              <button
                onClick={onOpenSimilarityGraph}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-all"
              >
                <Network className="w-3.5 h-3.5" /> Similarity Graph
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
              aria-label="Close AI Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 8 Mode Selector Navigation Tabs */}
        <div className="px-6 py-2.5 bg-black/40 border-b border-neutral-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'perfect_flow', label: '🎧 Perfect Flow' },
            { id: 'workout', label: '🏋 Workout' },
            { id: 'focus', label: '📚 Deep Focus' },
            { id: 'sleep', label: '🌙 Sleep & Ambient' },
            { id: 'road_trip', label: '🚗 Road Trip' },
            { id: 'gaming', label: '🎮 Gaming Hype' },
            { id: 'emotional', label: '❤️ Emotional Journey' },
            { id: 'cinematic', label: '🎬 Cinematic' }
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id as PlaylistMode); handleGenerate(); }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition-all ${
                mode === m.id
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Controls Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* Prompt Textarea */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Natural Language Vibe Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="Describe atmosphere, mood, or scene..."
                className="w-full p-3 rounded-xl bg-black/50 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
              />
            </div>

            {/* Conversational Playlist Refinement Input */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Conversational Refinement
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  placeholder="e.g., Make it more energetic, Remove vocals..."
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
                <button
                  onClick={handleRefine}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shrink-0 transition-all"
                >
                  Refine
                </button>
              </div>
            </div>

            {/* Interactive Discovery Slider */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-neutral-800 flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400 flex items-center gap-1.5"><Compass className="w-3.5 h-3.5 text-amber-400" /> Discovery Exploration</span>
                <span className="font-mono text-amber-400 font-bold">{Math.round(discoveryLevel * 100)}% {discoveryLevel > 0.5 ? 'Adventurous' : 'Safe'}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={discoveryLevel}
                onChange={(e) => setDiscoveryLevel(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Track Count Slider */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-neutral-800 flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Target Track Count</span>
                <span className="font-mono text-amber-400 font-bold">{trackCount} Tracks</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="5"
                value={trackCount}
                onChange={(e) => setTrackCount(parseInt(e.target.value))}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Synthesize Button */}
            <button
              onClick={handleGenerate}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Regenerate Playlist
            </button>
          </div>

          {/* Right Results & Health Column (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-neutral-800/80 pt-5 lg:pt-0 lg:pl-6">
            {generatedPlaylist && (
              <>
                {/* Playlist Summary & Statistical Confidence Bar */}
                <div className="p-4 rounded-xl bg-black/50 border border-neutral-800 flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow-md"
                      dangerouslySetInnerHTML={{ __html: generatedPlaylist.coverSvg }}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Mode: {mode.replace('_', ' ')}</span>
                      <h3 className="text-base font-bold text-white truncate">{generatedPlaylist.title}</h3>
                      <p className="text-xs text-neutral-400 truncate">{generatedPlaylist.description}</p>

                      {/* Statistical Confidence Score Indicator Bar */}
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">
                          Confidence {generatedPlaylist.health.confidenceScore}%
                        </span>
                        <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${generatedPlaylist.health.confidenceScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Track Preview List with Per-Track Locking (🔒) & DJ Transition Diagram */}
                <div className="flex-1 flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex justify-between items-center">
                    <span>Curated Track Sequence ({generatedPlaylist.tracks.length})</span>
                    <span className="text-[10px] text-neutral-500 font-mono">🔒 Click lock to keep track fixed</span>
                  </span>
                  {generatedPlaylist.tracks.map((rec, idx) => (
                    <div
                      key={rec.track.id}
                      className={`p-2.5 rounded-xl border flex flex-col gap-2 transition-all ${
                        rec.locked ? 'bg-amber-500/10 border-amber-500/50' : 'bg-neutral-800/40 border-neutral-800 hover:bg-neutral-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => handleToggleTrackLock(rec.track.id)}
                            className="p-1 rounded text-neutral-400 hover:text-amber-400 transition-colors"
                            title={rec.locked ? 'Unlock Track' : 'Lock Track'}
                          >
                            {rec.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <span className="w-4 text-center font-mono text-neutral-500 text-[11px]">{idx + 1}</span>
                          <img src={api.coverUrl(rec.track.coverArtUrl || (rec.track as any).coverUrl, rec.track.videoId) || '/icons.svg'} alt={rec.track.title} className="w-8 h-8 rounded object-cover" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate">{rec.track.title}</span>
                            <span className="text-[10px] text-neutral-400 truncate">{rec.track.artist}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded bg-black/40 border border-neutral-800 text-[10px] font-mono text-amber-300">
                            {rec.camelotCode}
                          </span>
                          <span className="font-mono text-emerald-400 font-bold text-[11px]">{rec.matchScore}% Match</span>
                          <button onClick={() => setSelectedTrackBreakdown(selectedTrackBreakdown?.track.id === rec.track.id ? null : rec)}>
                            <Info className="w-3.5 h-3.5 text-neutral-400 hover:text-white transition-colors" />
                          </button>
                        </div>
                      </div>

                      {/* DJ Transition Flow Diagram & Score Breakdown Popover */}
                      {selectedTrackBreakdown?.track.id === rec.track.id && (
                        <div className="p-3 rounded-lg bg-black/70 border border-neutral-800 text-[10px] font-mono text-neutral-300 flex flex-col gap-2 animate-fade-in">
                          {rec.nextTransition && (
                            <div className="p-2 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-between text-cyan-300">
                              <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 text-cyan-400" /> DJ Transition Flow:</span>
                              <span>{rec.nextTransition.camelotTransition} | BPM +{rec.nextTransition.bpmDelta}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <span>Mood Fit: <strong className="text-amber-400">+{rec.breakdown.moodFit}%</strong></span>
                            <span>Energy Arc: <strong className="text-amber-400">+{rec.breakdown.energyFit}%</strong></span>
                            <span>Camelot Key: <strong className="text-indigo-400">+{rec.breakdown.harmonicFit}%</strong></span>
                            <span>BPM Alignment: <strong className="text-indigo-400">+{rec.breakdown.bpmDelta}%</strong></span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save & Play Controls */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handlePlayFirst}
                    className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-current" /> Play AI Playlist
                  </button>

                  <button
                    onClick={handleSaveToLibrary}
                    className={`py-3 px-5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      isSaved
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                        : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                    }`}
                  >
                    {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : <BookmarkPlus className="w-4 h-4" />}
                    {isSaved ? 'Saved to Library' : 'Save Playlist'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
