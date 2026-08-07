import React, { useState } from 'react';
import { X, Mic, Sparkles, Activity, Check } from 'lucide-react';
import { aiPitchCorrectionService, PitchCorrectionConfig } from '../../services/aiPitchCorrectionService';

interface PitchHarmonizerModalProps {
  onClose: () => void;
}

export const PitchHarmonizerModal: React.FC<PitchHarmonizerModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<PitchCorrectionConfig>(aiPitchCorrectionService.getConfig());

  const handleToggle = () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    aiPitchCorrectionService.setConfig(updated);
  };

  const handleScaleChange = (scale: PitchCorrectionConfig['scale']) => {
    const updated = { ...config, scale };
    setConfig(updated);
    aiPitchCorrectionService.setConfig(updated);
  };

  const handleSpeedChange = (speed: number) => {
    const updated = { ...config, retuneSpeed: speed };
    setConfig(updated);
    aiPitchCorrectionService.setConfig(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Pitch Harmonizer"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-pink-400">
            <Mic className="w-5 h-5" /> AI Pitch Harmonizer & Auto-Tune
          </h2>
          <p className="text-xs text-neutral-400">Real-time Phase Vocoder pitch detection & key-scale snapping.</p>
        </div>

        {/* Master Enable Toggle */}
        <button
          onClick={handleToggle}
          className={`w-full p-4 rounded-xl border flex justify-between items-center transition-all ${
            config.enabled ? 'bg-pink-600/20 border-pink-500 text-pink-300' : 'bg-neutral-800/50 border-neutral-700 text-neutral-400'
          }`}
        >
          <span className="font-semibold text-sm">Auto-Tune Engine</span>
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-black/40">
            {config.enabled ? 'ACTIVE' : 'OFF'}
          </span>
        </button>

        {/* Scale Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Target Key Scale</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'chromatic', label: 'Chromatic (All Notes)' },
              { id: 'c_major', label: 'C Major / A Minor' },
              { id: 'g_major', label: 'G Major / E Minor' },
              { id: 'f_major', label: 'F Major / D Minor' },
            ].map((sc) => (
              <button
                key={sc.id}
                onClick={() => handleScaleChange(sc.id as PitchCorrectionConfig['scale'])}
                className={`p-3 rounded-xl border text-xs font-medium text-left flex justify-between items-center transition-all ${
                  config.scale === sc.id
                    ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                    : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <span>{sc.label}</span>
                {config.scale === sc.id && <Check className="w-4 h-4 text-pink-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Retune Speed Fader */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/40 border border-neutral-800">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Retune Speed (T-Pain Effect)</span>
            <span className="font-mono text-pink-300">{Math.round(config.retuneSpeed * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.retuneSpeed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>
      </div>
    </div>
  );
};
