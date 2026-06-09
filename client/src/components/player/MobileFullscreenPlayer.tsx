import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  ListMusic, 
  Mic2, 
  Sliders, 
  Gauge, 
  Volume2, 
  VolumeX,
  Music
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { formatTimeDisplay } from '../../utils/formatDuration';
import { getSourceShortLabel } from '../../utils/sourceLabels';
import { tokens } from '../../theme/muiTheme';
import { api } from '../../utils/api';

interface MobileFullscreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  seek: (time: number) => void;
  showQueue: boolean;
  setShowQueue: (show: boolean) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  showEqualizer: boolean;
  setShowEqualizer: (show: boolean) => void;
}

export const MobileFullscreenPlayer: React.FC<MobileFullscreenPlayerProps> = ({
  isOpen,
  onClose,
  seek,
  showQueue,
  setShowQueue,
  showLyrics,
  setShowLyrics,
  showEqualizer,
  setShowEqualizer
}) => {
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

  const { currentTime, duration } = usePlaybackTime();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  if (!isOpen || !currentTrack) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const handlePlayPause = () => {
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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white overflow-hidden"
      >
        {/* Apple Music Style blurred dynamic art background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out animate-rotate-ambient opacity-50"
            style={{
              backgroundImage: api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) 
                ? `url(${api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)})` 
                : 'none',
              filter: 'blur(100px) saturate(2.5) brightness(0.18)',
            }}
          />
          {/* Subtle dark gradient overlay to guarantee text legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
        </div>

        {/* Outer content container */}
        <div className="relative z-10 flex-1 flex flex-col justify-between px-6 py-6 overflow-y-auto no-scrollbar">
          
          {/* Header row */}
          <header className="flex justify-between items-center w-full">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-neutral-300 hover:text-white"
              aria-label="Collapse player"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Now Playing
              </span>
              <span className="text-[9px] font-mono text-neutral-500 mt-0.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                {getSourceShortLabel(currentTrack.source)}
              </span>
            </div>
            {/* Playback speed toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1 text-xs font-semibold font-mono ${
                  playbackSpeed !== 1 ? 'text-primary' : 'text-neutral-300'
                }`}
                title="Playback Speed"
              >
                <Gauge className="w-5 h-5" />
              </button>
              {showSpeedMenu && (
                <div className="absolute top-full right-0 mt-2 w-24 bg-neutral-900/90 backdrop-blur border border-white/10 rounded-xl overflow-hidden py-1 shadow-2xl z-50">
                  {speedOptions.map(opt => (
                    <button
                      key={opt}
                      onClick={() => {
                        setPlaybackSpeed(opt);
                        setShowSpeedMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-mono transition-colors hover:bg-white/10 ${
                        playbackSpeed === opt ? 'text-primary font-bold' : 'text-neutral-400'
                      }`}
                    >
                      {opt.toFixed(2)}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>

          {/* Large cover art block with active animations */}
          <div className="flex-1 flex items-center justify-center py-6">
            <motion.div
              animate={{ 
                scale: isPlaying ? 1.0 : 0.88,
                opacity: isPlaying ? 1 : 0.8
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 150 }}
              className="w-[75vw] h-[75vw] max-w-[320px] max-h-[320px] aspect-square rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-neutral-900 border border-white/10 relative"
            >
              {api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) ? (
                <img
                  src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)!}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (currentTrack.videoId && target.src !== `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`) {
                      target.src = `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                  <Music className="w-16 h-16 text-neutral-700" />
                </div>
              )}
            </motion.div>
          </div>

          {/* Metadata & Controls deck */}
          <div className="flex flex-col gap-5 w-full">
            
            {/* Song Meta Details */}
            <div className="flex justify-between items-start">
              <div className="flex flex-col min-w-0 flex-1 pr-4">
                <h2 className="text-xl font-bold tracking-tight truncate text-white">
                  {currentTrack.title}
                </h2>
                <p className="text-sm text-neutral-400 truncate mt-1">
                  {currentTrack.artist}
                </p>
              </div>
              {/* Optional bitrate tag */}
              {currentTrack.bitrate && (
                <span className="shrink-0 px-2 py-0.5 mt-1 rounded bg-white/10 text-[9px] font-mono text-neutral-400 border border-white/5">
                  {currentTrack.bitrate}kbps
                </span>
              )}
            </div>

            {/* Custom Interactive Progress Bar */}
            <div className="flex flex-col gap-2 w-full">
              <div className="relative group flex items-center h-4 w-full">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleProgressBarChange}
                  className="w-full h-1 rounded-full cursor-pointer appearance-none focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%, rgba(255,255,255,0.15) 100%)`
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono select-none px-0.5">
                <span>{formatTimeDisplay(currentTime)}</span>
                <span>{formatTimeDisplay(duration)}</span>
              </div>
            </div>

            {/* Main Playback Control Deck */}
            <div className="flex items-center justify-between px-2 w-full mt-2">
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`p-2 transition-colors active:scale-90 ${
                  shuffle ? 'text-primary' : 'text-neutral-400'
                }`}
                aria-label="Toggle Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              {/* Skip Back */}
              <button
                onClick={prevTrack}
                className="p-2 text-white active:scale-80 transition-all"
                aria-label="Previous Track"
              >
                <SkipBack className="w-6 h-6 fill-white text-white" />
              </button>

              {/* Big Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                className="p-5 rounded-full bg-white text-black active:scale-90 transition-all shadow-lg flex items-center justify-center hover:bg-neutral-100"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-black text-black" />
                ) : (
                  <Play className="w-7 h-7 fill-black text-black ml-1" />
                )}
              </button>

              {/* Skip Forward */}
              <button
                onClick={() => nextTrack(true)}
                className="p-2 text-white active:scale-80 transition-all"
                aria-label="Next Track"
              >
                <SkipForward className="w-6 h-6 fill-white text-white" />
              </button>

              {/* Repeat */}
              <button
                onClick={handleRepeatCycle}
                className={`p-2 transition-colors active:scale-90 ${
                  repeat !== 'off' ? 'text-primary' : 'text-neutral-400'
                }`}
                aria-label={`Toggle Repeat, currently ${repeat}`}
              >
                {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Volume Deck */}
            <div className="flex items-center gap-3 px-1 mt-1.5 w-full">
              <button
                onClick={toggleMute}
                className="text-neutral-400 active:text-white transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
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
                className="flex-1 h-1 rounded-full cursor-pointer appearance-none"
                style={{
                  background: `linear-gradient(to right, #fff 0%, #fff ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%, rgba(255,255,255,0.15) 100%)`
                }}
              />
            </div>

            {/* Footer Auxiliary Buttons (Lyrics, Queue, Equalizer) */}
            <footer className="flex justify-around items-center border-t border-white/5 pt-4 pb-2 mt-4 text-neutral-400">
              {/* Lyrics Panel */}
              <button
                onClick={() => {
                  setShowLyrics(!showLyrics);
                  onClose(); // Auto collapse player to view lyrics overlay
                }}
                className={`flex flex-col items-center gap-1 p-2 active:text-white transition-colors ${
                  showLyrics ? 'text-primary' : ''
                }`}
                title="View Lyrics"
              >
                <Mic2 className="w-5 h-5" />
                <span className="text-[9px] font-medium">Lyrics</span>
              </button>

              {/* Play Queue */}
              <button
                onClick={() => {
                  setShowQueue(!showQueue);
                  onClose(); // Auto collapse player to view queue overlay
                }}
                className={`flex flex-col items-center gap-1 p-2 active:text-white transition-colors ${
                  showQueue ? 'text-primary' : ''
                }`}
                title="View Queue"
              >
                <ListMusic className="w-5 h-5" />
                <span className="text-[9px] font-medium">Queue</span>
              </button>

              {/* Equalizer */}
              <button
                onClick={() => {
                  setShowEqualizer(!showEqualizer);
                }}
                className={`flex flex-col items-center gap-1 p-2 active:text-white transition-colors ${
                  showEqualizer ? 'text-primary' : ''
                }`}
                title="Equalizer"
              >
                <Sliders className="w-5 h-5" />
                <span className="text-[9px] font-medium">Equalizer</span>
              </button>
            </footer>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
export default MobileFullscreenPlayer;
