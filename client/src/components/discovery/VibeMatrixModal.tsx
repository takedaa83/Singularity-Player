import React, { useState, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { Compass, Flame, Music, Sparkles, X, Play } from 'lucide-react';
import { api } from '../../utils/api';

interface VibeMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VibeMatrixModal: React.FC<VibeMatrixModalProps> = ({ isOpen, onClose }) => {
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // -1.0 to 1.0
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setVibeMatrixCoords = usePlayerStore((s) => s.setVibeMatrixCoords);

  if (!isOpen) return null;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width; // 0 to 1
    const rawY = (e.clientY - rect.top) / rect.height; // 0 to 1

    const x = Math.max(-1, Math.min(1, rawX * 2 - 1));
    const y = Math.max(-1, Math.min(1, -(rawY * 2 - 1))); // Invert Y so top is positive

    setCoords({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  };

  const handleGenerateVibeQueue = async () => {
    setIsGenerating(true);
    setVibeMatrixCoords(coords);

    try {
      // Formulate search query based on quadrant
      let vibeQuery = 'chill relaxing music';
      if (coords.x > 0 && coords.y > 0) vibeQuery = 'electronic dance hype party';
      else if (coords.x < 0 && coords.y > 0) vibeQuery = 'acoustic indie folk acoustic';
      else if (coords.x > 0 && coords.y < 0) vibeQuery = 'heavy bass rock rap hype';
      else if (coords.x < 0 && coords.y < 0) vibeQuery = 'lofi hip hop deep focus study';

      const results = await api.searchYouTube(vibeQuery);
      if (results && results.length > 0) {
        const mapped = results.map((item) => ({
          id: `yt-${item.videoId}`,
          title: item.title,
          artist: item.artist,
          album: item.album || 'Single',
          genre: '',
          year: null,
          trackNumber: null,
          duration: item.duration || 0,
          bitrate: item.bitrate || null,
          sampleRate: null,
          fileSize: 0,
          mimeType: 'audio/mp4',
          coverArtUrl: item.coverArtUrl || null,
          source: 'youtube' as const,
          streamUrl: item.streamUrl || `/api/yt/stream/${item.videoId}`,
          filePath: null,
          addedAt: Date.now(),
          videoId: item.videoId,
        }));

        playTrack(mapped[0], mapped);
        onClose();
      }
    } catch (err) {
      console.error('[Vibe Matrix Error]:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const getQuadrantLabel = () => {
    if (coords.x > 0.2 && coords.y > 0.2) return '🔥 Electronic / Hype Party';
    if (coords.x < -0.2 && coords.y > 0.2) return '🌿 Acoustic / Organic Warmth';
    if (coords.x > 0.2 && coords.y < -0.2) return '⚡ High-Energy Bass / Rap';
    if (coords.x < -0.2 && coords.y < -0.2) return '☕ Deep Focus / Lo-Fi Study';
    return '☯ Balanced Everyday Mix';
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xl w-full shadow-2xl relative flex flex-col space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Interactive Vibe Matrix</h2>
              <p className="text-xs text-slate-400">Drag cursor to dial in your exact audio mood</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2D Quadrant Canvas Container */}
        <div
          ref={canvasRef}
          onPointerDown={handlePointerMove}
          onPointerMove={handlePointerMove}
          className="relative w-full aspect-square rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 cursor-crosshair overflow-hidden shadow-inner select-none"
        >
          {/* Axis Grid Lines */}
          <div className="absolute inset-x-0 top-1/2 border-b border-slate-800/80 border-dashed" />
          <div className="absolute inset-y-0 left-1/2 border-r border-slate-800/80 border-dashed" />

          {/* Quadrant Corner Labels */}
          <div className="absolute top-3 left-3 text-[11px] font-semibold text-emerald-400/70 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/30">
            🌿 Acoustic Organic
          </div>
          <div className="absolute top-3 right-3 text-[11px] font-semibold text-pink-400/70 bg-pink-950/40 px-2.5 py-1 rounded-lg border border-pink-800/30">
            ⚡ Electronic Hype
          </div>
          <div className="absolute bottom-3 left-3 text-[11px] font-semibold text-cyan-400/70 bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-800/30">
            ☕ Lo-Fi / Deep Focus
          </div>
          <div className="absolute bottom-3 right-3 text-[11px] font-semibold text-purple-400/70 bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-800/30">
            🔥 Heavy Bass / Hype
          </div>

          {/* Glowing Target Handle */}
          <div
            className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 border-2 border-white shadow-xl shadow-purple-500/50 flex items-center justify-center transition-all duration-75 pointer-events-none"
            style={{
              left: `${((coords.x + 1) / 2) * 100}%`,
              top: `${(( -coords.y + 1) / 2) * 100}%`,
            }}
          >
            <div className="w-2 h-2 rounded-full bg-white animate-ping" />
          </div>
        </div>

        {/* Selected Mood Badge & Generate Button */}
        <div className="flex items-center justify-between bg-slate-950 p-4 rounded-2xl border border-slate-800">
          <div>
            <div className="text-xs text-slate-400 font-mono">Current Coordinates: ({coords.x}, {coords.y})</div>
            <div className="text-sm font-bold text-white mt-0.5">{getQuadrantLabel()}</div>
          </div>

          <button
            onClick={handleGenerateVibeQueue}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-500/25 flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            <span>{isGenerating ? 'Generating...' : 'Launch Vibe Queue'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
