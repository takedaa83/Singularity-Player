import React, { useState, useEffect } from 'react';
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
  Music,
  Sparkles,
  Heart,
  PictureInPicture,
  Compass,
  Moon,
  Clock
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { togglePictureInPictureMiniPlayer } from '../../utils/miniPlayerPiP';
import { useSettingsStore } from '../../stores/settingsStore';
import { motion } from 'framer-motion';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { formatTimeDisplay } from '../../utils/formatDuration';
import { getSourceShortLabel } from '../../utils/sourceLabels';
import { MobileFullscreenPlayer } from '../player/MobileFullscreenPlayer';
import { api } from '../../utils/api';

interface PlayerBarProps {
  seek: (time: number) => void;
  showQueue: boolean;
  setShowQueue: (show: boolean) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  showEqualizer: boolean;
  setShowEqualizer: (show: boolean) => void;
}


// Sub-component for the top progress bar on desktop
const DesktopTopProgressBar: React.FC = () => {
  const { currentTime, duration } = usePlaybackTime();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-neutral-800">
      <div
        className="h-full bg-white transition-all duration-150 ease-linear"
        style={{ width: `${progressPercent}%` }}
      />
    </div>
  );
};

// Sub-component for the mobile floating mini-player progress bar
const MobileMiniProgressBar: React.FC = () => {
  const { currentTime, duration } = usePlaybackTime();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-white/10">
      <div 
        className="h-full transition-all duration-150 ease-linear"
        style={{ 
          width: `${progressPercent}%`,
          backgroundColor: 'var(--primary)',
        }}
      />
    </div>
  );
};

// Sub-component for the desktop main progress slider
interface DesktopProgressSliderProps {
  seek: (time: number) => void;
  disabled: boolean;
}

const DesktopProgressSlider: React.FC<DesktopProgressSliderProps> = ({ seek, disabled }) => {
  const { currentTime, duration } = usePlaybackTime();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverX(e.clientX - rect.left);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  return (
    <div className="w-full hidden sm:flex items-center gap-3 text-xs text-neutral-500 select-none">
      <div className="flex items-center gap-1.5 shrink-0 select-none">
        <span className="w-10 text-right font-mono">{formatTimeDisplay(currentTime)}</span>
        {!disabled && (
          <div className="flex items-end gap-[2px] h-3 w-3 px-[1px] mb-[2px]">
            <span
              className={`w-[2px] bg-[var(--primary)] rounded-t-full h-full ${isPlaying ? 'equalizer-bar-1' : ''}`}
              style={{ transform: isPlaying ? undefined : 'scaleY(0.3)', transformOrigin: 'bottom' }}
            />
            <span
              className={`w-[2px] bg-[var(--primary)] rounded-t-full h-full ${isPlaying ? 'equalizer-bar-2' : ''}`}
              style={{ transform: isPlaying ? undefined : 'scaleY(0.2)', transformOrigin: 'bottom', animationDelay: '0.15s' }}
            />
            <span
              className={`w-[2px] bg-[var(--primary)] rounded-t-full h-full ${isPlaying ? 'equalizer-bar-3' : ''}`}
              style={{ transform: isPlaying ? undefined : 'scaleY(0.4)', transformOrigin: 'bottom', animationDelay: '0.3s' }}
            />
          </div>
        )}
      </div>
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="flex-1 relative group flex items-center h-4 cursor-pointer"
      >
        {/* Floating Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-[10px] font-mono text-white pointer-events-none shadow-lg z-30 transition-opacity"
            style={{ left: `${hoverX}px` }}
          >
            {formatTimeDisplay(hoverTime)}
          </div>
        )}

        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleProgressBarChange}
          disabled={disabled}
          className="w-full h-1 rounded-full cursor-pointer group-hover:h-2 transition-all duration-75 appearance-none focus:outline-none relative z-10"
          style={{
            background: `linear-gradient(to right, var(--primary, #f59e0b) 0%, var(--primary, #f59e0b) ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%, rgba(255,255,255,0.15) 100%)`
          }}
        />
      </div>
      <span className="w-10 text-left font-mono">{formatTimeDisplay(duration)}</span>
    </div>
  );
};

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
  const smartShuffle = usePlayerStore((s) => s.smartShuffle || false);
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
  const sleepTimerMinutes = usePlayerStore((s) => s.sleepTimerMinutes);
  const sleepTimerEndTimestamp = usePlayerStore((s) => s.sleepTimerEndTimestamp);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);

  const [sleepTimeStr, setSleepTimeStr] = useState<string>('');

  useEffect(() => {
    if (!sleepTimerEndTimestamp) {
      setSleepTimeStr('');
      return;
    }
    const update = () => {
      const remainingSec = Math.max(0, Math.ceil((sleepTimerEndTimestamp - Date.now()) / 1000));
      setSleepTimeStr(formatTimeDisplay(remainingSec));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEndTimestamp]);

  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [isMobilePlayerOpen, setIsMobilePlayerOpen] = useState(false);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([]);
  const { toggleFavorite } = useLibraryDB();
  const favorites = usePlayerStore((s) => s.favorites || []);
  const isFavorite = currentTrack ? favorites.includes(currentTrack.id) : false;

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    try {
      const nextState = await toggleFavorite(currentTrack.id);
      if (nextState) {
        // Trigger Heart particles burst
        const newParticles = Array.from({ length: 6 }).map((_, i) => ({
          id: Math.random(),
          x: (Math.random() - 0.5) * 44,
          y: -10 - Math.random() * 35,
        }));
        setParticles(newParticles);
        setTimeout(() => setParticles([]), 1000);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handlePlayPause = () => {
    if (!currentTrack) return;
    setPlaying(!isPlaying);
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


  return (
    <>
      {/* Desktop Player Bar */}
      <footer 
        className="hidden sm:block glass-panel-strong shrink-0 z-30 text-white fixed bottom-4 right-4 rounded-2xl transition-all duration-300 overflow-hidden"
        style={{
          left: sidebarCollapsed ? '88px' : '256px',
        }}
      >
        <DesktopTopProgressBar />

        <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-4 sm:gap-6">
          {/* 1. Track Info Section */}
          <div className="w-1/4 min-w-0 flex items-center gap-3 sm:gap-4">
            {currentTrack ? (
              <>
                {/* Album Cover Art */}
                <div 
                  className={`w-12 h-12 sm:w-13 sm:h-13 rounded-xl overflow-hidden bg-neutral-900 border shrink-0 transition-all duration-500 ease-out relative group cursor-pointer ${
                    isPlaying 
                      ? 'translate-y-[-4px] scale-[1.06] border-white/20' 
                      : 'translate-y-0 scale-100 border-neutral-800 shadow-none'
                  }`}
                  style={{
                    boxShadow: isPlaying
                      ? '0 12px 28px -4px var(--ambient-primary, rgba(250,45,85,0.40)), 0 0 15px 1px rgba(255,255,255,0.05)'
                      : undefined,
                  }}
                >
                  {api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) ? (
                    <img 
                      src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)!} 
                      alt={currentTrack.title} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (currentTrack.videoId && target.src !== `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`) {
                          target.src = `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                      <Music className="w-5 h-5 text-neutral-600" />
                    </div>
                  )}
                </div>
                {/* Text details */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {currentTrack.title}
                    </span>
                    {isPlaying && (
                      <div className="inline-flex items-center gap-0.5 shrink-0">
                        <span className="w-0.5 h-3 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                        <span className="w-0.5 h-4.5 bg-primary rounded-full animate-bounce [animation-delay:0.3s]" />
                        <span className="w-0.5 h-2.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                      </div>
                    )}
                  </div>
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

                {/* Heart burst button */}
                <div className="relative flex items-center justify-center shrink-0 mr-1">
                  <button
                    onClick={handleFavoriteClick}
                    className="p-1.5 rounded-full hover:bg-white/5 text-neutral-500 hover:text-white transition-all active:scale-75 cursor-pointer"
                  >
                    <Heart
                      className={`w-5 h-5 transition-all duration-300 ${
                        isFavorite ? 'fill-pink-500 text-pink-500 scale-110' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    />
                  </button>
                  {particles.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      animate={{ opacity: 0, scale: 0.3, x: p.x, y: p.y }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="absolute pointer-events-none text-pink-500 z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    >
                      <Heart className="w-3.5 h-3.5 fill-current" />
                    </motion.div>
                  ))}
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
                className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:text-white hidden sm:flex ${
                  shuffle ? 'text-white' : smartShuffle ? 'text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'text-neutral-500'
                } disabled:opacity-30`}
                title={shuffle ? 'Standard Shuffle' : smartShuffle ? 'Smart Shuffle' : 'Shuffle'}
              >
                <Shuffle className="w-4 h-4" />
                {smartShuffle && <Sparkles className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-indigo-400 fill-indigo-400" />}
              </button>

              {/* Previous */}
              <button
                onClick={prevTrack}
                disabled={!currentTrack}
                className="p-1.5 rounded text-neutral-400 hover:text-white transition-colors disabled:opacity-30 active:scale-90"
                title="Previous (Shift + P)"
                aria-label="Previous track (Shift + P)"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* Play / Pause */}
              <button
                onClick={handlePlayPause}
                disabled={!currentTrack}
                className="p-3 rounded-full bg-white text-black hover:bg-neutral-200 transition-all active:scale-90 disabled:opacity-30"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause playback (Space)' : 'Play playback (Space)'}
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
                title="Next (Shift + N)"
                aria-label="Next track (Shift + N)"
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
                aria-label={`Repeat mode: ${repeat}`}
              >
                {repeat === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            <DesktopProgressSlider seek={seek} disabled={!currentTrack} />
          </div>

          {/* 3. Auxiliary Options Section */}
          <div className="w-1/4 flex items-center justify-end gap-2 sm:gap-3">
            {/* 3D Visualizer Quick Toggle */}
            <button
              onClick={() => {
                const currentVis = usePlayerStore.getState().activeVisualizer;
                usePlayerStore.getState().setActiveVisualizer(currentVis === 'off' ? '3d_tunnel' : 'off');
              }}
              disabled={!currentTrack}
              className="p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 hidden sm:block"
              title="3D Audio Visualizer"
            >
              <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-white" />
            </button>

            {/* Picture-in-Picture Mini Player Toggle */}
            <button
              onClick={() => togglePictureInPictureMiniPlayer()}
              disabled={!currentTrack}
              className="p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 hidden sm:block"
              title="Floating Mini-Player (PiP)"
            >
              <PictureInPicture className="w-4 h-4" />
            </button>

            {/* Audio Settings Popover (Speed & Equalizer) */}
            <div 
              className="relative hidden md:block"
              onMouseLeave={() => setShowSettingsPopover(false)}
            >
              <button
                onClick={() => setShowSettingsPopover(!showSettingsPopover)}
                disabled={!currentTrack}
                className={`p-1.5 rounded transition-colors hover:text-white hover:bg-neutral-800 ${
                  showSettingsPopover || playbackSpeed !== 1 || showEqualizer ? 'text-white bg-neutral-800' : 'text-neutral-500'
                } disabled:opacity-30`}
                title="Audio Settings"
              >
                <Sliders className="w-4 h-4" />
              </button>
              
              {showSettingsPopover && (
                <div className="absolute bottom-full right-0 mb-3 w-48 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden py-2 shadow-2xl z-50 flex flex-col gap-1 px-2 select-none">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold px-3 py-1">
                    Playback Options
                  </div>
                  
                  {/* Equalizer Toggle */}
                  <button
                    onClick={() => {
                      setShowEqualizer(!showEqualizer);
                      setShowSettingsPopover(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-neutral-800 ${
                      showEqualizer ? 'text-white font-semibold' : 'text-neutral-500'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5" /> Equalizer
                    </span>
                    {showEqualizer && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />}
                  </button>
                  
                  <div className="h-px bg-white/5 my-1" />
                  
                  {/* Speed Selector */}
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold px-3 py-1 flex justify-between items-center">
                    <span>Speed</span>
                    <span className="font-mono text-neutral-400">{playbackSpeed}x</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-1 mt-0.5">
                    {speedOptions.map(opt => (
                      <button
                        key={opt}
                        onClick={() => {
                          setPlaybackSpeed(opt);
                        }}
                        className={`py-1 rounded text-center text-[10px] font-mono transition-all duration-150 ${
                          playbackSpeed === opt 
                            ? 'bg-[var(--primary)] text-white font-bold shadow-[0_2px_8px_rgba(0,0,0,0.4)]' 
                            : 'hover:bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {opt}x
                      </button>
                    ))}
                  </div>

                  <div className="h-px bg-white/5 my-1" />

                  {/* Sleep Timer Selector */}
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold px-3 py-1 flex justify-between items-center">
                    <span className="flex items-center gap-1.5"><Moon className="w-3 h-3 text-amber-400" /> Sleep Timer</span>
                    {sleepTimeStr && <span className="font-mono text-amber-400 text-[10px]">{sleepTimeStr}</span>}
                  </div>
                  <div className="grid grid-cols-5 gap-1 px-1 mt-0.5">
                    {[
                      { label: 'Off', val: null },
                      { label: '15m', val: 15 },
                      { label: '30m', val: 30 },
                      { label: '45m', val: 45 },
                      { label: '60m', val: 60 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setSleepTimer(opt.val)}
                        className={`py-1 rounded text-center text-[10px] font-mono transition-all duration-150 ${
                          (opt.val === null && !sleepTimerMinutes) || sleepTimerMinutes === opt.val
                            ? 'bg-amber-500/30 text-amber-300 font-bold border border-amber-500/50'
                            : 'hover:bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active Sleep Timer Countdown Badge */}
            {sleepTimerEndTimestamp && (
              <button
                onClick={() => setSleepTimer(null)}
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono hover:bg-amber-500/30 transition-all shadow-sm"
                title="Click to cancel Sleep Timer"
              >
                <Moon className="w-3 h-3 text-amber-400 animate-pulse" />
                <span>{sleepTimeStr}</span>
              </button>
            )}

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

      {/* Mobile Floating Mini-Player */}
      <motion.div 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        dragDirectionLock
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -300) {
            nextTrack(true);
          } else if (info.offset.x > 60 || info.velocity.x > 300) {
            prevTrack();
          }
        }}
        style={{ touchAction: 'pan-y' }}
        onClick={() => setIsMobilePlayerOpen(true)}
        className="block sm:hidden fixed bottom-[calc(78px+env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-2xl glass-heavy border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.4)] active:scale-98 transition-all duration-200 cursor-pointer overflow-hidden"
      >
        <MobileMiniProgressBar />

        <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {currentTrack ? (
              <>
                <div className={`w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 border border-white/5 shrink-0 ${isPlaying ? 'now-playing-glow animate-pulse-glow' : ''}`}>
                  {api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) ? (
                    <img 
                      src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)!} 
                      alt={currentTrack.title} 
                      className="w-full h-full object-cover pointer-events-none"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (currentTrack.videoId && target.src !== `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`) {
                          target.src = `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                      <Music className="w-4 h-4 text-neutral-600" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1 select-none">
                  <span className="text-[12px] font-bold text-white truncate leading-tight">
                    {currentTrack.title}
                  </span>
                  <span className="text-[10px] text-neutral-400 truncate mt-0.5 leading-tight">
                    {currentTrack.artist}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-white/5 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-neutral-700" />
                </div>
                <span className="text-[11px] text-neutral-500 font-medium">Select a track to play</span>
              </>
            )}
          </div>

          <div 
            className="flex items-center gap-1 shrink-0" 
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
              disabled={!currentTrack}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black active:scale-90 transition-all disabled:opacity-40 shadow-sm"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4.5 h-4.5 fill-current" /> : <Play className="w-4.5 h-4.5 fill-current ml-0.5" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); nextTrack(true); }}
              disabled={!currentTrack}
              className="w-10 h-10 flex items-center justify-center rounded-full text-neutral-300 hover:text-white active:scale-90 transition-all disabled:opacity-30"
              aria-label="Next track"
            >
              <SkipForward className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Fullscreen Mobile Player Modal */}
      <MobileFullscreenPlayer
        isOpen={isMobilePlayerOpen}
        onClose={() => setIsMobilePlayerOpen(false)}
        seek={seek}
        showQueue={showQueue}
        setShowQueue={setShowQueue}
        showLyrics={showLyrics}
        setShowLyrics={setShowLyrics}
        showEqualizer={showEqualizer}
        setShowEqualizer={setShowEqualizer}
      />
    </>
  );
};
export default PlayerBar;
