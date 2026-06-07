import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Shuffle, 
  Repeat, 
  Repeat1,
  Sliders, 
  ListMusic, 
  Mic2,
  Gauge,
  Music
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { formatTimeDisplay } from '../../utils/formatDuration';
import { getSourceShortLabel } from '../../utils/sourceLabels';

interface PlayerBarProps {
  seek: (time: number) => void;
  showQueue: boolean;
  setShowQueue: (show: boolean) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  showEqualizer: boolean;
  setShowEqualizer: (show: boolean) => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  seek,
  showQueue,
  setShowQueue,
  showLyrics,
  setShowLyrics,
  showEqualizer,
  setShowEqualizer
}) => {
  // Individual selectors — only re-renders when THIS specific value changes
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const setPlaybackSpeed = usePlayerStore((s) => s.setPlaybackSpeed);

  // Subscribe to time updates via external store (not React state)
  const { currentTime, duration } = usePlaybackTime();

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const formatTime = formatTimeDisplay;

  const handlePlayPause = () => {
    if (!currentTrack) return;
    setPlaying(!isPlaying);
  };

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
  };

  const handleRepeatCycle = () => {
    if (repeat === 'off') setRepeat('all');
    else if (repeat === 'all') setRepeat('one');
    else setRepeat('off');
  };

  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const getSourceBadge = () => {
    if (!currentTrack) return '';
    return getSourceShortLabel(currentTrack.source);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="glass-heavy border-t border-white/5 shrink-0 z-30 text-white relative">
      {/* Mobile-friendly progress bar at the very top of the player bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-neutral-800">
        <div
          className="h-full bg-white transition-all duration-150 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-4 sm:gap-6">
        {/* 1. Track Info Section */}
        <div className="w-1/4 min-w-0 flex items-center gap-3 sm:gap-4">
          {currentTrack ? (
            <>
              {/* Album Cover Art */}
              <div className={`w-12 h-12 sm:w-13 sm:h-13 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 ${isPlaying ? 'now-playing-glow' : ''}`}>
                {currentTrack.coverArtUrl ? (
                  <img 
                    src={currentTrack.coverArtUrl} 
                    alt={currentTrack.title} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                    <Music className="w-5 h-5 text-neutral-600" />
                  </div>
                )}
              </div>
              {/* Text details */}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">
                  {currentTrack.title}
                </span>
                <span className="text-xs text-neutral-500 truncate mt-0.5">
                  {currentTrack.artist}
                </span>
                {/* Source badge — hidden on small screens */}
                <div className="hidden sm:flex gap-1.5 mt-1">
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] font-mono text-neutral-400 border border-neutral-700">
                    {getSourceBadge()}
                  </span>
                  {currentTrack.bitrate && (
                    <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] font-mono text-neutral-500 border border-neutral-700">
                      {currentTrack.bitrate}kbps
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <Music className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-neutral-600">Select a track to play</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Audio Control Section */}
        <div className="flex-1 max-w-2xl flex flex-col items-center gap-2">
          {/* Buttons Row */}
          <div className="flex items-center gap-3 sm:gap-5">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              disabled={!currentTrack}
              className={`p-1.5 rounded transition-colors hover:text-white hidden sm:block ${
                shuffle ? 'text-white' : 'text-neutral-500'
              } disabled:opacity-30`}
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Previous */}
            <button
              onClick={prevTrack}
              disabled={!currentTrack}
              className="p-1.5 rounded text-neutral-400 hover:text-white transition-colors disabled:opacity-30 active:scale-90"
              title="Previous"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlayPause}
              disabled={!currentTrack}
              className="p-3 rounded-full bg-white text-black hover:bg-neutral-200 transition-all active:scale-90 disabled:opacity-30"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-black text-black" />
              ) : (
                <Play className="w-5 h-5 fill-black text-black ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={() => nextTrack(true)}
              disabled={!currentTrack}
              className="p-1.5 rounded text-neutral-400 hover:text-white transition-colors disabled:opacity-30 active:scale-90"
              title="Next"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Repeat */}
            <button
              onClick={handleRepeatCycle}
              disabled={!currentTrack}
              className={`p-1.5 rounded transition-colors hover:text-white hidden sm:block ${
                repeat !== 'off' ? 'text-white' : 'text-neutral-500'
              } disabled:opacity-30`}
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Progress Slider - hidden on very small screens (we show thin bar at top instead) */}
          <div className="w-full hidden sm:flex items-center gap-3 text-xs text-neutral-500 select-none">
            <span className="w-10 text-right font-mono">{formatTime(currentTime)}</span>
            <div className="flex-1 relative group flex items-center h-4">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleProgressBarChange}
                disabled={!currentTrack}
                className="w-full h-0.5 rounded-full cursor-pointer hover:h-1 transition-all duration-75 appearance-none focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #fff 0%, #fff ${progressPercent}%, #333 ${progressPercent}%, #333 100%)`
                }}
              />
            </div>
            <span className="w-10 text-left font-mono">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 3. Auxiliary Options Section */}
        <div className="w-1/4 flex items-center justify-end gap-2 sm:gap-3">
          {/* Speed menu — hidden on mobile */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              disabled={!currentTrack}
              className={`p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 flex items-center gap-1 text-[11px] font-semibold font-mono ${
                playbackSpeed !== 1 ? 'text-white' : 'text-neutral-500'
              }`}
              title="Playback Speed"
            >
              <Gauge className="w-4 h-4" />
              <span>{playbackSpeed}x</span>
            </button>
            
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-3 w-24 bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden py-1 shadow-lg z-50">
                {speedOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => {
                      setPlaybackSpeed(opt);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs font-mono transition-colors hover:bg-neutral-800 ${
                      playbackSpeed === opt ? 'text-white font-bold' : 'text-neutral-500'
                    }`}
                  >
                    {opt.toFixed(2)}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Equalizer toggle — hidden on mobile */}
          <button
            onClick={() => setShowEqualizer(!showEqualizer)}
            className={`p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 hidden md:block ${
              showEqualizer ? 'text-white bg-neutral-800' : 'text-neutral-500'
            }`}
            title="Equalizer"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Lyrics */}
          <button
            onClick={() => setShowLyrics(!showLyrics)}
            className={`p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 ${
              showLyrics ? 'text-white bg-neutral-800' : 'text-neutral-500'
            }`}
            title="Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </button>

          {/* Queue */}
          <button
            onClick={() => setShowQueue(!showQueue)}
            className={`p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 ${
              showQueue ? 'text-white bg-neutral-800' : 'text-neutral-500'
            }`}
            title="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Divider — hidden on mobile */}
          <div className="w-px h-5 bg-neutral-800 hidden md:block" />

          {/* Volume controls — hidden on mobile */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded text-neutral-500 hover:text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-0.5 rounded-full cursor-pointer appearance-none hover:h-1 transition-all duration-75"
              style={{
                background: `linear-gradient(to right, #fff 0%, #fff ${volume * 100}%, #333 ${volume * 100}%, #333 100%)`
              }}
            />
          </div>
        </div>
      </div>
    </footer>
  );
};
export default PlayerBar;
