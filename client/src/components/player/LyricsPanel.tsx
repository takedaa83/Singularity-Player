import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Mic2, Save, Edit3, X, Loader2, Music, RefreshCw, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { tokens } from '../../theme/muiTheme';
import { api } from '../../utils/api';
import { Box, IconButton, Tooltip, Typography, Slider, Divider } from '@mui/material';

interface LyricsPanelProps {
  onClose: () => void;
}

interface LrcLine {
  time: number; // seconds
  text: string;
}

function parseLRC(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const raw of lrc.split('\n')) {
    const match = raw.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, '0'), 10);
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const { saveTrack } = useLibraryDB();
  const { currentTime } = usePlaybackTime();
  const { seek } = useAudioEngine();

  const [syncedLines, setSyncedLines] = useState<LrcLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLyrics, setHasLyrics] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(16); // px

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const fullLyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const activeFullLineRef = useRef<HTMLDivElement>(null);
  const lastTrackIdRef = useRef<string | null>(null);

  // Find the active line index based on current playback time
  const activeLineIndex = useMemo(() => {
    if (syncedLines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i].time <= currentTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [syncedLines, currentTime]);

  // Auto-scroll to active line in side-panel
  useEffect(() => {
    if (!isFullscreen && activeLineRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const activeLine = activeLineRef.current;
      const containerHeight = container.clientHeight;
      const lineTop = activeLine.offsetTop;
      const lineHeight = activeLine.clientHeight;
      const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [activeLineIndex, isFullscreen]);

  // Auto-scroll to active line in full-screen
  useEffect(() => {
    if (isFullscreen && activeFullLineRef.current && fullLyricsContainerRef.current) {
      const container = fullLyricsContainerRef.current;
      const activeLine = activeFullLineRef.current;
      const containerHeight = container.clientHeight;
      const lineTop = activeLine.offsetTop;
      const lineHeight = activeLine.clientHeight;
      const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [activeLineIndex, isFullscreen]);

  // Fetch lyrics when track changes
  const fetchLyrics = useCallback(async () => {
    if (!currentTrack) return;
    if (lastTrackIdRef.current === currentTrack.id) return;
    lastTrackIdRef.current = currentTrack.id;

    setSyncedLines([]);
    setPlainLyrics('');
    setHasLyrics(false);
    setFetchError(false);
    setIsEditing(false);
    setLoading(true);

    const manualLyrics = (currentTrack as any).lyrics;
    if (manualLyrics) {
      setPlainLyrics(manualLyrics);
      setHasLyrics(true);
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        track: currentTrack.title,
        artist: currentTrack.artist,
      });
      if (currentTrack.album && currentTrack.album !== 'Single') {
        params.set('album', currentTrack.album);
      }
      if (currentTrack.duration > 0) {
        params.set('duration', currentTrack.duration.toString());
      }

      const res = await fetch(`${api.baseUrl}/api/lyrics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          if (parsed.length > 0) {
            setSyncedLines(parsed);
            setHasLyrics(true);
          }
        }
        if (data.plainLyrics) {
          setPlainLyrics(data.plainLyrics);
          setHasLyrics(true);
        }
      } else {
        setFetchError(true);
      }
    } catch (e) {
      console.error('Lyrics fetch error:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    fetchLyrics();
  }, [fetchLyrics]);

  const handleRetry = () => {
    lastTrackIdRef.current = null;
    fetchLyrics();
  };

  const handleStartEdit = () => {
    setEditText(plainLyrics);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, lyrics: editText };
    await saveTrack(updatedTrack);
    usePlayerStore.setState({ currentTrack: updatedTrack });
    setPlainLyrics(editText);
    setHasLyrics(!!editText);
    setIsEditing(false);
  };

  const handleLineClick = (time: number) => {
    seek(time);
  };

  return (
    <>
      {/* Side-Panel View Mode */}
      {!isFullscreen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-80 h-full glass-heavy flex flex-col py-6 px-4 text-white shrink-0 z-40 border-l border-white/10"
        >
          <div className="flex flex-col gap-5 h-full overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center px-2 shrink-0">
              <div className="flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-white" />
                <h3 className="text-sm font-semibold tracking-wide">Lyrics</h3>
                {syncedLines.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                    Synced
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconButton onClick={() => setIsFullscreen(true)} size="small" sx={{ color: 'neutral.400' }} title="Full Screen View">
                  <Maximize2 size={14} />
                </IconButton>
                <IconButton onClick={onClose} size="small" sx={{ color: 'neutral.400' }}>
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            {currentTrack ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden pt-2">
                {/* Song Meta */}
                <div className="px-2 shrink-0">
                  <h4 className="text-xs font-semibold truncate">{currentTrack.title}</h4>
                  <p className="text-[10px] text-neutral-400 truncate mt-0.5">{currentTrack.artist}</p>
                </div>

                {/* Loading State */}
                {loading && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                    <span className="text-xs text-neutral-500">Searching for lyrics...</span>
                  </div>
                )}

                {/* Editor Mode */}
                {isEditing && !loading && (
                  <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-fade-in">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="Paste or write lyrics here..."
                      className="w-full flex-1 p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-700 text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none font-sans leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-medium text-xs transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Synced Lyrics Display */}
                {!loading && !isEditing && syncedLines.length > 0 && (
                  <div
                    ref={lyricsContainerRef}
                    className="flex-1 overflow-y-auto px-2 scroll-smooth"
                  >
                    <div className="h-32" />
                    {syncedLines.map((line, idx) => (
                      <div
                        key={idx}
                        ref={idx === activeLineIndex ? activeLineRef : undefined}
                        onClick={() => handleLineClick(line.time)}
                        className={`lyrics-line py-2.5 px-2 cursor-pointer rounded-lg transition-all duration-300 ${
                          idx === activeLineIndex
                            ? 'active text-white text-base font-bold bg-white/5 shadow-sm'
                            : 'text-neutral-400 hover:text-white text-sm font-medium opacity-60'
                        }`}
                        style={{ fontSize: idx === activeLineIndex ? `${fontSize}px` : `${fontSize - 2}px` }}
                      >
                        {line.text}
                      </div>
                    ))}
                    <div className="h-40" />
                  </div>
                )}

                {/* Plain Lyrics Display (no sync) */}
                {!loading && !isEditing && syncedLines.length === 0 && hasLyrics && plainLyrics && (
                  <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-2 text-[13px] leading-[1.8] text-neutral-300 font-sans whitespace-pre-wrap">
                      {plainLyrics}
                    </div>
                    <button
                      onClick={handleStartEdit}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700 font-semibold text-xs transition-colors shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Lyrics
                    </button>
                  </div>
                )}

                {/* No Lyrics Found State */}
                {!loading && !isEditing && !hasLyrics && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-4 animate-fade-in">
                    <div className="w-14 h-14 rounded-full bg-neutral-800/60 border border-neutral-700 flex items-center justify-center">
                      <Music className="w-7 h-7 text-neutral-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-400 mb-1">No lyrics found</p>
                      <p className="text-[10px] text-neutral-600 leading-relaxed">
                        We couldn't find lyrics for this track. You can add them manually or try again.
                      </p>
                    </div>
                    <div className="flex gap-2 w-full">
                      {fetchError && (
                        <button
                          onClick={handleRetry}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-medium transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                      <button
                        onClick={handleStartEdit}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-medium transition-all"
                      >
                        <Edit3 className="w-3 h-3" />
                        Add Manually
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center py-20 text-xs text-neutral-500 italic animate-fade-in">
                Select a track to view lyrics
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Full-Screen Immersive Karaoke Mode */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
          >
            {/* Immersive blurred cover art backdrop */}
            {currentTrack?.coverArtUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{
                  backgroundImage: `url(${currentTrack.coverArtUrl})`,
                  filter: 'blur(90px) saturate(1.8) brightness(0.2)',
                  transform: 'scale(1.2)',
                }}
              />
            )}

            {/* Header / controls bar */}
            <div className="relative z-10 flex justify-between items-center px-8 py-6 border-b border-white/5 backdrop-blur-md bg-black/30">
              <div className="flex items-center gap-4">
                {currentTrack?.coverArtUrl && (
                  <img
                    src={currentTrack.coverArtUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover shadow-lg"
                  />
                )}
                <div>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{currentTrack?.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'neutral.400' }}>{currentTrack?.artist}</Typography>
                </div>
              </div>

              {/* Central Font Size Controls */}
              <div className="flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                <IconButton onClick={() => setFontSize(prev => Math.max(12, prev - 2))} size="small" sx={{ color: 'white' }}>
                  <ZoomOut size={16} />
                </IconButton>
                <Typography variant="caption" sx={{ color: 'neutral.300', fontWeight: 600, minWidth: 40, textAlign: 'center' }}>
                  {fontSize}px
                </Typography>
                <IconButton onClick={() => setFontSize(prev => Math.min(32, prev + 2))} size="small" sx={{ color: 'white' }}>
                  <ZoomIn size={16} />
                </IconButton>
              </div>

              <div className="flex items-center gap-2">
                <IconButton onClick={() => setIsFullscreen(false)} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                  <Minimize2 size={18} />
                </IconButton>
                <IconButton onClick={() => { setIsFullscreen(false); onClose(); }} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                  <X size={18} />
                </IconButton>
              </div>
            </div>

            {/* Large-scale Sync Lyrics Scrolling */}
            <div
              ref={fullLyricsContainerRef}
              className="relative z-10 flex-1 overflow-y-auto px-6 md:px-24 py-10 scroll-smooth mask-fade-gradient bg-transparent"
            >
              <div className="h-64" />
              {syncedLines.length > 0 ? (
                syncedLines.map((line, idx) => {
                  const isActive = idx === activeLineIndex;
                  return (
                    <motion.div
                      key={idx}
                      ref={isActive ? activeFullLineRef : undefined}
                      onClick={() => handleLineClick(line.time)}
                      className={`py-4 px-6 rounded-2xl cursor-pointer transition-all duration-300 text-center select-none ${
                        isActive
                          ? 'text-white font-extrabold bg-white/10 shadow-lg scale-105 border border-white/15'
                          : 'text-neutral-400 font-bold opacity-30 hover:opacity-75 hover:scale-[1.01]'
                      }`}
                      style={{ fontSize: isActive ? `${fontSize + 8}px` : `${fontSize + 2}px`, lineHeight: 1.4 }}
                    >
                      {line.text}
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center text-neutral-400 font-semibold mt-20">
                  {loading ? 'Fetching lyrics...' : plainLyrics || 'No synced lyrics available for this track.'}
                </div>
              )}
              <div className="h-80" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LyricsPanel;
