import React, { useState } from 'react';
import { X, Mic, Disc, Sliders, Music, Zap } from 'lucide-react';
import { stemSeparatorService, StemGains } from '../../services/stemSeparatorService';
import { usePlayerStore } from '../../stores/playerStore';

interface StemSeparatorModalProps {
  onClose: () => void;
}

export const StemSeparatorModal: React.FC<StemSeparatorModalProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [gains, setGains] = useState<StemGains>(stemSeparatorService.getStemGains());

  const handleGainChange = (stem: keyof StemGains, val: number) => {
    const updated = { ...gains, [stem]: val };
    setGains(updated);
    stemSeparatorService.setStemGains(updated);
  };

  const handleKaraokeMode = () => {
    const karaokeGains = { vocals: 0.0, drums: 1.0, bass: 1.0, melody: 1.0 };
    setGains(karaokeGains);
    stemSeparatorService.setStemGains(karaokeGains);
  };

  const handleReset = () => {
    const defaultGains = { vocals: 1.0, drums: 1.0, bass: 1.0, melody: 1.0 };
    setGains(defaultGains);
    stemSeparatorService.setStemGains(defaultGains);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Stem Separator"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-purple-400">
            <Sliders className="w-5 h-5" /> AI Real-Time Stem Separator
          </h2>
          <p className="text-xs text-neutral-400">Isolate or mute Vocals, Drums, Bass, and Instruments independently.</p>
        </div>

        {currentTrack && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-neutral-800">
            <img src={currentTrack.coverUrl || '/icons.svg'} alt={currentTrack.title} className="w-12 h-12 rounded-lg object-cover" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">{currentTrack.title}</span>
              <span className="text-xs text-neutral-400 truncate">{currentTrack.artist}</span>
            </div>
          </div>
        )}

        {/* Stem Gain Faders */}
        <div className="grid grid-cols-4 gap-4 py-2">
          {[
            { key: 'vocals', label: 'Vocals', icon: Mic, color: 'accent-pink-500' },
            { key: 'drums', label: 'Drums', icon: Disc, color: 'accent-amber-500' },
            { key: 'bass', label: 'Bass', icon: Zap, color: 'accent-purple-500' },
            { key: 'melody', label: 'Melody', icon: Music, color: 'accent-cyan-500' }
          ].map((stem) => {
            const Icon = stem.icon;
            const val = gains[stem.key as keyof StemGains];
            return (
              <div key={stem.key} className="flex flex-col items-center gap-3 p-3 rounded-xl bg-neutral-800/40 border border-neutral-800">
                <Icon className="w-5 h-5 text-neutral-300" />
                <span className="text-xs font-semibold">{stem.label}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={val}
                  onChange={(e) => handleGainChange(stem.key as keyof StemGains, parseFloat(e.target.value))}
                  className={`w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer ${stem.color}`}
                />
                <span className="text-[10px] font-mono text-neutral-400">{Math.round(val * 100)}%</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleKaraokeMode}
            className="flex-1 py-2.5 rounded-xl bg-purple-600/30 border border-purple-500/50 hover:bg-purple-600/40 text-purple-300 text-xs font-bold transition-all"
          >
            🎤 Instant Karaoke (Mute Vocals)
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};
