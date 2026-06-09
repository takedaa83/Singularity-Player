import React, { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, SlidersHorizontal, ArrowUpDown, Compass, TrendingUp, Radio, Sparkles, Music, Play, Heart, Users } from 'lucide-react';
import { Track } from '../../types';
import { TrackCard } from './TrackCard';
import { api } from '../../utils/api';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { Virtuoso } from 'react-virtuoso';
import { Box, Typography, Button, Card, CardContent } from '@mui/material';
import { tokens, alpha } from '../../theme/muiTheme';
import { useGsapFadeIn } from '../../hooks/useGsap';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { usePlayerStore } from '../../stores/playerStore';
import { useToast } from '../../hooks/useToast';
import { recommendationEngine } from '../../services/recommendationEngine';
import { PlaylistGenerator, VibeType, VIBE_CONFIGS } from '../../services/playlistGenerator';
import { useDownloadStore } from '../../stores/downloadStore';
import { useBatchStore } from '../../stores/batchStore';

interface SearchResultsProps {
  query: string;
  refreshTrigger: () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Search failed');
  }
  return res.json();
};

export const SearchResults: React.FC<SearchResultsProps> = ({ query, refreshTrigger }) => {
  const navigate = useNavigate();
  const { getAllTracks } = useLibraryDB();
  const { toast } = useToast();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);

  // Redirect to Home Page if no query is active (replacing Explore tab concepts)
  useEffect(() => {
    if (!query) {
      navigate('/');
    }
  }, [query, navigate]);

  // Algorithmic Discovery Handlers
  const handlePlayDiscoverWeekly = useCallback(async () => {
    toast('Curating your Discover Weekly mix...', 'info');
    try {
      const recs = await recommendationEngine.getSmartRecommendations();
      if (recs && recs.length > 0) {
        setQueue(recs, 0);
        toast(`Playing your Discover Weekly! (${recs.length} tracks)`, 'success');
      } else {
        toast('No local recommendations yet. Loading top trending hits...', 'info');
        const trendingTracks = await api.search('Trending Hits');
        if (trendingTracks && trendingTracks.length > 0) {
          const mapped = trendingTracks.map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album || 'Single',
            genre: '',
            year: null,
            trackNumber: null,
            duration: item.duration || 0,
            bitrate: item.bitrate || null,
            sampleRate: null,
            fileSize: 0,
            mimeType: item.source === 'youtube' ? 'audio/mp4' : 'audio/mpeg',
            coverArtUrl: item.coverArtUrl || null,
            source: item.source || 'deezer',
            streamUrl: item.streamUrl || item.previewUrl || '',
            filePath: null,
            addedAt: Date.now(),
            videoId: item.videoId || undefined,
          }));
          setQueue(mapped, 0);
          toast(`Playing Trending Hits Mix! (${mapped.length} tracks)`, 'success');
        } else {
          toast('Could not curate mix. Try searching for your favorite song!', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      toast('Failed to curate Discover Weekly', 'error');
    }
  }, [setQueue, toast]);

  const handlePlayDailyMix = useCallback(async (vibe: VibeType) => {
    toast(`Curating Daily Mix (${vibe})...`, 'info');
    try {
      const playlist = await PlaylistGenerator.generateVibePlaylist(vibe);
      if (!playlist || playlist.trackIds.length === 0) {
        toast(`Could not curate ${vibe} mix. Add more tracks to library first!`, 'error');
        return;
      }
      const allTracks = await getAllTracks();
      const playlistTracks = playlist.trackIds
        .map(id => allTracks.find(t => t.id === id))
        .filter((t): t is Track => !!t);

      if (playlistTracks.length > 0) {
        setQueue(playlistTracks, 0);
        toast(`Playing Daily Mix: ${vibe}!`, 'success');
      } else {
        toast('Could not load Daily Mix tracks.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Failed to generate Daily Mix', 'error');
    }
  }, [getAllTracks, setQueue, toast]);

  const handlePlayReleaseRadar = useCallback(async () => {
    toast('Loading Release Radar...', 'info');
    try {
      const allTracks = await getAllTracks();
      const sorted = [...allTracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 15);
      if (sorted.length > 0) {
        setQueue(sorted, 0);
        toast(`Playing Release Radar! (${sorted.length} new tracks)`, 'success');
      } else {
        toast('Library is empty. Fetching new releases online...', 'info');
        const results = await api.search('New releases music 2026');
        if (results && results.length > 0) {
          const mapped = results.map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album || 'Single',
            genre: '',
            year: null,
            trackNumber: null,
            duration: item.duration || 0,
            bitrate: item.bitrate || null,
            sampleRate: null,
            fileSize: 0,
            mimeType: item.source === 'youtube' ? 'audio/mp4' : 'audio/mpeg',
            coverArtUrl: item.coverArtUrl || null,
            source: item.source || 'deezer',
            streamUrl: item.streamUrl || item.previewUrl || '',
            filePath: null,
            addedAt: Date.now(),
            videoId: item.videoId || undefined,
          }));
          setQueue(mapped, 0);
          toast(`Playing New Releases Mix!`, 'success');
        } else {
          toast('Could not load new releases. Try searching!', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load Release Radar', 'error');
    }
  }, [getAllTracks, setQueue, toast]);

  const handlePlayTrendingTrack = useCallback(async (title: string, artist: string) => {
    toast(`Searching & playing "${title}"...`, 'info');
    try {
      const results = await api.search(`${title} ${artist}`);
      if (results && results.length > 0) {
        const firstTrack: Track = {
          id: results[0].id,
          title: results[0].title,
          artist: results[0].artist,
          album: results[0].album || 'Single',
          genre: '',
          year: null,
          trackNumber: null,
          duration: results[0].duration || 0,
          bitrate: results[0].bitrate || null,
          sampleRate: null,
          fileSize: 0,
          mimeType: results[0].source === 'youtube' ? 'audio/mp4' : 'audio/mpeg',
          coverArtUrl: results[0].coverArtUrl || null,
          source: results[0].source || 'deezer',
          streamUrl: results[0].streamUrl || results[0].previewUrl || '',
          filePath: null,
          addedAt: Date.now(),
          videoId: results[0].videoId || undefined,
        };
        playTrack(firstTrack, [firstTrack]);
        toast(`Playing "${title}" by ${artist}!`, 'success');
      } else {
        toast('Could not stream trending track.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Failed to play trending track', 'error');
    }
  }, [playTrack, toast]);

  const handleGenreClick = useCallback((genre: string) => {
    navigate(`/search?q=${encodeURIComponent(genre)}`);
  }, [navigate]);

  const vibes = useMemo(() => [
    { name: 'Chill' as VibeType, color: VIBE_CONFIGS.Chill.color, desc: VIBE_CONFIGS.Chill.description },
    { name: 'Focus' as VibeType, color: VIBE_CONFIGS.Focus.color, desc: VIBE_CONFIGS.Focus.description },
    { name: 'Workout' as VibeType, color: VIBE_CONFIGS.Workout.color, desc: VIBE_CONFIGS.Workout.description },
    { name: 'Party' as VibeType, color: VIBE_CONFIGS.Party.color, desc: VIBE_CONFIGS.Party.description },
    { name: 'Late Night' as VibeType, color: VIBE_CONFIGS['Late Night'].color, desc: VIBE_CONFIGS['Late Night'].description },
  ], []);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<'all' | 'youtube' | 'deezer' | 'itunes'>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'title' | 'artist' | 'duration'>('relevance');

  // SWR Caching: keeps query data cached in-memory and de-duplicates network calls
  const { data, error, isValidating } = useSWR(
    query ? `${api.baseUrl}/api/search?q=${encodeURIComponent(query)}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30s dedup
    }
  );

  const results = useMemo<Track[]>(() => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || 'Single',
      genre: '',
      year: null,
      trackNumber: null,
      duration: item.duration || 0,
      bitrate: item.bitrate || null,
      sampleRate: null,
      fileSize: 0,
      mimeType: item.source === 'youtube' ? 'audio/mp4' : 'audio/mpeg',
      coverArtUrl: item.coverArtUrl || null,
      source: item.source || 'deezer',
      streamUrl: item.streamUrl || item.previewUrl || '',
      filePath: null,
      addedAt: Date.now(),
      videoId: item.videoId || undefined,
    }));
  }, [data]);

  // Apply filters and sorting
  const processedTracks = useMemo(() => {
    let list = [...results];

    // Source filter
    if (sourceFilter !== 'all') {
      list = list.filter((t) => t.source === sourceFilter);
    }

    // Sorting
    if (sortBy === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'artist') {
      list.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (sortBy === 'duration') {
      list.sort((a, b) => a.duration - b.duration);
    }

    return list;
  }, [results, sourceFilter, sortBy]);

  // Apply staggered fade-in entrance for visible search results
  useGsapFadeIn('.search-result-item', processedTracks);

  // Auto-prefetch top 1 YouTube track from search results to eliminate latency on play
  React.useEffect(() => {
    const topYtTracks = processedTracks
      .filter((t) => t.source === 'youtube' && t.videoId)
      .slice(0, 1);
    if (topYtTracks.length > 0) {
      const videoIds = topYtTracks.map((t) => t.videoId!);
      fetch(`${api.baseUrl}/api/yt/prefetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds })
      }).catch(() => {});
    }
  }, [processedTracks]);

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
      active
        ? 'bg-accent text-bg-primary border-accent shadow-md'
        : 'bg-transparent border-border-primary text-text-tertiary hover:text-text-primary hover:border-text-tertiary'
    }`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
      {/* Search Header */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <SearchIcon size={20} color={tokens.colors.textPrimary} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
            {query ? `Results for "${query}"` : 'Discover Music'}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
          {query ? `${processedTracks.length} tracks found from YouTube, Deezer & iTunes` : 'Search to find and stream music instantly'}
        </Typography>
      </Box>

      {query && (
        <>
          {/* Filters and Sorting Row */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, borderBottom: `1px solid ${tokens.colors.surfaceBorder}`, pb: 2 }}>
            {/* Source Filters */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SlidersHorizontal size={14} color={tokens.colors.textTertiary} />
              <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, mr: 1 }}>Source:</Typography>
              <button onClick={() => setSourceFilter('all')} className={filterBtnClass(sourceFilter === 'all')}>All</button>
              <button onClick={() => setSourceFilter('youtube')} className={filterBtnClass(sourceFilter === 'youtube')}>YouTube</button>
              <button onClick={() => setSourceFilter('deezer')} className={filterBtnClass(sourceFilter === 'deezer')}>Deezer</button>
              <button onClick={() => setSourceFilter('itunes')} className={filterBtnClass(sourceFilter === 'itunes')}>iTunes</button>
            </Box>

            {/* Sorting select */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <ArrowUpDown size={14} color={tokens.colors.textTertiary} />
              <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, mr: 1 }}>Sort:</Typography>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                <option value="relevance">Relevance</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="duration">Duration</option>
              </select>
            </Box>
          </Box>

          {/* Results List */}
          {isValidating && results.length === 0 ? (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <LoadingSkeleton count={8} variant="track" />
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', py: 10 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.error }}>
                Failed to retrieve search results. Check network connection.
              </Typography>
            </Box>
          ) : processedTracks.length === 0 ? (
            <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.textSecondary }}>
                No tracks found. Try adjusting your query or filters.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <Virtuoso
                style={{ height: '100%' }}
                data={processedTracks}
                itemContent={(index, track) => (
                  <Box className="search-result-item" sx={{ pb: 1 }}>
                    <TrackCard
                      track={track}
                      refreshTrigger={refreshTrigger}
                    />
                  </Box>
                )}
              />
            </Box>
          )}
        </>
      )}

      {!query && (
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            pr: 1,
            pb: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: tokens.colors.surfaceBorder,
              borderRadius: '3px',
            },
          }}
        >
          {/* Spotlight Hero Section */}
          <Box
            sx={{
              position: 'relative',
              borderRadius: `${tokens.radius['2xl']}px`,
              overflow: 'hidden',
              background: `linear-gradient(135deg, ${alpha(tokens.colors.primary, 0.2)}, ${alpha(tokens.colors.accent.pink, 0.05)})`,
              border: `1px solid ${tokens.colors.surfaceBorder}`,
              p: { xs: 3, md: 5 },
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(20px)',
              transition: 'all 0.4s ease',
              '&:hover': {
                borderColor: alpha(tokens.colors.primary, 0.4),
                boxShadow: `0 12px 40px ${tokens.colors.primary}20`,
              }
            }}
          >
            {/* Background Glow */}
            <Box
              sx={{
                position: 'absolute',
                top: '-50%',
                left: '-20%',
                width: '60%',
                height: '100%',
                background: `radial-gradient(circle, ${tokens.colors.primary}15, transparent 70%)`,
                pointerEvents: 'none',
              }}
            />
            
            <Box sx={{ flex: 1, zIndex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Sparkles size={16} color={tokens.colors.accent.pink} />
                <Typography variant="caption" sx={{ color: tokens.colors.accent.pink, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Spotlight Broadcast
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em', color: tokens.colors.textPrimary, fontSize: { xs: '2rem', md: '2.5rem' } }}>
                The Weeknd: After Hours
              </Typography>
              <Typography variant="body1" sx={{ color: tokens.colors.textSecondary, mb: 3, maxWidth: 500, lineHeight: 1.6 }}>
                Experience the cinematic universe of his chart-topping masterpiece. Play his definitive hits and explore behind-the-scenes vibes.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => handlePlayTrendingTrack("Blinding Lights", "The Weeknd")}
                  sx={{
                    background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
                    color: '#fff',
                    fontWeight: 700,
                    px: 3,
                    py: 1,
                    borderRadius: '12px',
                    textTransform: 'none',
                    boxShadow: `0 4px 14px ${tokens.colors.primary}45`,
                    '&:hover': {
                      transform: 'scale(1.02)',
                    }
                  }}
                >
                  Stream Now
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => handleGenreClick("The Weeknd")}
                  sx={{
                    borderColor: tokens.colors.surfaceBorder,
                    color: tokens.colors.textPrimary,
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: '12px',
                    textTransform: 'none',
                    '&:hover': {
                      borderColor: tokens.colors.textSecondary,
                      bgcolor: 'rgba(255, 255, 255, 0.05)',
                    }
                  }}
                >
                  Explore Discography
                </Button>
              </Box>
            </Box>
            
            <Box
              sx={{
                width: { xs: '100%', md: 240 },
                height: 240,
                borderRadius: `${tokens.radius.xl}px`,
                overflow: 'hidden',
                boxShadow: '0 12px 24px rgba(0,0,0,0.5)',
                position: 'relative',
                flexShrink: 0,
                zIndex: 1,
              }}
            >
              <Box
                component="img"
                src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop"
                alt="Spotlight"
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  p: 2,
                }}
              >
                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600 }}>
                  Featured Visual Concept
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* 1. Personalized Recommendations ("For You" Feed) */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Compass size={20} color={tokens.colors.primary} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                Made For You
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
                gap: 2.5,
              }}
            >
              {/* Discover Weekly */}
              <Card
                onClick={handlePlayDiscoverWeekly}
                sx={{
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  borderRadius: `${tokens.radius.xl}px`,
                  cursor: 'pointer',
                  border: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 24px rgba(168, 85, 247, 0.35)',
                    '& .play-icon-overlay': { opacity: 1, transform: 'scale(1)' }
                  }
                }}
              >
                <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160, position: 'relative' }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1 }}>
                      Discover Weekly
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, lineHeight: 1.5, maxWidth: '80%' }}>
                      Your custom mixtape of smart recommendations matching your exact listening style.
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                    UPDATES EVERY WEEK
                  </Typography>
                  
                  {/* Hover play button */}
                  <Box
                    className="play-icon-overlay"
                    sx={{
                      position: 'absolute',
                      right: 20,
                      bottom: 20,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transform: 'scale(0.8)',
                      transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}
                  >
                    <Play size={20} fill={tokens.colors.primary} color={tokens.colors.primary} style={{ marginLeft: 3 }} />
                  </Box>
                </CardContent>
              </Card>

              {/* Daily Mix */}
              <Card
                onClick={() => handlePlayDailyMix('Chill')}
                sx={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                  borderRadius: `${tokens.radius.xl}px`,
                  cursor: 'pointer',
                  border: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 24px rgba(59, 130, 246, 0.35)',
                    '& .play-icon-overlay': { opacity: 1, transform: 'scale(1)' }
                  }
                }}
              >
                <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160, position: 'relative' }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1 }}>
                      Daily Mix
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, lineHeight: 1.5, maxWidth: '80%' }}>
                      Relaxed vibes & acoustic favorites blended to ease your mind and flow seamlessly.
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                    FRESH DAILY
                  </Typography>

                  {/* Hover play button */}
                  <Box
                    className="play-icon-overlay"
                    sx={{
                      position: 'absolute',
                      right: 20,
                      bottom: 20,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transform: 'scale(0.8)',
                      transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}
                  >
                    <Play size={20} fill="#0284c7" color="#0284c7" style={{ marginLeft: 3 }} />
                  </Box>
                </CardContent>
              </Card>

              {/* Release Radar */}
              <Card
                onClick={handlePlayReleaseRadar}
                sx={{
                  background: 'linear-gradient(135deg, #10b981 0%, #f59e0b 100%)',
                  borderRadius: `${tokens.radius.xl}px`,
                  cursor: 'pointer',
                  border: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 24px rgba(16, 185, 129, 0.35)',
                    '& .play-icon-overlay': { opacity: 1, transform: 'scale(1)' }
                  }
                }}
              >
                <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160, position: 'relative' }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1 }}>
                      Release Radar
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, lineHeight: 1.5, maxWidth: '80%' }}>
                      Catch the freshest arrivals and trending singles added online this week.
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                    NEW MUSIC FRIDAY
                  </Typography>

                  {/* Hover play button */}
                  <Box
                    className="play-icon-overlay"
                    sx={{
                      position: 'absolute',
                      right: 20,
                      bottom: 20,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transform: 'scale(0.8)',
                      transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}
                  >
                    <Play size={20} fill="#059669" color="#059669" style={{ marginLeft: 3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* 2. Vibe & Mood Mixes */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Radio size={20} color={tokens.colors.accent.amber} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                Curated Mood Vibes
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                pb: 1.5,
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' }
              }}
            >
              {vibes.map((v) => (
                <Box
                  key={v.name}
                  onClick={() => handlePlayDailyMix(v.name)}
                  sx={{
                    flexShrink: 0,
                    width: 200,
                    p: 2.5,
                    borderRadius: `${tokens.radius.xl}px`,
                    background: tokens.colors.surface,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    position: 'relative',
                    '&:hover': {
                      bgcolor: tokens.colors.surfaceVariant,
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      borderColor: alpha(tokens.colors.textSecondary, 0.2),
                      '& .vibe-play': { opacity: 1, transform: 'scale(1)' }
                    }
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: `${tokens.radius.lg}px`,
                      background: v.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2,
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  >
                    <Sparkles size={32} color="#fff" />
                    
                    {/* Hover Play Button */}
                    <Box
                      className="vibe-play"
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: 'rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: `${tokens.radius.lg}px`,
                        opacity: 0,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#fff', display: 'flex', alignItems: 'center', justify: 'center' }}>
                        <Play size={18} fill="#000" color="#000" style={{ margin: 'auto', marginLeft: 12 }} />
                      </Box>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.colors.textPrimary, mb: 0.5 }}>
                    {v.name} Mix
                  </Typography>
                  <Typography variant="caption" sx={{ color: tokens.colors.textSecondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 32, fontSize: 10.5, lineHeight: 1.4 }}>
                    {v.desc}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* 3. Trending & Friends Activity Split */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            {/* Trending Now */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 2 }}>
                <TrendingUp size={20} color={tokens.colors.accent.pink} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                  Trending Now
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[
                  { rank: 1, title: 'Blinding Lights', artist: 'The Weeknd', plays: '4.1B plays', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop' },
                  { rank: 2, title: 'Shape of You', artist: 'Ed Sheeran', plays: '3.8B plays', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=100&auto=format&fit=crop' },
                  { rank: 3, title: 'Starboy', artist: 'The Weeknd', plays: '3.2B plays', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=100&auto=format&fit=crop' },
                  { rank: 4, title: 'As It Was', artist: 'Harry Styles', plays: '2.9B plays', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=100&auto=format&fit=crop' },
                  { rank: 5, title: 'Flowers', artist: 'Miley Cyrus', plays: '2.1B plays', img: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=100&auto=format&fit=crop' },
                ].map((track) => (
                  <Box
                    key={track.rank}
                    onClick={() => handlePlayTrendingTrack(track.title, track.artist)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      p: 1.5,
                      borderRadius: `${tokens.radius.lg}px`,
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.04)',
                        transform: 'translateX(4px)',
                        '& .rank-num': { color: tokens.colors.primary }
                      }
                    }}
                  >
                    <Typography className="rank-num" variant="body1" sx={{ fontWeight: 800, width: 24, color: tokens.colors.textTertiary, transition: 'colors 0.2s' }}>
                      {track.rank}
                    </Typography>
                    <Box
                      component="img"
                      src={track.img}
                      alt={track.title}
                      sx={{ width: 44, height: 44, borderRadius: '8px', objectFit: 'cover', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                        {track.title}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ color: tokens.colors.textSecondary, display: 'block' }}>
                        {track.artist}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, fontWeight: 500 }}>
                      {track.plays}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Friends Listening Panel (Social) */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 2 }}>
                <Users size={20} color={tokens.colors.accent.cyan} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                  Friend Activity
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  p: 3,
                  bgcolor: tokens.colors.surface,
                  border: `1px solid ${tokens.colors.surfaceBorder}`,
                  borderRadius: `${tokens.radius.xl}px`,
                  minHeight: 240,
                }}
              >
                {[
                  { name: 'Sarah Miller', track: 'Blinding Lights', artist: 'The Weeknd', time: '2m ago', active: true },
                  { name: 'Alex Cooper', track: 'Starboy', artist: 'The Weeknd', time: '10m ago', active: true },
                  { name: 'Emma Watson', track: 'As It Was', artist: 'Harry Styles', time: '1h ago', active: false },
                ].map((friend, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ position: 'relative' }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '50%',
                          bgcolor: `hsl(${(idx * 130) % 360}, 60%, 50%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          color: '#fff',
                          fontSize: 13,
                        }}
                      >
                        {friend.name.charAt(0)}
                      </Box>
                      {friend.active && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: tokens.colors.accent.emerald,
                            border: `2px solid ${tokens.colors.surface}`,
                          }}
                        />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }} noWrap>
                          {friend.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, fontSize: 9 }}>
                          {friend.time}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: tokens.colors.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }} noWrap>
                        <Music size={10} color={tokens.colors.primary} />
                        {friend.track} • {friend.artist}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* 4. Browse Genres Grid */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Compass size={20} color={tokens.colors.primary} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: tokens.colors.textPrimary }}>
                Browse All Genres
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 2.5,
              }}
            >
              {[
                { name: 'Pop', color: 'linear-gradient(135deg, #ec4899, #f43f5e)' },
                { name: 'Hip-Hop', color: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
                { name: 'Rock', color: 'linear-gradient(135deg, #b91c1c, #d97706)' },
                { name: 'Electronic', color: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
                { name: 'Lo-Fi', color: 'linear-gradient(135deg, #8b5cf6, #d946ef)' },
                { name: 'Jazz', color: 'linear-gradient(135deg, #10b981, #06b6d4)' },
                { name: 'Classical', color: 'linear-gradient(135deg, #6b7280, #374151)' },
                { name: 'Indie', color: 'linear-gradient(135deg, #6366f1, #10b981)' },
              ].map((genre) => (
                <Box
                  key={genre.name}
                  onClick={() => handleGenreClick(genre.name)}
                  sx={{
                    height: 120,
                    borderRadius: `${tokens.radius.xl}px`,
                    background: genre.color,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    p: 2.5,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    '&:hover': {
                      transform: 'scale(1.04) translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                      '& .genre-icon': { transform: 'rotate(12deg) scale(1.15)' }
                    }
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                    {genre.name}
                  </Typography>
                  <Music
                    className="genre-icon"
                    size={64}
                    color="rgba(255,255,255,0.15)"
                    style={{
                      position: 'absolute',
                      bottom: -15,
                      right: -15,
                      transition: 'transform 0.4s ease'
                    }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default SearchResults;
