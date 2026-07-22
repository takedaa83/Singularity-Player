import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(ScrollTrigger, TextPlugin);
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Button,
  LinearProgress,
} from '@mui/material';
import { alpha } from '../../theme/muiTheme';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipPrevious as SkipPreviousIcon,
  SkipNext as SkipNextIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  Equalizer as EqualizerIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon,
  LibraryMusic as LibraryIcon,
  MusicNote as MusicNoteIcon,
  Favorite as FavoriteIcon,
  QueueMusic as QueueMusicIcon,
  AccessTime as AccessTimeIcon,
  Explore as ExploreIcon,
  PlayCircle as PlayCircleIcon,
  FitnessCenter as FitnessCenterIcon,
  SelfImprovement as SelfImprovementIcon,
  Spa as SpaIcon,
  Celebration as CelebrationIcon,
  NightsStay as NightsStayIcon,
  ChevronLeft as ChevronLeft,
  ChevronRight as ChevronRight,
} from '@mui/icons-material';
import { tokens } from '../../theme/muiTheme';
import { formatDuration } from '../../utils/formatDuration';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useRecommendationStore } from '../../stores/recommendationStore';
import { recommendationEngine } from '../../services/recommendationEngine';
import { Track } from '../../types';
import { useToast } from '../../hooks/useToast';
import { PlaylistGenerator, VibeType, VIBE_CONFIGS } from '../../services/playlistGenerator';
import { useDownloadStore } from '../../stores/downloadStore';
import { useBatchStore } from '../../stores/batchStore';
import { TrackContextMenu } from '../ui/TrackContextMenu';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { AudioVisualizer } from '../player/AudioVisualizer';

// ─── Props ────────────────────────────────────────────────────────────

interface HomePageProps {
  onNavigate: (view: string) => void;
  onSearchFocus: () => void;
  onUploadClick: () => void;
  onShowEqualizer: () => void;
  onSearch?: (query: string) => void;
}

// ─── Animation Variants ───────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const statCardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

const trackCardVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.05, duration: 0.4 },
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Good Night \u{1F319}';
  if (h < 12) return 'Good Morning \u{2615}';
  if (h < 17) return 'Good Afternoon \u{2600}';
  if (h < 21) return 'Good Evening \u{1F305}';
  return 'Good Night \u{1F319}';
}

// ─── Genre Definitions ────────────────────────────────────────────────

const GENRES: { name: string; gradient: string }[] = [
  { name: 'Pop', gradient: `linear-gradient(135deg, ${tokens.colors.accent.pink}, ${tokens.colors.accent.violet})` },
  { name: 'Rock', gradient: `linear-gradient(135deg, ${tokens.colors.accent.red}, ${tokens.colors.accent.amber})` },
  { name: 'Electronic', gradient: `linear-gradient(135deg, ${tokens.colors.accent.cyan}, ${tokens.colors.accent.blue})` },
  { name: 'Hip-Hop', gradient: `linear-gradient(135deg, ${tokens.colors.accent.amber}, ${tokens.colors.accent.red})` },
  { name: 'Classical', gradient: `linear-gradient(135deg, ${tokens.colors.primaryDark}, ${tokens.colors.accent.pink})` },
  { name: 'Jazz', gradient: `linear-gradient(135deg, ${tokens.colors.accent.emerald}, ${tokens.colors.accent.cyan})` },
  { name: 'R&B', gradient: `linear-gradient(135deg, ${tokens.colors.accent.violet}, ${tokens.colors.accent.pink})` },
  { name: 'Indie', gradient: `linear-gradient(135deg, ${tokens.colors.accent.blue}, ${tokens.colors.accent.emerald})` },
];

// ─── Quick Actions ────────────────────────────────────────────────────

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  gradient: string;
  onClick: () => void;
}

// ─── Track Scroll Row ─────────────────────────────────────────────────

interface TrackScrollRowProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
}

export const TrackScrollRowItem: React.FC<{
  track: Track;
  idx: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  hoveredTrackId: string | null;
  setHoveredTrackId: (id: string | null) => void;
}> = React.memo(({ track, idx, currentTrack, isPlaying, onPlay, hoveredTrackId, setHoveredTrackId }) => {
  const navigate = useNavigate();
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const playNext = usePlayerStore(state => state.playNext);
  const favorites = usePlayerStore(state => state.favorites);
  const { toggleFavorite } = useLibraryDB();
  const { toast } = useToast();
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{ top: number; left: number } | null>(null);

  const isActive = currentTrack?.id === track.id;
  const liked = favorites?.includes(track.id) || false;

  const hoverTimeoutRef = useRef<any>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleMouseEnter = () => {
    setHoveredTrackId(track.id);

    // If a track is already playing in the app, do not overlay preview audio
    if (isPlaying) return;

    const rawUrl = track.streamUrl;
    const streamUrl = rawUrl 
      ? (rawUrl.startsWith('http') ? rawUrl : `${api.baseUrl}${rawUrl}`) 
      : (track.videoId ? `${api.baseUrl}/api/yt/stream/${track.videoId}` : null);

    if (!streamUrl) return;

    hoverTimeoutRef.current = setTimeout(() => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = new Audio(streamUrl);
      audio.volume = 0.15;
      previewAudioRef.current = audio;
      audio.play().catch(e => {
        if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
          console.warn('Preview audio playback failed or was interrupted:', e);
        }
      });
    }, 600);
  };

  const handleMouseLeave = () => {
    setHoveredTrackId(null);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ top: e.clientY, left: e.clientX });
  };

  const handleFavoriteClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const nextState = await toggleFavorite(track.id);
      toast(nextState ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleCreateSimilarPlaylist = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      toast(`Generating song radio for "${track.title}"...`, 'info');
      const similarTracks = await PlaylistGenerator.generateSimilarTracks(track);
      
      if (similarTracks && similarTracks.length > 0) {
        usePlayerStore.getState().setQueue(similarTracks, 0);
        toast(`Playing "${track.title}" Radio! (${similarTracks.length} tracks)`, 'success');
      } else {
        toast('Could not find similar tracks.', 'error');
      }
    } catch (err) {
      console.error('Failed to generate similar queue:', err);
      toast('Failed to generate similar queue', 'error');
    }
  };

  return (
    <motion.div
      custom={idx}
      variants={trackCardVariants}
      initial="hidden"
      animate="show"
    >
      <Box
        component="button"
        className="gsap-tilt"
        onClick={() => onPlay(track)}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          flexShrink: 0,
          scrollSnapAlign: 'start',
          width: 180,
          p: `${tokens.spacing.md}px`,
          borderRadius: `${tokens.radius.xl}px`,
          bgcolor: tokens.colors.surface,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          position: 'relative',
          overflow: 'hidden',
          '&:hover': {
            bgcolor: tokens.colors.surfaceVariant,
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            '& .play-overlay': { opacity: 1, transform: 'scale(1) translateY(0)' },
            '& .track-cover-img': { transform: 'scale(1.05)' },
          },
        }}
      >
        {/* Cover art */}
        <Box
          sx={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: `${tokens.radius.lg}px`,
            overflow: 'hidden',
            bgcolor: tokens.colors.surfaceElevated,
            mb: `${tokens.spacing.sm}px`,
            position: 'relative',
          }}
        >
          {api.coverUrl(track.coverArtUrl, track.videoId) ? (
            <Box
              component="img"
              src={api.coverUrl(track.coverArtUrl, track.videoId)!}
              alt={`${track.title} cover`}
              loading="lazy"
              className="track-cover-img"
              onError={(e: any) => {
                const target = e.currentTarget;
                if (track.videoId && target.src !== `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`) {
                  target.src = `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
                }
              }}
              sx={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                transition: 'transform 0.4s ease',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MusicNoteIcon sx={{ fontSize: 32, color: tokens.colors.textTertiary }} />
            </Box>
          )}
          {/* Active playing indicator with real Web Audio frequency bars */}
          {isActive && isPlaying && (
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                left: 8,
                bgcolor: 'rgba(0,0,0,0.75)',
                px: 1,
                py: 0.5,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                zIndex: 3,
              }}
            >
              <RealAudioBars color={tokens.colors.primary} />
            </Box>
          )}
          <Box
            className="play-overlay"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: tokens.colors.primary,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isActive ? 1 : 0,
              transform: isActive ? 'scale(1) translateY(0)' : 'scale(0.6) translateY(8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              zIndex: 2,
              '&:hover': {
                transform: 'scale(1.1) !important',
                bgcolor: tokens.colors.primaryLight,
              }
            }}
          >
            {isActive && isPlaying ? (
              <PauseIcon sx={{ fontSize: 22, color: '#fff' }} />
            ) : (
              <PlayArrowIcon sx={{ fontSize: 22, color: '#fff', ml: 0.2 }} />
            )}
          </Box>
        </Box>
        <Typography
          variant="body2"
          noWrap
          sx={{ 
            fontWeight: 700, 
            color: isActive ? tokens.colors.primary : tokens.colors.textPrimary,
            fontSize: 12.5,
          }}
        >
          {track.title}
        </Typography>
        <Typography 
          variant="caption" 
          noWrap 
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/artist/${encodeURIComponent(track.artist)}`);
          }}
          sx={{ 
            color: tokens.colors.textSecondary,
            display: 'block',
            mt: 0.5,
            width: 'fit-content',
            fontSize: 10.5,
            '&:hover': { 
              color: tokens.colors.primaryLight,
              textDecoration: 'underline'
            } 
          }}
        >
          {track.artist}
        </Typography>
      </Box>
      <TrackContextMenu
        track={track}
        anchorPosition={contextMenuPosition}
        onClose={() => setContextMenuPosition(null)}
        onPlay={() => onPlay(track)}
        onAddToQueue={() => { addToQueue(track); toast('Added to queue', 'info'); }}
        onPlayNext={() => { playNext(track); toast('Will play next', 'info'); }}
        onToggleFavorite={handleFavoriteClick}
        onDownload={async () => {
          try {
            useDownloadStore.getState().enqueue(track);
            toast('Added to download queue', 'info');
          } catch (err) {
            console.error('Download enqueue failed:', err);
          }
        }}
        onAddToBatch={() => {
          useBatchStore.getState().addTrack(track);
          toast('Added to Batch Packager', 'success');
        }}
        onGoToArtist={() => navigate(`/artist/${encodeURIComponent(track.artist)}`)}
        onGoToAlbum={() => navigate(`/album/${encodeURIComponent(track.album)}?artist=${encodeURIComponent(track.artist)}`)}
        isFavorite={liked}
        onCreateSimilarPlaylist={handleCreateSimilarPlaylist}
      />
    </motion.div>
  );
});
TrackScrollRowItem.displayName = 'TrackScrollRowItem';

const RealAudioBars: React.FC<{ color?: string }> = ({ color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { getAnalyser } = useAudioEngine();

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const analyser = getAnalyser();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color || 'var(--primary, #f59e0b)';

      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const b1 = Math.max(0.2, (dataArray[2] || 0) / 255);
        const b2 = Math.max(0.2, (dataArray[8] || 0) / 255);
        const b3 = Math.max(0.2, (dataArray[16] || 0) / 255);

        const barWidth = 3;
        const gap = 2;

        ctx.fillRect(0, canvas.height * (1 - b1), barWidth, canvas.height * b1);
        ctx.fillRect(barWidth + gap, canvas.height * (1 - b2), barWidth, canvas.height * b2);
        ctx.fillRect((barWidth + gap) * 2, canvas.height * (1 - b3), barWidth, canvas.height * b3);
      } else {
        ctx.fillRect(0, canvas.height - 4, 3, 4);
        ctx.fillRect(5, canvas.height - 10, 3, 10);
        ctx.fillRect(10, canvas.height - 6, 3, 6);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [getAnalyser, color]);

  return <canvas ref={canvasRef} width={13} height={14} className="inline-block shrink-0 ml-1.5" />;
};

interface QuickPlayGridItemProps {
  item: any;
  idx: number;
  featured?: boolean;
  handlePlayQuickItem: (item: any) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}

const QuickPlayGridItem: React.FC<QuickPlayGridItemProps> = ({
  item,
  idx,
  handlePlayQuickItem,
}) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isCurrentPlaying = item.type === 'track' && currentTrack?.id === item.track.id;
  const isCurrentlyActive = isCurrentPlaying && isPlaying;

  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (item.type === 'track') {
      setContextMenu({ mouseX: e.clientX - 2, mouseY: e.clientY - 4 });
    }
  };

  return (
    <motion.div
      key={item.id}
      custom={idx}
      variants={trackCardVariants}
      initial="hidden"
      animate="show"
    >
      <Box
        onClick={() => handlePlayQuickItem(item)}
        onContextMenu={handleContextMenu}
        className="gsap-tilt group"
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 64,
          bgcolor: tokens.colors.surface,
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          position: 'relative',
          border: isCurrentlyActive ? '1px solid rgba(var(--primary-rgb), 0.6)' : '1px solid var(--border-subtle)',
          boxShadow: isCurrentlyActive ? '0 0 20px rgba(var(--primary-rgb), 0.25)' : 'none',
          '&:hover': {
            bgcolor: 'var(--surface-hover)',
            transform: 'translateY(-2px)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            '& .quick-play-btn': {
              opacity: 1,
              transform: 'scale(1)',
            }
          },
          '&:active': {
            transform: 'scale(0.98)',
          }
        }}
      >
        {/* Left Artwork Thumbnail */}
        <Box
          sx={{
            width: 64,
            height: 64,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {item.type === 'favorites' ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(135deg, #450af5 0%, #c427fb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FavoriteIcon sx={{ color: '#fff', fontSize: 26 }} />
            </Box>
          ) : item.type === 'vibe' ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                background: item.gradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MusicNoteIcon sx={{ color: '#fff', fontSize: 26 }} />
            </Box>
          ) : item.image ? (
            <Box
              component="img"
              src={item.image}
              alt={item.title}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRight: '1px solid rgba(var(--primary-rgb), 0.25)',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                bgcolor: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MusicNoteIcon sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 24 }} />
            </Box>
          )}
        </Box>

        {/* Title & Subtitle */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, px: 2 }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <Typography
              variant="body2"
              noWrap
              sx={{
                fontWeight: 800,
                color: isCurrentlyActive ? tokens.colors.primary : '#fff',
                fontSize: 13,
                fontFamily: tokens.fontFamily,
              }}
            >
              {item.title}
            </Typography>
            {isCurrentlyActive && <RealAudioBars color={tokens.colors.primary} />}
          </div>
          {item.subtitle && (
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 11,
                fontFamily: tokens.fontFamily,
                mt: 0.25,
              }}
            >
              {item.subtitle}
            </Typography>
          )}
        </Box>

        {/* Floating Green Spotify-Style Play Button on Hover */}
        <Box
          className="quick-play-btn"
          sx={{
            opacity: isCurrentlyActive ? 1 : 0,
            transform: isCurrentlyActive ? 'scale(1)' : 'scale(0.7)',
            width: 42,
            height: 42,
            borderRadius: '50%',
            bgcolor: tokens.colors.primary,
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.5,
            flexShrink: 0,
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 2,
            '&:hover': {
              transform: 'scale(1.1) !important',
            }
          }}
        >
          {isCurrentlyActive ? (
            <PauseIcon sx={{ fontSize: 22, color: '#000' }} />
          ) : (
            <PlayArrowIcon sx={{ fontSize: 22, ml: 0.2, color: '#000' }} />
          )}
        </Box>

        {/* Context Menu */}
        {contextMenu && item.type === 'track' && (
          <TrackContextMenu
            track={item.track}
            anchorPosition={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Box>
    </motion.div>
  );
};

const TrackScrollRow: React.FC<TrackScrollRowProps> = React.memo(
  ({ tracks, currentTrack, isPlaying, onPlay }) => {
    const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
    const [showArrows, setShowArrows] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleScroll = (direction: 'left' | 'right') => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const scrollAmount = 360; // scroll by about 2 cards
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    };

    return (
      <Box 
        onMouseEnter={() => setShowArrows(true)}
        onMouseLeave={() => setShowArrows(false)}
        sx={{ position: 'relative', width: '100%' }}
      >
        {/* Left Arrow */}
        <IconButton
          onClick={() => handleScroll('left')}
          sx={{
            position: 'absolute',
            left: -16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            bgcolor: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            opacity: showArrows ? 1 : 0,
            visibility: showArrows ? 'visible' : 'hidden',
            transition: 'all 0.3s ease',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.85)', transform: 'translateY(-50%) scale(1.08)' }
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </IconButton>

        {/* Carousel Container */}
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            gap: `${tokens.spacing.md}px`,
            overflowX: 'auto',
            pb: 1,
            mx: -0.5,
            px: 0.5,
            scrollbarWidth: 'none',
            scrollSnapType: 'x mandatory',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {tracks.map((track, idx) => (
            <TrackScrollRowItem
              key={track.id}
              track={track}
              idx={idx}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={onPlay}
              hoveredTrackId={hoveredTrackId}
              setHoveredTrackId={setHoveredTrackId}
            />
          ))}
        </Box>

        {/* Right Arrow */}
        <IconButton
          onClick={() => handleScroll('right')}
          sx={{
            position: 'absolute',
            right: -16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            bgcolor: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            opacity: showArrows ? 1 : 0,
            visibility: showArrows ? 'visible' : 'hidden',
            transition: 'all 0.3s ease',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.85)', transform: 'translateY(-50%) scale(1.08)' }
          }}
        >
          <ChevronRight className="w-5 h-5" />
        </IconButton>
      </Box>
    );
  }
);

TrackScrollRow.displayName = 'TrackScrollRow';

// ─── Section Header ───────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onSeeAll?: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, icon, onSeeAll }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      mb: `${tokens.spacing.lg}px`,
      px: 0.5,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {icon}
      <Box>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            color: tokens.colors.textPrimary,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            sx={{
              color: tokens.colors.textSecondary,
              display: 'block',
              mt: 0.25,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    {onSeeAll && (
      <Button
        size="small"
        onClick={onSeeAll}
        sx={{
          color: tokens.colors.textSecondary,
          fontSize: tokens.typography.caption.size,
          fontWeight: 600,
          textTransform: 'none',
          '&:hover': { color: tokens.colors.textPrimary },
        }}
      >
        See All →
      </Button>
    )}
  </Box>
);

// ═══════════════════════════════════════════════════════════════════════
// ─── HomePage Component ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onSearchFocus,
  onUploadClick,
  onShowEqualizer,
  onSearch,
}) => {
  // ── Player store (individual selectors) ───────────────────────────
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const { toast } = useToast();
  const { getAnalyser } = useAudioEngine();

  // ── Recommendations ───────────────────────────────────────────────
  const recSections = useRecommendationStore((s) => s.sections);
  const fetchRecommendations = useRecommendationStore((s) => s.fetchRecommendations);

  // ── Library data ──────────────────────────────────────────────────
  const { 
    getAllTracks, 
    getAllFavorites, 
    getAllPlaylists, 
    getPlaybackHistory,
    getOnRepeatTracks,
    getHeavyRotationTracks,
    getForgottenGems
  } = useLibraryDB();

  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [smartRecommendedTracks, setSmartRecommendedTracks] = useState<Track[]>([]);
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [onRepeatTracks, setOnRepeatTracks] = useState<Track[]>([]);
  const [heavyRotationTracks, setHeavyRotationTracks] = useState<Track[]>([]);
  const [forgottenGemsTracks, setForgottenGemsTracks] = useState<Track[]>([]);
  const [totalTracks, setTotalTracks] = useState(0);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [totalPlaylists, setTotalPlaylists] = useState(0);
  const [hoursListened, setHoursListened] = useState(0);

  const [activeFilter, setActiveFilter] = useState<'all' | 'music' | 'vibes'>('all');

  // ── Curated Vibe Mix Generator ──
  const handleGenerateVibe = useCallback(async (vibe: VibeType) => {
    toast(`Curating a "${vibe}" vibe mix online...`, 'info');
    
    // Set dynamic body background override
    const vibeColors: Record<VibeType, string> = {
      'Chill': '#050b1a',
      'Focus': '#030d07',
      'Workout': '#140404',
      'Party': '#140314',
      'Late Night': '#0d0803'
    };
    const targetColor = vibeColors[vibe] || '#000000';
    document.documentElement.style.setProperty('--bg-primary-override', targetColor);

    try {
      const playlist = await PlaylistGenerator.generateVibePlaylist(vibe);
      if (!playlist || playlist.trackIds.length === 0) {
        toast(`No tracks matching the "${vibe}" vibe (Energy/BPM profile) could be found online at the moment!`, 'error');
        return;
      }
      
      const allTracks = await getAllTracks();
      const playlistTracks = playlist.trackIds
        .map(id => allTracks.find(t => t.id === id))
        .filter((t): t is Track => !!t);

      if (playlistTracks.length > 0) {
        setQueue(playlistTracks, 0);
        toast(`Vibe Curated: Playing your ${vibe} Mix! (${playlistTracks.length} tracks sequenced by energy)`, 'success');
      } else {
        toast(`No tracks matching the "${vibe}" vibe could be loaded.`, 'error');
      }
    } catch (err) {
      console.error('Failed to generate vibe playlist:', err);
      toast('Failed to generate vibe playlist', 'error');
    }
  }, [getAllTracks, setQueue, toast]);

  const quickItems = useMemo(() => {
    const items = [];

    // 1. Liked Songs (Favorites)
    items.push({
      id: 'liked-songs',
      title: 'Liked Songs',
      type: 'favorites' as const,
      gradient: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
      image: null,
      tracks: favoriteTracks,
    });

    // 2. Recently Played Tracks
    for (const track of recentTracks) {
      if (items.length >= 8) break;
      if (!items.some(item => item.id === track.id)) {
        items.push({
          id: track.id,
          title: track.title,
          type: 'track' as const,
          image: track.coverArtUrl,
          track: track,
        });
      }
    }

    // 3. Backfill with Vibe Mixes if less than 8
    const vibes = [
      { name: 'Chill' as VibeType, gradient: VIBE_CONFIGS.Chill.color },
      { name: 'Focus' as VibeType, gradient: VIBE_CONFIGS.Focus.color },
      { name: 'Workout' as VibeType, gradient: VIBE_CONFIGS.Workout.color },
      { name: 'Party' as VibeType, gradient: VIBE_CONFIGS.Party.color },
      { name: 'Late Night' as VibeType, gradient: VIBE_CONFIGS['Late Night'].color },
    ];

    for (const vibe of vibes) {
      if (items.length >= 8) break;
      if (!items.some(item => item.type === 'vibe' && item.vibeName === vibe.name)) {
        items.push({
          id: `vibe-${vibe.name.toLowerCase()}`,
          title: `${vibe.name} Mix`,
          type: 'vibe' as const,
          gradient: vibe.gradient,
          vibeName: vibe.name,
        });
      }
    }

    return items;
  }, [favoriteTracks, recentTracks]);

  const handlePlayQuickItem = useCallback((item: any) => {
    if (item.type === 'favorites') {
      if (favoriteTracks.length > 0) {
        playTrack(favoriteTracks[0], favoriteTracks);
      } else {
        toast('No liked songs in library yet! Favorite some tracks first.', 'info');
      }
    } else if (item.type === 'track') {
      playTrack(item.track, [item.track]);
    } else if (item.type === 'vibe') {
      handleGenerateVibe(item.vibeName);
    }
  }, [favoriteTracks, playTrack, handleGenerateVibe, toast]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tracks, favIds, playlists, history, onRepeat, heavyRotation, forgottenGems, smartRecs] = await Promise.all([
          getAllTracks(),
          getAllFavorites(),
          getAllPlaylists(),
          getPlaybackHistory(),
          getOnRepeatTracks(12),
          getHeavyRotationTracks(12),
          getForgottenGems(12),
          recommendationEngine.getSmartRecommendations(),
        ]);

        setTotalTracks(tracks.length);
        setTotalPlaylists(playlists.length);
        setTotalFavorites(favIds.length);
        setOnRepeatTracks(onRepeat);
        setHeavyRotationTracks(heavyRotation);
        setForgottenGemsTracks(forgottenGems);
        let recs = smartRecs;
        if (!recs || recs.length === 0) {
          const shuffled = [...tracks].sort(() => 0.5 - Math.random());
          recs = shuffled.slice(0, 6);
        }
        setSmartRecommendedTracks(recs);

        // Compute hours listened from track durations in history
        let totalSeconds = 0;
        for (const entry of history) {
          const t = tracks.find((tr) => tr.id === entry.trackId);
          if (t) totalSeconds += t.duration;
        }
        setHoursListened(Math.round((totalSeconds / 3600) * 10) / 10);

        // Recent tracks from history (unique, max 12)
        const uniqueRecent: Track[] = [];
        const seen = new Set<string>();
        for (const entry of history) {
          if (!seen.has(entry.trackId)) {
            seen.add(entry.trackId);
            const t = tracks.find((tr) => tr.id === entry.trackId);
            if (t) uniqueRecent.push(t);
          }
          if (uniqueRecent.length >= 12) break;
        }
        setRecentTracks(uniqueRecent);

        // Favorite tracks
        const favTracks = favIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter((t): t is Track => !!t)
          .slice(0, 12);
        setFavoriteTracks(favTracks);

        // Trigger recommendations calculation
        await fetchRecommendations();
      } catch (e) {
        console.error('HomePage data load error:', e);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = useMemo(() => getGreeting(), []);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      // 1. Entrance timeline
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      
      tl.fromTo('.gsap-hero', 
        { opacity: 0, scale: 0.97, y: 25 },
        { opacity: 1, scale: 1, y: 0, duration: 0.9, delay: 0.15 }
      );
      
      tl.fromTo('.gsap-stat-card',
        { opacity: 0, y: 30, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08 },
        '-=0.5'
      );
      
      tl.fromTo('.gsap-section',
        { opacity: 0, y: 25 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 },
        '-=0.3'
      );

      // 2. Title Text Typing Effect (using TextPlugin)
      const titleEl = document.querySelector('.gsap-type-title');
      if (titleEl) {
        gsap.to(titleEl, {
          duration: 1.5,
          text: "Discover your next favorite song",
          ease: "power1.inOut",
          delay: 0.2
        });
      }
      
      const greetingEl = document.querySelector('.gsap-type-greeting');
      if (greetingEl) {
        gsap.to(greetingEl, {
          duration: 0.9,
          text: greeting + " · Explore",
          ease: "power1.inOut",
          delay: 0.05
        });
      }

      // 3. Organic background blob movements inside Discover Hero
      const blobs = document.querySelectorAll('.gsap-blob');
      blobs.forEach((blob) => {
        const animateBlob = (el: Element) => {
          gsap.to(el, {
            x: gsap.utils.random(-70, 70),
            y: gsap.utils.random(-70, 70),
            scale: gsap.utils.random(0.85, 1.25),
            rotation: gsap.utils.random(-180, 180),
            duration: gsap.utils.random(7, 13),
            ease: "sine.inOut",
            onComplete: () => animateBlob(el),
          });
        };
        animateBlob(blob);
      });

      // 4. Scroll-Triggered Stat Counters (Numbers)
      const counters = document.querySelectorAll('.gsap-counter');
      counters.forEach((counter) => {
        const targetVal = parseFloat(counter.getAttribute('data-target') || '0');
        if (targetVal > 0) {
          const obj = { val: 0 };
          gsap.to(obj, {
            val: targetVal,
            duration: 1.6,
            ease: "power3.out",
            scrollTrigger: {
              trigger: counter,
              start: "top 95%",
              toggleActions: "play none none none"
            },
            onUpdate: () => {
              const decimals = targetVal % 1 === 0 ? 0 : 1;
              counter.textContent = obj.val.toFixed(decimals);
            }
          });
        } else {
          counter.textContent = '0';
        }
      });

      // 5. 3D Parallax Tilt Effect — scoped exclusively to Hero card with proper listener teardown
      const listeners: Array<{ el: HTMLElement; move: (e: MouseEvent) => void; leave: () => void }> = [];
      const tiltCards = containerRef.current ? containerRef.current.querySelectorAll('.gsap-hero') : [];
      
      tiltCards.forEach((card) => {
        const el = card as HTMLElement;
        
        el.style.transition = 'transformBorder 0.3s ease, borderColor 0.3s ease, boxShadow 0.3s ease';

        const handleMouseMove = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const width = rect.width;
          const height = rect.height;
          
          const rotateY = ((x - width / 2) / (width / 2)) * 6; // max 6 deg
          const rotateX = -((y - height / 2) / (height / 2)) * 6; // max 6 deg
          
          gsap.to(el, {
            rotateX: rotateX,
            rotateY: rotateY,
            transformPerspective: 800,
            scale: 1.01,
            ease: "power2.out",
            duration: 0.35,
            overwrite: "auto"
          });
        };
        
        const handleMouseLeave = () => {
          gsap.to(el, {
            rotateX: 0,
            rotateY: 0,
            scale: 1,
            ease: "power3.out",
            duration: 0.5,
            overwrite: "auto"
          });
        };
        
        el.addEventListener('mousemove', handleMouseMove);
        el.addEventListener('mouseleave', handleMouseLeave);
        listeners.push({ el, move: handleMouseMove, leave: handleMouseLeave });
      });

      return () => {
        listeners.forEach(({ el, move, leave }) => {
          el.removeEventListener('mousemove', move);
          el.removeEventListener('mouseleave', leave);
        });
      };
    }, containerRef);

    return () => ctx.revert();
  }, [totalTracks, totalFavorites, totalPlaylists, hoursListened, greeting]);

  const handlePlayTrack = useCallback(
    (track: Track) => {
      document.documentElement.style.removeProperty('--bg-primary-override');
      if (currentTrack?.id === track.id) {
        setPlaying(!isPlaying);
      } else {
        playTrack(track);
      }
    },
    [currentTrack?.id, isPlaying, playTrack, setPlaying],
  );

  const handleGenreClick = useCallback(
    (genre: string) => {
      if (onSearch) {
        onSearch(genre);
      } else {
        onSearchFocus();
      }
    },
    [onSearch, onSearchFocus],
  );

  // ── Stat cards data ───────────────────────────────────────────────
  const stats = useMemo(
    () => [
      {
        icon: <MusicNoteIcon />,
        label: 'Total Tracks',
        value: totalTracks,
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.violet, 0.15)}, ${alpha(tokens.colors.accent.blue, 0.08)})`,
        color: tokens.colors.accent.violet,
      },
      {
        icon: <FavoriteIcon />,
        label: 'Favorites',
        value: totalFavorites,
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.pink, 0.15)}, ${alpha(tokens.colors.accent.red, 0.08)})`,
        color: tokens.colors.accent.pink,
      },
      {
        icon: <QueueMusicIcon />,
        label: 'Playlists',
        value: totalPlaylists,
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.cyan, 0.15)}, ${alpha(tokens.colors.accent.emerald, 0.08)})`,
        color: tokens.colors.accent.cyan,
      },
      {
        icon: <AccessTimeIcon />,
        label: 'Hours Listened',
        value: hoursListened,
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.amber, 0.15)}, ${alpha(tokens.colors.accent.red, 0.08)})`,
        color: tokens.colors.accent.amber,
      },
    ],
    [totalTracks, totalFavorites, totalPlaylists, hoursListened],
  );

  // ── Quick actions data ────────────────────────────────────────────
  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        icon: <SearchIcon sx={{ fontSize: 28 }} />,
        label: 'Search',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.violet, 0.25)}, ${alpha(tokens.colors.accent.blue, 0.12)})`,
        onClick: onSearchFocus,
      },
      {
        icon: <UploadIcon sx={{ fontSize: 28 }} />,
        label: 'Upload Music',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.cyan, 0.25)}, ${alpha(tokens.colors.accent.emerald, 0.12)})`,
        onClick: onUploadClick,
      },
      {
        icon: <EqualizerIcon sx={{ fontSize: 28 }} />,
        label: 'Equalizer',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.amber, 0.25)}, ${alpha(tokens.colors.accent.red, 0.12)})`,
        onClick: onShowEqualizer,
      },
      {
        icon: <DownloadIcon sx={{ fontSize: 28 }} />,
        label: 'Downloads',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.emerald, 0.25)}, ${alpha(tokens.colors.accent.cyan, 0.12)})`,
        onClick: () => onNavigate('downloads'),
      },
      {
        icon: <SettingsIcon sx={{ fontSize: 28 }} />,
        label: 'Settings',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.pink, 0.25)}, ${alpha(tokens.colors.accent.violet, 0.12)})`,
        onClick: () => onNavigate('settings'),
      },
      {
        icon: <LibraryIcon sx={{ fontSize: 28 }} />,
        label: 'Library',
        gradient: `linear-gradient(135deg, ${alpha(tokens.colors.accent.blue, 0.25)}, ${alpha(tokens.colors.accent.violet, 0.12)})`,
        onClick: () => onNavigate('library'),
      },
    ],
    [onNavigate, onSearchFocus, onUploadClick, onShowEqualizer],
  );

  const vibeCards = useMemo(() => [
    {
      vibe: 'Workout' as VibeType,
      icon: <FitnessCenterIcon sx={{ fontSize: 32 }} />,
      gradient: VIBE_CONFIGS.Workout.color,
      description: VIBE_CONFIGS.Workout.description,
    },
    {
      vibe: 'Focus' as VibeType,
      icon: <SelfImprovementIcon sx={{ fontSize: 32 }} />,
      gradient: VIBE_CONFIGS.Focus.color,
      description: VIBE_CONFIGS.Focus.description,
    },
    {
      vibe: 'Chill' as VibeType,
      icon: <SpaIcon sx={{ fontSize: 32 }} />,
      gradient: VIBE_CONFIGS.Chill.color,
      description: VIBE_CONFIGS.Chill.description,
    },
    {
      vibe: 'Party' as VibeType,
      icon: <CelebrationIcon sx={{ fontSize: 32 }} />,
      gradient: VIBE_CONFIGS.Party.color,
      description: VIBE_CONFIGS.Party.description,
    },
    {
      vibe: 'Late Night' as VibeType,
      icon: <NightsStayIcon sx={{ fontSize: 32 }} />,
      gradient: VIBE_CONFIGS['Late Night'].color,
      description: VIBE_CONFIGS['Late Night'].description,
    },
  ], []);

  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Clean up body overrides on unmount
  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty('--bg-primary-override');
    };
  }, []);

  const featuredTrack = useMemo(() => {
    if (currentTrack) return currentTrack;
    if (smartRecommendedTracks.length > 0) return smartRecommendedTracks[0];
    if (recentTracks.length > 0) return recentTracks[0];
    if (favoriteTracks.length > 0) return favoriteTracks[0];
    return null;
  }, [currentTrack, smartRecommendedTracks, recentTracks, favoriteTracks]);

  const contextualGreetingSubtitle = useMemo(() => {
    const parts: string[] = [];
    
    // Add listening stats if available
    if (hoursListened > 0) {
      const mins = Math.round(hoursListened * 60);
      parts.push(`You\u2019ve listened to ${mins >= 60 ? `${hoursListened.toFixed(1)} hours` : `${mins} minutes`} of music`);
    }

    // Add genre-based recommendation
    if (recentTracks.length > 0) {
      const genres = recentTracks.map(t => t.genre).filter(Boolean);
      if (genres.length > 0) {
        const freq: Record<string, number> = {};
        genres.forEach(g => { freq[g] = (freq[g] || 0) + 1; });
        const topGenre = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
        if (parts.length > 0) {
          parts.push(`Ready for some ${topGenre}?`);
        } else {
          parts.push(`Ready for some ${topGenre}? Here's a mix tailored to your style.`);
        }
      }
    }

    if (parts.length === 0) {
      return `Welcome back! Dive into your daily recommendations and vibe playlists.`;
    }
    return parts.join('. ') + '.';
  }, [recentTracks, hoursListened]);

  const moodPills = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) {
      return [
        { label: 'Morning Flow ☕', vibe: 'Chill' as VibeType },
        { label: 'Wake Up Energy ⚡', vibe: 'Workout' as VibeType },
      ];
    } else if (h >= 12 && h < 17) {
      return [
        { label: 'Focus Flow 🎯', vibe: 'Focus' as VibeType },
        { label: 'Afternoon Chill 🌤', vibe: 'Chill' as VibeType },
      ];
    } else if (h >= 17 && h < 22) {
      return [
        { label: 'Evening Relax 🌙', vibe: 'Chill' as VibeType },
        { label: 'Gym Mode ⚡', vibe: 'Workout' as VibeType },
      ];
    } else {
      return [
        { label: 'Late Night Drive 🌃', vibe: 'Late Night' as VibeType },
        { label: 'Midnight Focus 📚', vibe: 'Focus' as VibeType },
      ];
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // ─── Render ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <Box
        ref={containerRef}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: `${tokens.spacing['3xl']}px`,
          pb: `${tokens.spacing['3xl']}px`,
          color: tokens.colors.textPrimary,
          // Ambient Glow Background — driven by album art colors
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -100,
            left: '10%',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, var(--ambient-primary, rgba(120, 80, 200, 0.15)) 0%, transparent 70%)',
            filter: 'blur(100px)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 1.5s ease',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 100,
            right: '5%',
            width: '500px',
            height: '500px',
            background: 'radial-gradient(circle, var(--ambient-secondary, rgba(200, 80, 120, 0.10)) 0%, transparent 70%)',
            filter: 'blur(100px)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 1.5s ease',
          }
        }}
      >
        {/* ─── Dynamic Hero Section ─── */}
        <Box 
          className="gsap-hero relative overflow-hidden"
          sx={{ 
            minHeight: { xs: 280, md: 380 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            p: { xs: 4, md: 6 },
            position: 'relative',
            mb: 1,
            zIndex: 1,
            borderRadius: { xs: `${tokens.radius.xl}px`, md: `${tokens.radius['2xl']}px` },
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
          }}
        >
          {/* Organic Background Blobs — driven by album art ambient colors */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="gsap-blob absolute w-72 h-72 rounded-full blur-[80px] top-[-20%] left-[10%]" style={{ background: 'var(--ambient-primary, rgba(79, 70, 229, 0.1))', transition: 'background 1.5s ease' }} />
            <div className="gsap-blob absolute w-80 h-80 rounded-full blur-[100px] bottom-[-20%] right-[15%]" style={{ background: 'var(--ambient-secondary, rgba(147, 51, 234, 0.1))', transition: 'background 1.5s ease' }} />
            <div className="gsap-blob absolute w-56 h-56 rounded-full blur-[60px] top-[30%] right-[40%]" style={{ background: 'var(--ambient-primary, rgba(236, 72, 153, 0.05))', opacity: 0.6, transition: 'background 1.5s ease' }} />
          </div>

          {/* Dynamic Parallax Background Artwork Overlay */}
          {featuredTrack && (
            <div className="absolute inset-0 z-0 opacity-15 select-none pointer-events-none">
              <img 
                src={api.coverUrl(featuredTrack.coverArtUrl, featuredTrack.videoId) || ''}
                alt=""
                className="w-full h-full object-cover filter blur-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
            </div>
          )}

          {/* Hero Content */}
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 w-full">
            <div className="flex-1 max-w-xl text-left">
              <Typography
                className="gsap-type-greeting"
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: tokens.colors.primaryLight,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontSize: 12,
                  mb: 1
                }}
              >
                {greeting}
              </Typography>
              <Typography
                className="gsap-type-title"
                variant="h3"
                sx={{
                  fontWeight: 800,
                  color: '#fff',
                  fontFamily: tokens.fontFamilyDisplay,
                  letterSpacing: '-0.02em',
                  fontSize: { xs: 32, sm: 42, md: 56 },
                  lineHeight: 1.08,
                  mb: 2,
                  minHeight: { xs: 72, sm: 92, md: 120 }
                }}
              >
                Discover your next favorite song
              </Typography>
              
              <Typography
                variant="body2"
                sx={{
                  color: 'rgba(255, 255, 255, 0.75)',
                  fontSize: 15,
                  mb: 3,
                  lineHeight: 1.6,
                  fontFamily: tokens.fontFamily,
                }}
              >
                {contextualGreetingSubtitle}
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                {featuredTrack && (
                  <Button
                    onClick={() => handlePlayTrack(featuredTrack)}
                    variant="contained"
                    startIcon={isPlaying && currentTrack?.id === featuredTrack.id ? <PauseIcon /> : <PlayArrowIcon />}
                    sx={{
                      background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
                      color: '#fff',
                      fontWeight: 700,
                      fontFamily: tokens.fontFamily,
                      fontSize: 15,
                      px: 4,
                      py: 1.5,
                      borderRadius: '24px',
                      textTransform: 'none',
                      boxShadow: `0 4px 20px ${tokens.colors.primary}40`,
                      animation: 'glow-pulse 3s ease-in-out infinite',
                      '@keyframes glow-pulse': {
                        '0%, 100%': { boxShadow: `0 4px 20px ${tokens.colors.primary}40` },
                        '50%': { boxShadow: `0 6px 28px ${tokens.colors.primary}60` },
                      },
                      '&:hover': {
                        boxShadow: `0 8px 30px ${tokens.colors.primary}60`,
                        animation: 'none',
                      }
                    }}
                  >
                    {isPlaying && currentTrack?.id === featuredTrack?.id ? 'Pause' : 'Listen Now'}
                  </Button>
                )}
                {isPlaying && currentTrack?.id === featuredTrack?.id && (
                  <Box sx={{ width: 140, height: 36, borderRadius: '8px', overflow: 'hidden', opacity: 0.85, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <AudioVisualizer getAnalyser={getAnalyser} />
                  </Box>
                )}
              </Box>
            </div>

            {/* Rotating Featured Artwork Card */}
            {featuredTrack && (
              <Box
                className="gsap-tilt shrink-0 self-center md:self-auto"
                sx={{
                  width: { xs: 180, sm: 240, md: 320 },
                  height: { xs: 180, sm: 240, md: 320 },
                  borderRadius: `${tokens.radius['2xl']}px`,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 24px 56px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: tokens.colors.surfaceElevated,
                  cursor: 'pointer',
                  transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    '& .featured-play-overlay': { opacity: 1 },
                    transform: 'scale(1.02)',
                  }
                }}
                onClick={() => handlePlayTrack(featuredTrack)}
              >
                <img 
                  src={api.coverUrl(featuredTrack.coverArtUrl, featuredTrack.videoId) || ''} 
                  alt={featuredTrack.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                <div className="absolute bottom-3 left-3 right-3 z-20 text-left">
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, display: 'block', fontSize: 10 }}>
                    FEATURED RELEASE
                  </Typography>
                  <Typography variant="body2" noWrap sx={{ color: '#fff', fontWeight: 800, fontSize: 13, mt: 0.2 }}>
                    {featuredTrack.title}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.8)', display: 'block', fontSize: 11 }}>
                    {featuredTrack.artist}
                  </Typography>
                </div>
                {/* Play Hover Overlay */}
                <div className="featured-play-overlay absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 transition-opacity duration-300 z-30">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white scale-90 hover:scale-100 transition-transform">
                    {isPlaying && currentTrack?.id === featuredTrack.id ? <PauseIcon sx={{ fontSize: 24 }} /> : <PlayArrowIcon sx={{ fontSize: 24, ml: 0.25 }} />}
                  </div>
                </div>
              </Box>
            )}
          </div>
        </Box>

        {/* Filter & Mood Pills */}
        <Box className="gsap-hero" sx={{ mt: 1, px: 0.5, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          {/* Main Filter Tabs */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {[
              { id: 'all', label: 'All', icon: <ExploreIcon sx={{ fontSize: 16 }} /> },
              { id: 'music', label: 'Music', icon: <MusicNoteIcon sx={{ fontSize: 16 }} /> },
              { id: 'vibes', label: 'Vibes', icon: <EqualizerIcon sx={{ fontSize: 16 }} /> },
            ].map((tab) => (
              <Box
                key={tab.id}
                component="button"
                onClick={() => setActiveFilter(tab.id as any)}
                sx={{
                  px: 2.5,
                  py: 0.8,
                  borderRadius: '20px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  bgcolor: activeFilter === tab.id ? tokens.colors.primary : 'rgba(255, 255, 255, 0.05)',
                  color: activeFilter === tab.id ? '#fff' : tokens.colors.textSecondary,
                  boxShadow: activeFilter === tab.id ? `0 4px 12px ${tokens.colors.primary}40` : 'none',
                  '&:hover': {
                    bgcolor: activeFilter === tab.id ? tokens.colors.primaryLight : 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  }
                }}
              >
                {tab.icon}
                {tab.label}
              </Box>
            ))}
          </Box>

          {/* Divider */}
          <Box sx={{ width: '1px', height: '20px', bgcolor: 'rgba(255,255,255,0.1)', display: { xs: 'none', md: 'block' } }} />

          {/* Time-Aware Mood Shortcuts */}
          <Box sx={{ display: 'flex', gap: 1.2, overflowX: 'auto', py: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
            {moodPills.map((pill, i) => (
              <Box
                key={i}
                component="button"
                onClick={() => handleGenerateVibe(pill.vibe)}
                sx={{
                  px: 2.5,
                  py: 0.8,
                  borderRadius: '20px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: tokens.colors.textSecondary,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    background: 'rgba(255, 255, 255, 0.07)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    transform: 'translateY(-1px)',
                  },
                  '&:active': {
                    transform: 'scale(0.97)',
                  }
                }}
              >
                {pill.label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* ─── 2x4 Quick Play Grid ─── */}
        {activeFilter === 'all' && (
          <Box className="gsap-hero" sx={{ px: 0.5 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                  lg: 'repeat(4, 1fr)',
                },
                gap: 2,
              }}
            >
              {quickItems.map((item, idx) => (
                <QuickPlayGridItem
                  key={item.id}
                  item={item}
                  idx={idx}
                  handlePlayQuickItem={handlePlayQuickItem}
                  hoveredId={hoveredItemId}
                  setHoveredId={setHoveredItemId}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 3: Recently Played
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && recentTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Recently Played"
              icon={<AccessTimeIcon sx={{ fontSize: 20, color: tokens.colors.textTertiary }} />}
              onSeeAll={() => onNavigate('history')}
            />
            <TrackScrollRow
              tracks={recentTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 3.5: Recommended for You (Smart Similarity)
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && smartRecommendedTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Recommended Tracks"
              subtitle="Suggested songs based on your listening style"
              icon={<PlayCircleIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />}
            />
            <TrackScrollRow
              tracks={smartRecommendedTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 4: Your Favorites
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && favoriteTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Favorites"
              icon={<FavoriteIcon sx={{ fontSize: 20, color: tokens.colors.accent.pink }} />}
              onSeeAll={() => onNavigate('favorites')}
            />
            <TrackScrollRow
              tracks={favoriteTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 4.1: Smart Playlists (On Repeat, Heavy Rotation, Forgotten Gems)
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && onRepeatTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="On Repeat"
              subtitle="Your absolute favorites right now"
              icon={<PlayCircleIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />}
            />
            <TrackScrollRow
              tracks={onRepeatTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && heavyRotationTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Heavy Rotation"
              subtitle="Tracks you've spent the most time with"
              icon={<QueueMusicIcon sx={{ fontSize: 20, color: tokens.colors.accent.amber }} />}
            />
            <TrackScrollRow
              tracks={heavyRotationTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && forgottenGemsTracks.length > 0 && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Forgotten Gems"
              subtitle="Favorites you haven't played in a while"
              icon={<ExploreIcon sx={{ fontSize: 20, color: tokens.colors.accent.cyan }} />}
            />
            <TrackScrollRow
              tracks={forgottenGemsTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 4.3: Curated Vibe Mixes
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'vibes') && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Curate a Vibe Mix"
              subtitle="Choose a mood to generate a custom-sequenced playlist from your library"
              icon={<ExploreIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />}
            />
            <Box
              sx={{
                display: 'flex',
                gap: `${tokens.spacing.md}px`,
                overflowX: 'auto',
                pb: 1.5,
                mx: -0.5,
                px: 0.5,
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {vibeCards.map((card, idx) => (
                <motion.div
                  key={card.vibe}
                  custom={idx}
                  variants={trackCardVariants}
                  initial="hidden"
                  animate="show"
                >
                  <Box
                    component="button"
                    className="gsap-tilt"
                    onClick={() => handleGenerateVibe(card.vibe)}
                    sx={{
                      flexShrink: 0,
                      width: 220,
                      height: 190,
                      p: `${tokens.spacing.lg}px`,
                      borderRadius: `${tokens.radius.xl}px`,
                      background: card.gradient,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      color: '#fff',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                      transition: 'all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.4) 100%)',
                        zIndex: 1,
                      },
                      '&:hover': {
                        transform: 'scale(1.04) translateY(-4px)',
                        boxShadow: '0 16px 36px rgba(0,0,0,0.3)',
                        '& .vibe-play-btn': { opacity: 1, transform: 'scale(1) translateY(0)' },
                        '& .vibe-icon-bg': { transform: 'scale(1.2) rotate(20deg)', opacity: 0.25 },
                      },
                      '&:active': {
                        transform: 'scale(0.98)',
                      },
                    }}
                  >
                    {/* Background overlay/glowing element */}
                    <Box
                      className="vibe-icon-bg"
                      sx={{
                        position: 'absolute',
                        top: -15,
                        right: -15,
                        opacity: 0.15,
                        transform: 'rotate(15deg)',
                        color: '#fff',
                        transition: 'all 0.4s ease',
                        zIndex: 0,
                      }}
                    >
                      {React.cloneElement(card.icon, { sx: { fontSize: 90 } })}
                    </Box>

                    {/* Top Row: Icon */}
                    <Box
                      sx={{
                        position: 'relative',
                        zIndex: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 42,
                        height: 42,
                        borderRadius: '14px',
                        bgcolor: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                      }}
                    >
                      {card.icon}
                    </Box>

                    {/* Bottom Row: Text & Play button */}
                    <Box sx={{ position: 'relative', zIndex: 2, width: '100%', pr: 4 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 800,
                          lineHeight: 1.25,
                          textShadow: '0 2px 8px rgba(0,0,0,0.25)',
                          fontSize: 15,
                        }}
                      >
                        {card.vibe} Mix
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'rgba(255, 255, 255, 0.8)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mt: 0.5,
                          lineHeight: 1.35,
                          fontSize: 10.5,
                        }}
                      >
                        {card.description}
                      </Typography>
                    </Box>

                    {/* Play Button Overlay */}
                    <Box
                      className="vibe-play-btn"
                      sx={{
                        position: 'absolute',
                        bottom: `${tokens.spacing.lg}px`,
                        right: `${tokens.spacing.lg}px`,
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        bgcolor: '#fff',
                        color: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transform: 'scale(0.8) translateY(10px)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        zIndex: 3,
                      }}
                    >
                      <PlayArrowIcon sx={{ fontSize: 24, ml: 0.25 }} />
                    </Box>
                  </Box>
                </motion.div>
              ))}
            </Box>
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 4.5: Recommendation Sections
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && recSections.map((section) => (
          <motion.div className="gsap-section" variants={fadeUpVariants} key={section.id}>
            <SectionHeader
              title={section.title}
              subtitle={section.subtitle}
              icon={
                section.type === 'continue' ? (
                  <PlayCircleIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />
                ) : section.type === 'because' ? (
                  <ExploreIcon sx={{ fontSize: 20, color: tokens.colors.accent.violet }} />
                ) : section.type === 'hidden_gems' ? (
                  <ExploreIcon sx={{ fontSize: 20, color: tokens.colors.accent.cyan }} />
                ) : (
                  <ExploreIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />
                )
              }
            />
            <TrackScrollRow
              tracks={section.tracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlayTrack}
            />
          </motion.div>
        ))}

        {/* ───────────────────────────────────────────────────────────
            Section 5: Quick Actions Grid
            ─────────────────────────────────────────────────────────── */}
        {activeFilter === 'all' && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader title="Quick Actions" />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(6, 1fr)',
                },
                gap: `${tokens.spacing.md}px`,
              }}
            >
              {quickActions.map((action, idx) => (
                <motion.div
                  key={action.label}
                  custom={idx}
                  variants={trackCardVariants}
                  initial="hidden"
                  animate="show"
                >
                  <Box
                    component="button"
                    className="gsap-tilt"
                    onClick={action.onClick}
                    sx={{
                      width: '100%',
                      p: `${tokens.spacing.xl}px`,
                      borderRadius: `${tokens.radius.xl}px`,
                      bgcolor: tokens.colors.surface,
                      border: `1px solid ${tokens.colors.surfaceBorder}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: `${tokens.spacing.md}px`,
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      color: tokens.colors.textPrimary,
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        borderColor: tokens.colors.primary,
                        boxShadow: `0 8px 24px ${alpha(tokens.colors.primary, 0.12)}`,
                        '& .action-icon': {
                          transform: 'scale(1.15) translateY(-2px)',
                          color: tokens.colors.primaryLight,
                        },
                      },
                      '&:active': {
                        transform: 'scale(0.96)',
                      },
                    }}
                  >
                    {/* Subtle hover background highlight */}
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background: action.gradient,
                        opacity: 0.1,
                        pointerEvents: 'none',
                      }}
                    />

                    <Box
                      className="action-icon"
                      sx={{
                        color: tokens.colors.primary,
                        display: 'flex',
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }}
                    >
                      {action.icon}
                    </Box>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 700, 
                        color: tokens.colors.textPrimary,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {action.label}
                    </Typography>
                  </Box>
                </motion.div>
              ))}
            </Box>
          </motion.div>
        )}

        {/* ───────────────────────────────────────────────────────────
            Section 6: Genre Explorer
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && (
          <motion.div className="gsap-section" variants={fadeUpVariants}>
            <SectionHeader
              title="Explore Genres"
              icon={<ExploreIcon sx={{ fontSize: 20, color: tokens.colors.textTertiary }} />}
            />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(4, 1fr)',
                },
                gap: `${tokens.spacing.md}px`,
              }}
            >
              {GENRES.map((genre, idx) => (
                <motion.div
                  key={genre.name}
                  custom={idx}
                  variants={trackCardVariants}
                  initial="hidden"
                  animate="show"
                >
                  <Box
                    component="button"
                    className="gsap-tilt"
                    onClick={() => handleGenreClick(genre.name)}
                    sx={{
                      width: '100%',
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: `${tokens.radius.xl}px`,
                      background: genre.gradient,
                      border: 'none',
                      cursor: 'pointer',
                      p: `${tokens.spacing.xl}px`,
                      minHeight: 120,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'flex-start',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.02) 100%)',
                        zIndex: 1,
                        transition: 'opacity 0.3s ease',
                      },
                      '&:hover': {
                        transform: 'scale(1.04) translateY(-2px)',
                        boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
                        '&::before': {
                          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 100%)',
                        },
                        '& .genre-icon-bg': {
                          transform: 'scale(1.25) rotate(25deg)',
                          opacity: 0.18,
                        },
                        '& .genre-play-btn': {
                          opacity: 1,
                          transform: 'scale(1) translateY(0)',
                        }
                      },
                      '&:active': {
                        transform: 'scale(0.98) translateY(0)',
                      },
                    }}
                  >
                    {/* Subtle pattern overlay */}
                    <Box
                      className="genre-icon-bg"
                      sx={{
                        position: 'absolute',
                        top: -12,
                        right: -12,
                        opacity: 0.08,
                        color: '#fff',
                        transition: 'all 0.4s ease',
                        zIndex: 0,
                      }}
                    >
                      <MusicNoteIcon sx={{ fontSize: 90 }} />
                    </Box>

                    {/* Play Button Overlay on Hover */}
                    <Box
                      className="genre-play-btn"
                      sx={{
                        position: 'absolute',
                        right: 16,
                        bottom: 16,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: '#fff',
                        color: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transform: 'scale(0.8) translateY(8px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        zIndex: 3,
                      }}
                    >
                      <PlayArrowIcon sx={{ fontSize: 20, color: '#000', ml: 0.25 }} />
                    </Box>

                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 800,
                        color: '#fff',
                        position: 'relative',
                        zIndex: 2,
                        textShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        fontSize: 16,
                        letterSpacing: '-0.01em',
                        fontFamily: tokens.fontFamily,
                      }}
                    >
                      {genre.name}
                    </Typography>
                  </Box>
                </motion.div>
              ))}
            </Box>
          </motion.div>
        )}

        {/* ─── Listening Insights Footer ─── */}
        <motion.div className="gsap-section" variants={fadeUpVariants}>
          <SectionHeader
            title="Listening Insights"
            subtitle="Your account statistics and activity summary"
            icon={<EqualizerIcon sx={{ fontSize: 20, color: tokens.colors.primary }} />}
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              },
              gap: `${tokens.spacing.md}px`,
            }}
          >
            {stats.map((stat, idx) => (
              <Box
                key={stat.label}
                className="gsap-stat-card gsap-tilt"
                sx={{
                  p: `${tokens.spacing.xl}px`,
                  borderRadius: `${tokens.radius.xl}px`,
                  bgcolor: tokens.colors.surface,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  position: 'relative',
                  overflow: 'hidden',
                  '&:hover': {
                    bgcolor: tokens.colors.surfaceVariant,
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    '& .stat-icon-container': {
                      transform: 'scale(1.1)',
                    }
                  },
                }}
              >
                {/* Icon Container with Gradient Background */}
                <Box
                  className="stat-icon-container"
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    background: stat.gradient,
                    color: stat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                >
                  {React.cloneElement(stat.icon, { sx: { fontSize: 24 } })}
                </Box>
                {/* Text Content */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: tokens.colors.textSecondary,
                      fontWeight: 600,
                      display: 'block',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: 10,
                    }}
                  >
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 850,
                      color: tokens.colors.textPrimary,
                      mt: 0.5,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    <span className="gsap-counter" data-target={stat.value}>
                      0
                    </span>
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </motion.div>

        {/* ───────────────────────────────────────────────────────────
            Empty State (no history or favorites)
            ─────────────────────────────────────────────────────────── */}
        {(activeFilter === 'all' || activeFilter === 'music') && recentTracks.length === 0 && favoriteTracks.length === 0 && (
          <motion.div variants={fadeUpVariants}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 10,
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                px: 4,
                backdropFilter: 'blur(20px)',
              }}
            >
              <Box
                sx={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: `1px solid rgba(255,255,255,0.06)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                  animation: 'float-note 4s ease-in-out infinite',
                  '@keyframes float-note': {
                    '0%, 100%': { transform: 'translateY(0) scale(1)' },
                    '50%': { transform: 'translateY(-10px) scale(1.05)' },
                  }
                }}
              >
                <MusicNoteIcon sx={{ fontSize: 44, color: tokens.colors.primary }} />
              </Box>
              
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1, fontFamily: tokens.fontFamily, color: '#fff', letterSpacing: '-0.02em' }}>
                Your Music Oasis is Ready
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: tokens.colors.textSecondary, maxWidth: 420, mb: 4, lineHeight: 1.6, fontFamily: tokens.fontFamily }}
              >
                Create the perfect backdrop for your day. Search for any song, upload your audio files, or start listening instantly with one of our curated vibes.
              </Typography>
              
              {/* Clickable Vibe Chips */}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', mb: 4 }}>
                {[
                  { label: 'Chill Beats ☕', vibe: 'Chill' as VibeType },
                  { label: 'Focus Mode 📚', vibe: 'Focus' as VibeType },
                  { label: 'Workout Energy ⚡', vibe: 'Workout' as VibeType },
                  { label: 'Late Night Drive 🌃', vibe: 'Late Night' as VibeType },
                ].map((chip) => (
                  <Box
                    key={chip.label}
                    component="button"
                    onClick={() => handleGenerateVibe(chip.vibe)}
                    sx={{
                      px: 2.5,
                      py: 1,
                      borderRadius: '20px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.08)',
                      bgcolor: 'rgba(255, 255, 255, 0.04)',
                      color: tokens.colors.textPrimary,
                      transition: 'all 0.25s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                        borderColor: tokens.colors.primary,
                        transform: 'translateY(-2px)',
                        boxShadow: `0 4px 12px ${tokens.colors.primary}25`,
                      },
                      '&:active': {
                        transform: 'scale(0.97)',
                      }
                    }}
                  >
                    {chip.label}
                  </Box>
                ))}
              </Box>
              
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={onSearchFocus}
                sx={{
                  bgcolor: '#fff',
                  color: '#000',
                  fontWeight: 700,
                  px: 4,
                  py: 1.5,
                  borderRadius: '24px',
                  textTransform: 'none',
                  fontFamily: tokens.fontFamily,
                  boxShadow: '0 4px 14px rgba(255,255,255,0.15)',
                  '&:hover': { bgcolor: '#eeeeee', boxShadow: '0 6px 20px rgba(255,255,255,0.25)' },
                }}
              >
                Start Searching
              </Button>
            </Box>
          </motion.div>
        )}
      </Box>
    </motion.div>
  );
};

export default HomePage;
