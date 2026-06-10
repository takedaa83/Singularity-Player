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
  if (h < 6) return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 21) return 'Good Evening';
  return 'Good Night';
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
        console.warn('Preview audio playback failed or was interrupted:', e);
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
          width: 155,
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
            '& .play-overlay': { opacity: 1, transform: 'scale(1)' },
            '& .track-cover-img': { transform: 'scale(1.06)' },
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
          {/* Play overlay */}
          <Box
            className="play-overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isActive && isPlaying ? 1 : 0,
              transform: isActive && isPlaying ? 'scale(1)' : 'scale(0.9)',
              transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            {isActive && isPlaying ? (
              <PauseIcon sx={{ fontSize: 36, color: '#fff' }} />
            ) : (
              <PlayArrowIcon sx={{ fontSize: 36, color: '#fff' }} />
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

export const QuickPlayGridItem: React.FC<{
  item: any;
  idx: number;
  featured?: boolean;
  handlePlayQuickItem: (item: any) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}> = React.memo(({ item, idx, featured, handlePlayQuickItem, hoveredId, setHoveredId }) => {
  const navigate = useNavigate();
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const playNext = usePlayerStore(state => state.playNext);
  const favorites = usePlayerStore(state => state.favorites);
  const { toggleFavorite } = useLibraryDB();
  const { toast } = useToast();
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{ top: number; left: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (item.type !== 'track') return; // only tracks get context menu
    e.preventDefault();
    setContextMenuPosition({ top: e.clientY, left: e.clientX });
  };

  const handleFavoriteClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (item.type !== 'track') return;
    try {
      const nextState = await toggleFavorite(item.track.id);
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
    if (item.type !== 'track') return;
    try {
      toast(`Generating song radio for "${item.track.title}"...`, 'info');
      const similarTracks = await PlaylistGenerator.generateSimilarTracks(item.track);
      
      if (similarTracks && similarTracks.length > 0) {
        usePlayerStore.getState().setQueue(similarTracks, 0);
        toast(`Playing "${item.track.title}" Radio! (${similarTracks.length} tracks)`, 'success');
      } else {
        toast('Could not find similar tracks.', 'error');
      }
    } catch (err) {
      console.error('Failed to generate similar queue:', err);
      toast('Failed to generate similar queue', 'error');
    }
  };

  const liked = item.type === 'track' ? favorites?.includes(item.track.id) : false;
  const isFeatured = featured;

  return (
    <motion.div
      key={item.id}
      custom={idx}
      variants={trackCardVariants}
      initial="hidden"
      animate="show"
      style={{
        gridColumn: isFeatured ? 'span 2' : undefined,
        gridRow: isFeatured ? 'span 2' : undefined,
      }}
    >
      <Box
        onClick={() => handlePlayQuickItem(item)}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHoveredId(item.id)}
        onMouseLeave={() => setHoveredId(null)}
        sx={{
          display: 'flex',
          flexDirection: isFeatured ? 'column' : 'row',
          alignItems: isFeatured ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          height: isFeatured ? { xs: 56, sm: 128 } : 56,
          bgcolor: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          position: 'relative',
          p: isFeatured ? { xs: 0, sm: 2.5 } : 0,
          pr: isFeatured ? { xs: 3, sm: 2.5 } : 3,
          boxShadow: isFeatured ? '0 10px 25px rgba(0,0,0,0.15)' : 'none',
          border: isFeatured ? '1px solid rgba(255,255,255,0.06)' : 'none',
          '&:hover': {
            bgcolor: 'rgba(255, 255, 255, 0.08)',
            transform: 'translateY(-2px)',
            boxShadow: isFeatured ? '0 15px 35px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.1)',
            '& .quick-play-btn': {
              opacity: 1,
              transform: 'scale(1)',
            }
          },
          '&:active': {
            transform: 'scale(0.985)',
          }
        }}
      >
        {isFeatured ? (
          <>
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: item.gradient,
                opacity: 0.15,
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'row', gap: 3, alignItems: 'center', width: '100%', zIndex: 1 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(168, 85, 247, 0.4)',
                  flexShrink: 0,
                }}
              >
                <FavoriteIcon sx={{ color: '#fff', fontSize: 36 }} />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 900,
                    color: tokens.colors.textPrimary,
                    fontSize: 20,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {item.title}
                </Typography>
                <Typography variant="body2" sx={{ color: tokens.colors.textSecondary }}>
                  {item.tracks?.length || 0} songs saved
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 2, minWidth: 0, flex: 1, height: '100%', zIndex: 1 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FavoriteIcon sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: 700,
                  color: tokens.colors.textPrimary,
                  fontSize: 13,
                }}
              >
                {item.title}
              </Typography>
            </Box>
            <Box
              className="quick-play-btn"
              sx={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                opacity: 0,
                transform: 'scale(0.8)',
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: '#fff',
                color: '#000',
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                zIndex: 2,
                '&:hover': {
                  bgcolor: '#eeeeee',
                  transform: 'scale(1.1) !important',
                }
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 28, ml: 0.3, color: '#000' }} />
            </Box>
            <Box
              className="quick-play-btn"
              sx={{
                opacity: 0,
                transform: 'scale(0.8)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: tokens.colors.primary,
                color: '#fff',
                display: { xs: 'flex', sm: 'none' },
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                zIndex: 2,
                '&:hover': {
                  bgcolor: tokens.colors.primaryLight,
                  transform: 'scale(1.08) !important',
                }
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 18, ml: 0.2 }} />
            </Box>
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: 1, height: '100%', zIndex: 1 }}>
              {item.type === 'favorites' ? (
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    background: item.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.35)',
                    flexShrink: 0,
                  }}
                >
                  <FavoriteIcon sx={{ color: '#fff', fontSize: 22 }} />
                </Box>
              ) : item.type === 'vibe' ? (
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    background: item.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MusicNoteIcon sx={{ color: '#fff', fontSize: 20 }} />
                </Box>
              ) : item.image ? (
                <Box
                  component="img"
                  src={item.image}
                  alt=""
                  sx={{
                    width: 56,
                    height: 56,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    bgcolor: tokens.colors.surfaceElevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MusicNoteIcon sx={{ fontSize: 20, color: tokens.colors.textTertiary }} />
                </Box>
              )}
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: 700,
                  color: tokens.colors.textPrimary,
                  fontSize: 13,
                }}
              >
                {item.title}
              </Typography>
            </Box>
            <Box
              className="quick-play-btn"
              sx={{
                opacity: 0,
                transform: 'scale(0.8)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: tokens.colors.primary,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                zIndex: 2,
                '&:hover': {
                  bgcolor: tokens.colors.primaryLight,
                  transform: 'scale(1.08) !important',
                }
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 18, ml: 0.2 }} />
            </Box>
          </>
        )}
      </Box>
      {item.type === 'track' && (
        <TrackContextMenu
          track={item.track}
          anchorPosition={contextMenuPosition}
          onClose={() => setContextMenuPosition(null)}
          onPlay={() => handlePlayQuickItem(item)}
          onAddToQueue={() => { addToQueue(item.track); toast('Added to queue', 'info'); }}
          onPlayNext={() => { playNext(item.track); toast('Will play next', 'info'); }}
          onToggleFavorite={handleFavoriteClick}
          onDownload={async () => {
            try {
              useDownloadStore.getState().enqueue(item.track);
              toast('Added to download queue', 'info');
            } catch (err) {
              console.error('Download enqueue failed:', err);
            }
          }}
          onAddToBatch={() => {
            useBatchStore.getState().addTrack(item.track);
            toast('Added to Batch Packager', 'success');
          }}
          onGoToArtist={() => navigate(`/artist/${encodeURIComponent(item.track.artist)}`)}
          onGoToAlbum={() => navigate(`/album/${encodeURIComponent(item.track.album)}?artist=${encodeURIComponent(item.track.artist)}`)}
          isFavorite={liked}
          onCreateSimilarPlaylist={handleCreateSimilarPlaylist}
        />
      )}
    </motion.div>
  );
});
QuickPlayGridItem.displayName = 'QuickPlayGridItem';

const TrackScrollRow: React.FC<TrackScrollRowProps> = React.memo(
  ({ tracks, currentTrack, isPlaying, onPlay }) => {
    const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
    return (
      <Box
        sx={{
          display: 'flex',
          gap: `${tokens.spacing.md}px`,
          overflowX: 'auto',
          pb: 1,
          mx: -0.5,
          px: 0.5,
          scrollbarWidth: 'none',
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

      // 5. 3D Parallax Tilt Effect on hover
      const tiltCards = document.querySelectorAll('.gsap-tilt');
      tiltCards.forEach((card) => {
        const el = card as HTMLElement;
        
        el.style.transition = 'transformBorder 0.3s ease, borderColor 0.3s ease, boxShadow 0.3s ease';

        const handleMouseMove = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const width = rect.width;
          const height = rect.height;
          
          const rotateY = ((x - width / 2) / (width / 2)) * 12; // max 12 deg
          const rotateX = -((y - height / 2) / (height / 2)) * 12; // max 12 deg
          
          gsap.to(el, {
            rotateX: rotateX,
            rotateY: rotateY,
            transformPerspective: 800,
            scale: 1.03,
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
      });
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
    if (recentTracks.length > 0) {
      const genres = recentTracks.map(t => t.genre).filter(Boolean);
      if (genres.length > 0) {
        const freq: Record<string, number> = {};
        genres.forEach(g => { freq[g] = (freq[g] || 0) + 1; });
        const topGenre = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
        return `Ready for some ${topGenre}? Here is a mix tailored to your style.`;
      }
    }
    return `Welcome back! Dive into your daily recommendations and vibe playlists.`;
  }, [recentTracks]);

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
          // Ambient Glow Background
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -100,
            left: '10%',
            width: '500px',
            height: '500px',
            background: `radial-gradient(circle, ${alpha(tokens.colors.primary, 0.08)} 0%, transparent 70%)`,
            filter: 'blur(80px)',
            pointerEvents: 'none',
            zIndex: 0,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 100,
            right: '5%',
            width: '400px',
            height: '400px',
            background: `radial-gradient(circle, ${alpha(tokens.colors.accent.pink, 0.05)} 0%, transparent 70%)`,
            filter: 'blur(80px)',
            pointerEvents: 'none',
            zIndex: 0,
          }
        }}
      >
        {/* ─── Dynamic Hero Section ─── */}
        <Box 
          className="gsap-hero relative overflow-hidden rounded-2xl border border-white/5"
          sx={{ 
            minHeight: { xs: 260, md: 340 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            p: { xs: 4, md: 6 },
            position: 'relative',
            mb: 1,
            zIndex: 1,
            background: 'rgba(255, 255, 255, 0.01)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Organic Background Blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="gsap-blob absolute w-64 h-64 rounded-full bg-indigo-600/10 blur-[60px] top-[-20%] left-[10%]" />
            <div className="gsap-blob absolute w-72 h-72 rounded-full bg-purple-600/10 blur-[80px] bottom-[-20%] right-[15%]" />
            <div className="gsap-blob absolute w-48 h-48 rounded-full bg-pink-600/5 blur-[50px] top-[30%] right-[40%]" />
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
                  fontWeight: 850,
                  color: '#fff',
                  letterSpacing: '-0.03em',
                  fontSize: { xs: 28, sm: 36, md: 44 },
                  lineHeight: 1.15,
                  mb: 2,
                  minHeight: { xs: 64, sm: 84, md: 100 }
                }}
              >
                Discover your next favorite song
              </Typography>
              
              <Typography
                variant="body2"
                sx={{
                  color: tokens.colors.textSecondary,
                  fontSize: 14,
                  mb: 3,
                  lineHeight: 1.5,
                }}
              >
                {contextualGreetingSubtitle}
              </Typography>
              
              {featuredTrack && (
                <Button
                  onClick={() => handlePlayTrack(featuredTrack)}
                  variant="contained"
                  startIcon={isPlaying && currentTrack?.id === featuredTrack.id ? <PauseIcon /> : <PlayArrowIcon />}
                  sx={{
                    background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
                    color: '#fff',
                    fontWeight: 700,
                    px: 4,
                    py: 1.5,
                    borderRadius: '24px',
                    textTransform: 'none',
                    boxShadow: `0 4px 20px ${tokens.colors.primary}40`,
                    '&:hover': {
                      boxShadow: `0 8px 30px ${tokens.colors.primary}60`,
                    }
                  }}
                >
                  {isPlaying && currentTrack?.id === featuredTrack.id ? 'Pause Preview' : 'Play Featured Track'}
                </Button>
              )}
            </div>

            {/* Rotating Featured Artwork Card */}
            {featuredTrack && (
              <Box
                className="gsap-tilt shrink-0 self-center md:self-auto"
                sx={{
                  width: { xs: 140, sm: 180, md: 220 },
                  height: { xs: 140, sm: 180, md: 220 },
                  borderRadius: `${tokens.radius['2xl']}px`,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: tokens.colors.surfaceElevated,
                  cursor: 'pointer',
                  '&:hover': {
                    '& .featured-play-overlay': { opacity: 1 },
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

        {/* Filter Pills */}
        <Box className="gsap-hero" sx={{ mt: 1, px: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
            {(['all', 'music', 'vibes'] as const).map((filter) => (
              <Box
                key={filter}
                component="button"
                onClick={() => setActiveFilter(filter)}
                sx={{
                  px: 3,
                  py: 1,
                  borderRadius: '20px',
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                  border: 'none',
                  textTransform: 'capitalize',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  bgcolor: activeFilter === filter ? tokens.colors.primary : 'rgba(255, 255, 255, 0.07)',
                  color: activeFilter === filter ? '#fff' : tokens.colors.textSecondary,
                  '&:hover': {
                    bgcolor: activeFilter === filter ? tokens.colors.primaryLight : 'rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  }
                }}
              >
                {filter}
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
                  xs: 'repeat(1, 1fr)',
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
                  featured={idx === 0}
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
                      minHeight: 100,
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
                py: 8,
                textAlign: 'center',
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: tokens.colors.surface,
                  border: `1px solid ${tokens.colors.surfaceBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                }}
              >
                <MusicNoteIcon sx={{ fontSize: 40, color: tokens.colors.textTertiary }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Start Your Journey
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: tokens.colors.textTertiary, maxWidth: 360, mb: 3 }}
              >
                Search for songs, upload your music, or explore the platform. Your recently played
                tracks and favorites will appear here.
              </Typography>
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={onSearchFocus}
                sx={{
                  bgcolor: tokens.colors.textPrimary,
                  color: tokens.colors.background,
                  fontWeight: 600,
                  px: 3,
                  py: 1.25,
                  borderRadius: `${tokens.radius.xl}px`,
                  textTransform: 'none',
                  '&:hover': { bgcolor: tokens.colors.textSecondary },
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
