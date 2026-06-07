import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
import { alpha } from '@mui/material/styles';
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
} from '@mui/icons-material';
import { tokens } from '../../theme/muiTheme';
import { formatDuration } from '../../utils/formatDuration';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useRecommendationStore } from '../../stores/recommendationStore';
import { Track } from '../../types';

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

const TrackScrollRow: React.FC<TrackScrollRowProps> = React.memo(
  ({ tracks, currentTrack, isPlaying, onPlay }) => {
    const navigate = useNavigate();
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
        {tracks.map((track, idx) => {
          const isActive = currentTrack?.id === track.id;
          return (
            <motion.div
              key={track.id}
              custom={idx}
              variants={trackCardVariants}
              initial="hidden"
              animate="show"
            >
              <Box
                component="button"
                onClick={() => onPlay(track)}
                sx={{
                  flexShrink: 0,
                  width: 150,
                  p: `${tokens.spacing.md}px`,
                  borderRadius: `${tokens.radius.xl}px`,
                  bgcolor: tokens.colors.surface,
                  border: `1px solid ${isActive ? tokens.colors.primary : tokens.colors.surfaceBorder}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: tokens.transitions.normal,
                  '&:hover': {
                    bgcolor: tokens.colors.surfaceVariant,
                    borderColor: tokens.colors.textTertiary,
                    transform: 'scale(1.03)',
                    '& .play-overlay': { opacity: 1 },
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
                  {track.coverArtUrl ? (
                    <Box
                      component="img"
                      src={track.coverArtUrl}
                      alt={`${track.title} cover`}
                      loading="lazy"
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                      bgcolor: 'rgba(0,0,0,0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isActive && isPlaying ? 1 : 0,
                      transition: tokens.transitions.fast,
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
                  sx={{ fontWeight: 600, color: tokens.colors.textPrimary }}
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
                    color: tokens.colors.textTertiary,
                    display: 'block',
                    mt: 0.5,
                    width: 'fit-content',
                    '&:hover': { 
                      color: tokens.colors.primaryLight,
                      textDecoration: 'underline'
                    } 
                  }}
                >
                  {track.artist}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
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

  // ── Recommendations ───────────────────────────────────────────────
  const recSections = useRecommendationStore((s) => s.sections);
  const fetchRecommendations = useRecommendationStore((s) => s.fetchRecommendations);

  // ── Library data ──────────────────────────────────────────────────
  const { getAllTracks, getAllFavorites, getAllPlaylists, getPlaybackHistory } = useLibraryDB();

  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [totalTracks, setTotalTracks] = useState(0);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [totalPlaylists, setTotalPlaylists] = useState(0);
  const [hoursListened, setHoursListened] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tracks, favIds, playlists, history] = await Promise.all([
          getAllTracks(),
          getAllFavorites(),
          getAllPlaylists(),
          getPlaybackHistory(),
        ]);

        setTotalTracks(tracks.length);
        setTotalPlaylists(playlists.length);
        setTotalFavorites(favIds.length);

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

  const handlePlayTrack = useCallback(
    (track: Track) => {
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

  // ═══════════════════════════════════════════════════════════════════
  // ─── Render ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${tokens.spacing['3xl']}px`,
          pb: `${tokens.spacing['3xl']}px`,
          color: tokens.colors.textPrimary,
        }}
      >
        {/* ───────────────────────────────────────────────────────────
            Section 1: Now Playing Hero Banner
            ─────────────────────────────────────────────────────────── */}
        <motion.div variants={fadeUpVariants}>
          <AnimatePresence mode="wait">
            {currentTrack ? (
              /* ── Track is playing: immersive hero ───────────────── */
              <motion.div
                key="now-playing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5 }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: `${tokens.radius['2xl']}px`,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    minHeight: { xs: 240, sm: 260 },
                  }}
                >
                  {/* Blurred background cover art */}
                  {currentTrack.coverArtUrl && (
                    <Box
                      component="img"
                      src={currentTrack.coverArtUrl}
                      alt=""
                      aria-hidden="true"
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'blur(60px) saturate(1.5)',
                        transform: 'scale(1.3)',
                        opacity: 0.5,
                      }}
                    />
                  )}

                  {/* Dark gradient overlay */}
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      background: `linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.8) 100%)`,
                    }}
                  />

                  {/* Content */}
                  <Box
                    sx={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: { xs: `${tokens.spacing.xl}px`, sm: `${tokens.spacing['2xl']}px` },
                      p: { xs: `${tokens.spacing.xl}px`, sm: `${tokens.spacing['2xl']}px`, md: `${tokens.spacing['3xl']}px` },
                    }}
                  >
                    {/* Album art */}
                    <Box
                      sx={{
                        width: { xs: 120, sm: 150, md: 180 },
                        height: { xs: 120, sm: 150, md: 180 },
                        borderRadius: `${tokens.radius.xl}px`,
                        overflow: 'hidden',
                        bgcolor: tokens.colors.surfaceElevated,
                        flexShrink: 0,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      }}
                    >
                      {currentTrack.coverArtUrl ? (
                        <Box
                          component="img"
                          src={currentTrack.coverArtUrl}
                          alt={`${currentTrack.title} album art`}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: tokens.colors.surfaceElevated,
                          }}
                        >
                          <MusicNoteIcon sx={{ fontSize: 48, color: tokens.colors.textTertiary }} />
                        </Box>
                      )}
                    </Box>

                    {/* Track info + controls */}
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: tokens.colors.primaryLight,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.15em',
                          fontSize: 10,
                        }}
                      >
                        Now Playing
                      </Typography>
                      <Typography
                        variant="h3"
                        noWrap
                        sx={{
                          fontWeight: 700,
                          color: tokens.colors.textPrimary,
                          fontSize: { xs: tokens.typography.h5.size, sm: tokens.typography.h4.size, md: tokens.typography.h3.size },
                        }}
                      >
                        {currentTrack.title}
                      </Typography>
                      <Typography variant="body1" sx={{ color: tokens.colors.textSecondary }}>
                        {currentTrack.artist}
                      </Typography>
                      {currentTrack.album && (
                        <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
                          {currentTrack.album}
                          {currentTrack.duration > 0 && ` · ${formatDuration(currentTrack.duration)}`}
                        </Typography>
                      )}

                      {/* Transport controls */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <Tooltip title="Previous track">
                          <IconButton
                            aria-label="Previous track"
                            onClick={() => prevTrack()}
                            sx={{ color: tokens.colors.textSecondary, '&:hover': { color: tokens.colors.textPrimary } }}
                          >
                            <SkipPreviousIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
                          <IconButton
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                            onClick={() => setPlaying(!isPlaying)}
                            sx={{
                              bgcolor: tokens.colors.textPrimary,
                              color: tokens.colors.background,
                              width: 48,
                              height: 48,
                              '&:hover': { bgcolor: tokens.colors.textSecondary },
                            }}
                          >
                            {isPlaying ? <PauseIcon sx={{ fontSize: 28 }} /> : <PlayArrowIcon sx={{ fontSize: 28 }} />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Next track">
                          <IconButton
                            aria-label="Next track"
                            onClick={() => nextTrack(true)}
                            sx={{ color: tokens.colors.textSecondary, '&:hover': { color: tokens.colors.textPrimary } }}
                          >
                            <SkipNextIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      {/* Compact progress bar */}
                      <Box sx={{ mt: 1, maxWidth: 400 }}>
                        <LinearProgress
                          variant="determinate"
                          value={isPlaying ? 33 : 0}
                          sx={{
                            height: 3,
                            borderRadius: tokens.radius.full,
                            bgcolor: alpha(tokens.colors.textPrimary, 0.1),
                            '& .MuiLinearProgress-bar': {
                              bgcolor: tokens.colors.primary,
                              borderRadius: tokens.radius.full,
                            },
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            ) : (
              /* ── Nothing playing: discover hero ────────────────── */
              <motion.div
                key="discover"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5 }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: `${tokens.radius['2xl']}px`,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    background: `linear-gradient(135deg, ${tokens.colors.surface} 0%, ${alpha(tokens.colors.primaryDark, 0.15)} 50%, ${tokens.colors.surface} 100%)`,
                    p: { xs: `${tokens.spacing['2xl']}px`, sm: `${tokens.spacing['3xl']}px` },
                  }}
                >
                  {/* Decorative pattern */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: 240,
                      height: 240,
                      opacity: 0.04,
                      backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}
                  />

                  <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 500 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: tokens.colors.primaryLight,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.2em',
                        fontSize: 10,
                        mb: 1,
                        display: 'block',
                      }}
                    >
                      {greeting}
                    </Typography>
                    <Typography
                      variant="h2"
                      sx={{
                        fontWeight: 800,
                        fontSize: { xs: tokens.typography.h4.size, sm: tokens.typography.h3.size, md: tokens.typography.h2.size },
                        mb: 1.5,
                        lineHeight: 1.1,
                        background: `linear-gradient(to right, ${tokens.colors.textPrimary}, ${tokens.colors.primaryLight})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      Discover your next favorite song
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ color: tokens.colors.textSecondary, mb: 3, maxWidth: 400 }}
                    >
                      Search, stream, and enjoy your personal music collection.
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
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ───────────────────────────────────────────────────────────
            Section 2: Quick Stats Row
            ─────────────────────────────────────────────────────────── */}
        <Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(4, 1fr)',
              },
              gap: `${tokens.spacing.md}px`,
            }}
          >
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                custom={idx}
                variants={statCardVariants}
                initial="hidden"
                animate="show"
              >
                <Card
                  sx={{
                    background: stat.gradient,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    transition: tokens.transitions.normal,
                    '&:hover': {
                      borderColor: alpha(stat.color, 0.4),
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent sx={{ p: `${tokens.spacing.xl}px !important` }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box sx={{ color: stat.color, display: 'flex' }}>
                        {React.cloneElement(stat.icon, { sx: { fontSize: 20 } })}
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: tokens.colors.textTertiary,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          fontSize: 10,
                        }}
                      >
                        {stat.label}
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: tokens.colors.textPrimary }}>
                      {stat.value}
                    </Typography>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </Box>
        </Box>

        {/* ───────────────────────────────────────────────────────────
            Section 3: Recently Played
            ─────────────────────────────────────────────────────────── */}
        {recentTracks.length > 0 && (
          <motion.div variants={fadeUpVariants}>
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
            Section 4: Your Favorites
            ─────────────────────────────────────────────────────────── */}
        {favoriteTracks.length > 0 && (
          <motion.div variants={fadeUpVariants}>
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
            Section 4.5: Recommendation Sections
            ─────────────────────────────────────────────────────────── */}
        {recSections.map((section) => (
          <motion.div variants={fadeUpVariants} key={section.id}>
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
        <motion.div variants={fadeUpVariants}>
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
                  onClick={action.onClick}
                  sx={{
                    width: '100%',
                    p: `${tokens.spacing.xl}px`,
                    borderRadius: `${tokens.radius.xl}px`,
                    background: action.gradient,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: `${tokens.spacing.sm}px`,
                    transition: tokens.transitions.normal,
                    color: tokens.colors.textPrimary,
                    '&:hover': {
                      borderColor: tokens.colors.textTertiary,
                      transform: 'translateY(-2px)',
                    },
                    '&:active': {
                      transform: 'scale(0.97)',
                    },
                  }}
                >
                  <Box sx={{ color: tokens.colors.primaryLight, display: 'flex' }}>
                    {action.icon}
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.colors.textPrimary }}>
                    {action.label}
                  </Typography>
                </Box>
              </motion.div>
            ))}
          </Box>
        </motion.div>

        {/* ───────────────────────────────────────────────────────────
            Section 6: Genre Explorer
            ─────────────────────────────────────────────────────────── */}
        <motion.div variants={fadeUpVariants}>
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
                    minHeight: 90,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    transition: tokens.transitions.normal,
                    '&:hover': {
                      transform: 'scale(1.03)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    },
                    '&:active': {
                      transform: 'scale(0.98)',
                    },
                  }}
                >
                  {/* Subtle pattern overlay */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -10,
                      right: -10,
                      opacity: 0.1,
                    }}
                  >
                    <MusicNoteIcon sx={{ fontSize: 80 }} />
                  </Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      color: '#fff',
                      position: 'relative',
                      zIndex: 1,
                      textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    }}
                  >
                    {genre.name}
                  </Typography>
                </Box>
              </motion.div>
            ))}
          </Box>
        </motion.div>

        {/* ───────────────────────────────────────────────────────────
            Empty State (no history or favorites)
            ─────────────────────────────────────────────────────────── */}
        {recentTracks.length === 0 && favoriteTracks.length === 0 && (
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
