import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Music,
  Sparkles,
  Loader2
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
  showLyrics: boolean; // Retained for compatibility, but we use internal viewMode
  setShowLyrics: (show: boolean) => void;
  showEqualizer: boolean;
  setShowEqualizer: (show: boolean) => void;
}


interface MobileProgressSliderProps {
  seek: (time: number) => void;
}

const MobileProgressSlider: React.FC<MobileProgressSliderProps> = ({ seek }) => {
  const { currentTime, duration } = usePlaybackTime();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-2">
      <div className="relative group flex items-center h-4 w-full">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleProgressBarChange}
          className="w-full h-1.5 rounded-full cursor-pointer appearance-none focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-neutral-400 font-mono select-none px-0.5">
        <span>{formatTimeDisplay(currentTime)}</span>
        <span>{formatTimeDisplay(duration)}</span>
      </div>
    </div>
  );
};

interface LrcLine {
  time: number;
  text: string;
}

const parseLrc = (lrc: string): LrcLine[] => {
  const lines = lrc.split('\n');
  const parsed: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/;
  for (const line of lines) {
    const match = regex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      parsed.push({ time: minutes * 60 + seconds, text });
    }
  }
  return parsed;
};

export const MobileFullscreenPlayer: React.FC<MobileFullscreenPlayerProps> = ({
  isOpen,
  onClose,
  seek,
  showQueue,
  setShowQueue,
  showEqualizer,
  setShowEqualizer
}) => {
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

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'artwork' | 'lyrics'>('artwork');
  
  // Lyrics State
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>('');
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lastFetchedIdRef = useRef<string | null>(null);

  const { currentTime } = usePlaybackTime();

  // Reset view when closed
  useEffect(() => {
    if (!isOpen) {
      setViewMode('artwork');
    }
  }, [isOpen]);

  // Fetch Lyrics
  useEffect(() => {
    if (viewMode === 'lyrics' && currentTrack && lastFetchedIdRef.current !== currentTrack.id) {
      const fetchLyrics = async () => {
        setLoadingLyrics(true);
        setLyrics([]);
        setPlainLyrics('');
        lastFetchedIdRef.current = currentTrack.id;
        
        try {
          const params = new URLSearchParams({
            track: currentTrack.title,
            artist: currentTrack.artist,
          });
          if (currentTrack.album && currentTrack.album !== 'Single' && currentTrack.album !== 'YouTube') {
            params.set('album', currentTrack.album);
          }
          if (currentTrack.duration > 0) {
            params.set('duration', currentTrack.duration.toString());
          }
          const res = await fetch(`${api.baseUrl}/api/lyrics?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const rawSynced = data.syncedLyrics;
            const rawPlain = data.plainLyrics;

            if (rawSynced) {
              const parsed = parseLrc(rawSynced);
              if (parsed.length > 0) setLyrics(parsed);
              else setPlainLyrics(rawSynced.replace(/\[\d+:\d+\.\d+\]/g, ''));
            } else if (rawPlain) {
              const parsed = parseLrc(rawPlain);
              if (parsed.length > 0) setLyrics(parsed);
              else setPlainLyrics(rawPlain);
            }
          }
        } catch (e) {
          console.error("Failed to fetch lyrics", e);
        }
        setLoadingLyrics(false);
      };
      
      const manualLyrics = (currentTrack as any).lyrics;
      if (manualLyrics) {
        lastFetchedIdRef.current = currentTrack.id;
        const parsed = parseLrc(manualLyrics);
        if (parsed.length > 0) setLyrics(parsed);
        else setPlainLyrics(manualLyrics.replace(/\[\d+:\d+\.\d+\]/g, ''));
      } else {
        fetchLyrics();
      }
    }
  }, [viewMode, currentTrack]);

  // Active Line sync
  const activeLineIndex = useMemo(() => {
    if (lyrics.length === 0) return -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) return i;
    }
    return -1;
  }, [currentTime, lyrics]);

  // Auto scroll lyrics
  useEffect(() => {
    if (viewMode === 'lyrics' && activeLineIndex !== -1 && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.children[activeLineIndex + 1] as HTMLElement; // +1 due to top spacer
      if (activeEl) {
         activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLineIndex, viewMode]);

  if (!isOpen || !currentTrack) return null;

  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const handlePlayPause = () => {
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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 400) {
            onClose();
          }
        }}
        className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white overflow-hidden"
      >
        {/* Apple Music Style blurred dynamic art background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-out animate-rotate-ambient ${viewMode === 'lyrics' ? 'opacity-80 saturate-[1.5] scale-[1.1]' : 'opacity-60 saturate-200'} blur-[100px]`}
            style={{
              backgroundImage: api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) 
                ? `url(${api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)})` 
                : 'none',
              filter: `blur(${viewMode === 'lyrics' ? '80px' : '100px'}) brightness(${viewMode === 'lyrics' ? '0.35' : '0.2'})`,
            }}
          />
          {/* Subtle dark gradient overlay to guarantee text legibility */}
          <div className={`absolute inset-0 bg-gradient-to-b ${viewMode === 'lyrics' ? 'from-black/20 via-transparent to-black/60' : 'from-black/40 via-transparent to-black/80'}`} />
        </div>

        {/* Outer content container */}
        <div className="relative z-10 flex-1 flex flex-col px-6 py-6 overflow-hidden max-h-screen">
          
          {/* Header row */}
          <header className={`flex items-center w-full mb-2 ${viewMode === 'lyrics' ? 'justify-between' : 'justify-between shrink-0'}`}>
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-neutral-300 hover:text-white shrink-0"
              aria-label="Collapse player"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
            
            {viewMode === 'lyrics' ? (
               <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-1 items-center gap-3 overflow-hidden px-2 py-1">
                 {api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) ? (
                    <img src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId)!} alt={currentTrack.title} className="w-10 h-10 rounded-md object-cover shadow-lg" />
                 ) : (
                    <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center"><Music className="w-4 h-4 text-white/50" /></div>
                 )}
                 <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-bold truncate text-white leading-tight">{currentTrack.title}</span>
                    <span className="text-[11px] text-neutral-300 truncate mt-0.5">{currentTrack.artist}</span>
                 </div>
               </motion.div>
            ) : (
              <div className="flex flex-col items-center flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  Now Playing
                </span>
                <span className="text-[9px] font-mono text-neutral-500 mt-0.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                  {getSourceShortLabel(currentTrack.source)}
                </span>
              </div>
            )}

            {/* Playback speed toggle */}
            <div className="relative shrink-0">
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

          <div className="flex-1 flex flex-col justify-center overflow-hidden w-full relative">
             <AnimatePresence mode="wait">
               {viewMode === 'artwork' ? (
                 <motion.div
                    key="artwork"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex items-center justify-center w-full py-4 shrink-0 min-h-0"
                 >
                   <motion.div
                     animate={{ 
                       scale: isPlaying ? 1.0 : 0.88,
                       opacity: isPlaying ? 1 : 0.8
                     }}
                     transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                     className="w-full max-w-[320px] max-h-[320px] aspect-square rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-neutral-900 border border-white/10 relative"
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
                 </motion.div>
               ) : (
                 <motion.div
                    key="lyrics"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="flex-1 flex flex-col overflow-hidden relative w-full h-full -mx-2 px-2"
                 >
                    {loadingLyrics ? (
                       <div className="flex-1 flex items-center justify-center flex-col gap-3 text-white/50">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span className="text-xs font-semibold tracking-wider uppercase">Loading lyrics...</span>
                       </div>
                    ) : lyrics.length > 0 ? (
                       <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative px-2 fade-y-edges" ref={lyricsContainerRef}>
                          <div className="h-[20vh]" />
                          {lyrics.map((line, i) => {
                             const isActive = i === activeLineIndex;
                             const isPast = i < activeLineIndex;
                             return (
                               <div 
                                 key={i} 
                                 onClick={() => seek(line.time)} 
                                 className={`py-2 cursor-pointer transition-all duration-300 transform-gpu leading-snug tracking-tight ${
                                   isActive 
                                    ? 'text-white font-bold scale-105' 
                                    : 'text-white/40 font-medium hover:text-white/70'
                                 }`} 
                                 style={{ 
                                   filter: isActive ? 'blur(0)' : isPast ? 'blur(0.5px)' : 'blur(0px)', 
                                   fontSize: isActive ? '1.55rem' : '1.3rem',
                                   transformOrigin: 'left center'
                                 }}
                               >
                                 {line.text || "♪"}
                               </div>
                             )
                          })}
                          <div className="h-[40vh]" />
                       </div>
                    ) : plainLyrics ? (
                       <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-8 text-white/80 text-[1.1rem] leading-relaxed whitespace-pre-wrap font-medium fade-y-edges">
                          {plainLyrics}
                       </div>
                    ) : (
                       <div className="flex-1 flex flex-col items-center justify-center text-white/50 gap-4">
                          <Mic2 className="w-12 h-12 opacity-50" />
                          <p className="text-sm font-medium">No lyrics available</p>
                       </div>
                    )}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          {/* Metadata & Controls deck */}
          <div className="flex flex-col gap-3 w-full shrink-0">
            
            {/* Song Meta Details */}
            {viewMode === 'artwork' && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-start mt-2">
                 <div className="flex flex-col min-w-0 flex-1 pr-4">
                   <h2 className="text-[1.3rem] font-extrabold tracking-tight truncate text-white leading-tight">
                     {currentTrack.title}
                   </h2>
                   <p className="text-[15px] font-medium text-neutral-400 truncate mt-1">
                     {currentTrack.artist}
                   </p>
                 </div>
                 {/* Optional bitrate tag */}
                 {currentTrack.bitrate && (
                   <span className="shrink-0 px-2 py-0.5 mt-1 rounded bg-white/10 text-[9px] font-mono text-neutral-400 border border-white/5">
                     {currentTrack.bitrate}kbps
                   </span>
                 )}
               </motion.div>
            )}

            <MobileProgressSlider seek={seek} />

            {/* Main Playback Control Deck */}
            <div className={`flex items-center justify-between w-full transition-all duration-300 ${viewMode === 'lyrics' ? 'px-4' : 'px-2'}`}>
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`p-2 transition-all active:scale-90 flex items-center gap-0.5 ${
                  shuffle ? 'text-primary' : smartShuffle ? 'text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'text-neutral-400'
                }`}
                aria-label="Toggle Shuffle"
              >
                <Shuffle className="w-5 h-5" />
                {smartShuffle && <Sparkles className="w-2.5 h-2.5 text-indigo-400 fill-indigo-400" />}
              </button>

              {/* Skip Back */}
              <button
                onClick={prevTrack}
                className="p-2 text-white active:scale-80 transition-all"
                aria-label="Previous Track"
              >
                <SkipBack className="w-7 h-7 fill-white text-white" />
              </button>

              {/* Big Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                className="p-5 rounded-full bg-white text-black active:scale-90 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.2)] flex items-center justify-center hover:bg-neutral-100"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-black text-black" />
                ) : (
                  <Play className="w-8 h-8 fill-black text-black ml-1" />
                )}
              </button>

              {/* Skip Forward */}
              <button
                onClick={() => nextTrack(true)}
                className="p-2 text-white active:scale-80 transition-all"
                aria-label="Next Track"
              >
                <SkipForward className="w-7 h-7 fill-white text-white" />
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
            {viewMode === 'artwork' && (
               <div className="flex items-center gap-3 px-1 mt-1 w-full">
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
                   className="flex-1 h-1.5 rounded-full cursor-pointer appearance-none"
                   style={{
                     background: `linear-gradient(to right, #fff 0%, #fff ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%, rgba(255,255,255,0.15) 100%)`
                   }}
                 />
               </div>
            )}

            {/* Footer Auxiliary Buttons (Lyrics, Queue, Equalizer) */}
            <footer className="flex justify-between items-center px-4 pt-4 pb-2 mt-2 text-neutral-400 border-t border-white/5">
              {/* Lyrics Toggle */}
              <button
                onClick={() => {
                  setViewMode(viewMode === 'lyrics' ? 'artwork' : 'lyrics');
                }}
                className={`p-2 active:scale-90 transition-all rounded-lg flex items-center justify-center ${
                  viewMode === 'lyrics' ? 'text-primary bg-primary/10 drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' : 'hover:bg-white/5'
                }`}
                title="Toggle Lyrics"
              >
                <Mic2 className="w-5 h-5" />
              </button>

              {/* Play Queue */}
              <button
                onClick={() => {
                  setShowQueue(!showQueue);
                  onClose(); 
                }}
                className={`p-2 active:scale-90 transition-all rounded-lg hover:bg-white/5 flex items-center justify-center ${
                  showQueue ? 'text-primary' : ''
                }`}
                title="View Queue"
              >
                <ListMusic className="w-5 h-5" />
              </button>

              {/* Equalizer */}
              <button
                onClick={() => {
                  setShowEqualizer(!showEqualizer);
                }}
                className={`p-2 active:scale-90 transition-all rounded-lg hover:bg-white/5 flex items-center justify-center ${
                  showEqualizer ? 'text-primary' : ''
                }`}
                title="Equalizer"
              >
                <Sliders className="w-5 h-5" />
              </button>
            </footer>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
export default MobileFullscreenPlayer;
