import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Search as SearchIcon, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { Track } from '../../types';
import { TrackCard } from './TrackCard';
import { api } from '../../utils/api';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { Virtuoso } from 'react-virtuoso';
import { Box, Typography, Button, FormControl, Select, MenuItem, InputLabel } from '@mui/material';
import { tokens } from '../../theme/muiTheme';
import { useGsapFadeIn } from '../../hooks/useGsap';

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
        ? 'bg-white text-black border-white shadow-md'
        : 'bg-transparent border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
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
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white cursor-pointer"
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
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, textAlign: 'center' }}>
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', bg: 'neutral.900', border: `1px solid ${tokens.colors.surfaceBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
            <SearchIcon size={32} color={tokens.colors.textTertiary} />
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: tokens.colors.textPrimary }}>
            Search the World of Music
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.colors.textSecondary, maxWidth: 360 }}>
            Enter a track title, artist name, or album to stream and download music instantly.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SearchResults;
