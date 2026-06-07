import React from 'react';
import { usePlayerStore } from '../../stores/playerStore';

const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
  Rock: [4, 3, -1, -2, -1, 1, 3, 4, 4, 3],
  Pop: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  Vocal: [-3, -2, 0, 3, 5, 5, 4, 2, 0, -2],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 3, 4, 5]
};

export const Equalizer: React.FC = () => {
  const { equalizerBands, setEqualizerBands } = usePlayerStore();
  const [activePreset, setActivePreset] = React.useState('Flat');

  const EQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

  const handleBandChange = (index: number, val: number) => {
    const updated = [...equalizerBands];
    updated[index] = val;
    setEqualizerBands(updated);
    setActivePreset('Custom');
  };

  const handlePresetSelect = (presetName: string) => {
    setActivePreset(presetName);
    if (PRESETS[presetName]) {
      setEqualizerBands(PRESETS[presetName]);
    }
  };

  const handleReset = () => {
    setActivePreset('Flat');
    setEqualizerBands(PRESETS['Flat']);
  };

  return (
    <div className="p-6 rounded-lg bg-neutral-900 border border-neutral-800 flex flex-col gap-6 text-white max-w-2xl w-full">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold tracking-wide">
            10-Band Equalizer
          </h3>
          <p className="text-xs text-neutral-400">Tweak audio frequencies to adjust sound</p>
        </div>
        <div className="flex gap-3">
          <select
            value={activePreset}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black border border-neutral-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white cursor-pointer"
          >
            {Object.keys(PRESETS).map(preset => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
            {activePreset === 'Custom' && <option value="Custom">Custom</option>}
          </select>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* EQ Sliders Grid */}
      <div className="grid grid-cols-10 gap-3 h-52 items-end pt-3">
        {equalizerBands.map((gain, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
            <span className="text-[10px] font-mono text-neutral-400">
              {gain > 0 ? `+${gain}` : gain}
            </span>
            <div className="relative w-4 h-36 flex justify-center bg-neutral-800 border border-neutral-700 rounded-full overflow-hidden">
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={gain}
                onChange={(e) => handleBandChange(idx, parseInt(e.target.value))}
                className="absolute w-32 h-4 origin-center rotate-270 -translate-y-16 cursor-pointer opacity-0"
                style={{ transform: 'rotate(-90deg) translateY(14px)', width: '130px' }}
              />
              {/* Fill indicator */}
              <div 
                className="absolute bottom-0 w-1.5 bg-white rounded-full transition-all duration-75"
                style={{ 
                  height: `${((gain + 12) / 24) * 100}%`,
                  opacity: gain === 0 ? 0.3 : 1
                }}
              />
            </div>
            <span className="text-[10px] font-medium text-neutral-500">{EQ_LABELS[idx]}</span>
          </div>
        ))}
      </div>
      
      <div className="text-[10px] text-neutral-600 text-center border-t border-neutral-800 pt-3">
        Frequency range: Sub-Bass (32Hz) to Presence (16kHz)
      </div>
    </div>
  );
};
export default Equalizer;
