import React, { useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Volume2, CloudRain, Wind, Waves, VolumeX } from 'lucide-react';
import { ambientSoundService, AmbientSoundType } from '../../services/ambientSoundService';
import { usePlayerStore } from '../../stores/playerStore';

interface FocusModeModalProps {
  onClose: () => void;
}

export const FocusModeModal: React.FC<FocusModeModalProps> = ({ onClose }) => {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeSound, setActiveSound] = useState<AmbientSoundType>('off');
  const [ambientVolume, setAmbientVolume] = useState(0.5);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setPlaying = usePlayerStore((s) => s.setPlaying);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        if (seconds > 0) {
          setSeconds(seconds - 1);
        } else if (minutes > 0) {
          setMinutes(minutes - 1);
          setSeconds(59);
        } else {
          setIsActive(false);
          ambientSoundService.stop();
          setPlaying(false);
          alert('🎉 Focus Session Completed! Take a well-deserved break.');
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, minutes, seconds, setPlaying]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setMinutes(25);
    setSeconds(0);
  };

  const handleSoundSelect = (sound: AmbientSoundType) => {
    setActiveSound(sound);
    ambientSoundService.setSound(sound);
  };

  const handleVolumeChange = (vol: number) => {
    setAmbientVolume(vol);
    ambientSoundService.setVolume(vol);
  };

  const handleClose = () => {
    ambientSoundService.stop();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Focus Mode"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-purple-400">
            🧠 Pomodoro Focus & Ambience
          </h2>
          <p className="text-xs text-neutral-400">Pair your music with ambient soundscapes and structured focus timers.</p>
        </div>

        {/* Timer Display */}
        <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-black/40 border border-neutral-800">
          <span className="font-mono text-6xl font-extrabold tracking-wider text-purple-300">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <div className="flex gap-4 mt-6">
            <button
              onClick={toggleTimer}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 font-semibold text-sm transition-all shadow-lg shadow-purple-600/30"
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isActive ? 'Pause' : 'Start Focus'}
            </button>
            <button
              onClick={resetTimer}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>

        {/* Ambient Soundscapes */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Ambient Background Soundscape</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'off', label: 'Off', icon: VolumeX },
              { id: 'rain', label: 'Rain', icon: CloudRain },
              { id: 'brown_noise', label: 'Deep Noise', icon: Wind },
              { id: 'waves', label: 'Ocean', icon: Waves }
            ].map((snd) => {
              const Icon = snd.icon;
              const isSelected = activeSound === snd.id;
              return (
                <button
                  key={snd.id}
                  onClick={() => handleSoundSelect(snd.id as AmbientSoundType)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {snd.label}
                </button>
              );
            })}
          </div>

          {activeSound !== 'off' && (
            <div className="flex items-center gap-3 mt-2 px-2">
              <Volume2 className="w-4 h-4 text-neutral-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ambientVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
