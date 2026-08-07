import React from 'react';
import { X, Sparkles, Sliders, Check } from 'lucide-react';
import { MASTERING_PROFILES, calculateAiMasteringCurve } from '../../services/aiMasteringService';
import { usePlayerStore } from '../../stores/playerStore';

interface AiMasteringModalProps {
  onClose: () => void;
}

export const AiMasteringModal: React.FC<AiMasteringModalProps> = ({ onClose }) => {
  const equalizerBands = usePlayerStore((s) => s.equalizerBands);
  const setEqualizerBands = usePlayerStore((s) => s.setEqualizerBands);
  const [selectedProfile, setSelectedProfile] = React.useState<string>('warm_analog');

  const handleApplyProfile = (key: string) => {
    setSelectedProfile(key);
    const curve = calculateAiMasteringCurve(key);
    setEqualizerBands(curve);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close AI Mastering"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-indigo-400">
            <Sparkles className="w-5 h-5" /> AI Smart Auto-Mastering EQ
          </h2>
          <p className="text-xs text-neutral-400">Apply AI-calculated 10-band mastering curves for studio clarity.</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {Object.entries(MASTERING_PROFILES).map(([key, prof]) => {
            const isSelected = selectedProfile === key;
            return (
              <button
                key={key}
                onClick={() => handleApplyProfile(key)}
                className={`p-4 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-neutral-800/40 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">{prof.name}</span>
                  {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                </div>
                <p className="text-xs text-neutral-400">{prof.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
