import React, { useEffect, useState, memo } from 'react';
import { Play, Pause, Heart, Plus, Download, Trash2, Music, Radio } from 'lucide-react';
import { Track } from '../../types';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useToast } from '../../hooks/useToast';
import { useDownloadStore } from '../../stores/downloadStore';
import { useNavigate } from 'react-router-dom';
import { TrackContextMenu } from '../ui/TrackContextMenu';
import { useBatchStore } from '../../stores/batchStore';
import { api } from '../../utils/api';
import { formatDuration } from '../../utils/formatDuration';
import { PlaylistGenerator } from '../../services/playlistGenerator';
import { useGsapHover } from '../../hooks/useGsap';

interface TrackCardProps {
  track: Track;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onDeleteSuccess?: () => void;
  refreshTrigger?: () => void;
}

export const TrackCard: React.FC<TrackCardProps> = memo(({
  track,
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onDeleteSuccess,
  refreshTrigger
}) => {
  const { currentTrack, isPlaying, playTrack, addToQueue, favorites, setQueue } = usePlayerStore();
  const { toggleFavorite, deleteTrack, getAllTracks } = useLibraryDB();
  const { toast } = useToast();
  const navigate = useNavigate();

  const cardRef = useGsapHover<HTMLDivElement>(1.015, -1);
  const [downloading, setDownloading] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const isCurrent = currentTrack?.id === track.id;
  const liked = favorites?.includes(track.id) || false;

  const prefetchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, []);

  const handlePlayClick = () => {
    if (isCurrent) {
      usePlayerStore.getState().setPlaying(!isPlaying);
    } else {
      playTrack(track);
    }
  };

  const handleFavoriteClick = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const nextState = await toggleFavorite(track.id);
      toast(nextState ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
    if (refreshTrigger) refreshTrigger();
  };

  const handleCreateSimilarPlaylist = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      toast(`Generating song radio for "${track.title}"...`, 'info');
      const similarTracks = await PlaylistGenerator.generateSimilarTracks(track);
      
      if (similarTracks && similarTracks.length > 0) {
        setQueue(similarTracks, 0);
        toast(`Playing "${track.title}" Radio! (${similarTracks.length} tracks)`, 'success');
      } else {
        toast('Could not find similar tracks.', 'error');
      }
    } catch (err) {
      console.error('Failed to generate similar queue:', err);
      toast('Failed to generate similar queue', 'error');
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      useDownloadStore.getState().enqueue(track);
      toast('Added to download queue', 'info');
    } catch (err) {
      console.error('Download enqueue failed:', err);
    }
  };

  const handleDeleteClick = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm(`Remove "${track.title}" from your library?`)) {
      await deleteTrack(track.id);
      if (onDeleteSuccess) onDeleteSuccess();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ top: e.clientY, left: e.clientX });
  };

  const handleAddToBatch = () => {
    const batchStore = useBatchStore.getState();
    batchStore.addTrack(track);
    toast('Added to Batch Packager', 'success');
  };

  const handleMouseEnter = () => {
    if (track.source === 'youtube' && track.videoId) {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
      prefetchTimeoutRef.current = setTimeout(() => {
        fetch(`${api.baseUrl}/api/yt/prefetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoIds: [track.videoId] })
        }).catch(() => {});
      }, 150); // 150ms debounce
    }
  };

  const handleMouseLeave = () => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
  };



  // Source badge label
  const getSourceLabel = () => {
    switch (track.source) {
      case 'youtube': return 'YT';
      case 'deezer': return 'DZ';
      case 'itunes': return 'IT';
      case 'local': return 'LOCAL';
      case 'demo': return 'DEMO';
      default: return (track.source as string).toUpperCase();
    }
  };

  return (
    <div 
      ref={cardRef}
      onClick={isMultiSelectMode ? onToggleSelect : handlePlayClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer border select-none ${
        isCurrent 
          ? 'bg-white/10 border-white/30' 
          : isSelected
            ? 'bg-white/8 border-white/20'
            : 'bg-transparent border-neutral-800'
      }`}
    >
      {/* 1. Track Info (Art + Title/Artist) */}
      <div className="flex items-center gap-4 truncate flex-1">
        {/* Multi-select Checkbox OR Play indicator */}
        {isMultiSelectMode ? (
          <div 
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
              isSelected 
                ? 'bg-white border-white text-black' 
                : 'border-neutral-600 hover:border-white'
            }`}
          >
            {isSelected && <span className="text-[10px] font-bold">✓</span>}
          </div>
        ) : (
          <div className="w-6 text-center text-xs text-neutral-500 group-hover:hidden">
            {isCurrent && isPlaying ? (
              <div className="flex justify-center items-end gap-0.5 h-3.5 w-6">
                <span className="w-0.5 h-3 bg-white animate-[pulse_1s_infinite_alternate]" />
                <span className="w-0.5 h-2 bg-white animate-[pulse_0.7s_infinite_alternate]" />
                <span className="w-0.5 h-3.5 bg-white animate-[pulse_1.2s_infinite_alternate]" />
              </div>
            ) : (
              <span className="font-mono text-neutral-600">#</span>
            )}
          </div>
        )}

        {/* Hover play controls */}
        {!isMultiSelectMode && (
          <button
            onClick={(e) => { e.stopPropagation(); handlePlayClick(); }}
            className="w-6 justify-center items-center hidden group-hover:flex text-neutral-400 hover:text-white"
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>
        )}

        {/* Artwork */}
        <div className="w-11 h-11 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 relative">
          {track.coverArtUrl ? (
            <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-neutral-900">
              <Music className="w-4 h-4 text-neutral-600" />
            </div>
          )}
        </div>

        {/* Title & Artist */}
        <div className="flex flex-col truncate">
          <span className={`text-sm font-semibold truncate ${isCurrent ? 'text-white' : 'text-neutral-200'}`}>
            {track.title}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span 
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/artist/${encodeURIComponent(track.artist)}`);
              }}
              className="text-xs text-neutral-500 hover:text-white hover:underline cursor-pointer truncate"
            >
              {track.artist}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] font-mono text-neutral-400 border border-neutral-700">
              {getSourceLabel()}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Metadata (Album + Duration) */}
      <div className="flex items-center gap-6 shrink-0 text-xs text-neutral-500">
        <span 
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/album/${encodeURIComponent(track.album)}?artist=${encodeURIComponent(track.artist)}`);
          }}
          className="hidden md:inline-block w-40 hover:text-white hover:underline cursor-pointer truncate"
        >
          {track.album}
        </span>
        <span className="font-mono w-10 text-right">{formatDuration(track.duration)}</span>

        {/* 3. Action Buttons */}
        <div className="flex items-center gap-1 ml-2">
          {/* Add to Queue */}
          <button
            onClick={(e) => { e.stopPropagation(); addToQueue(track); toast('Added to queue', 'info'); }}
            className="p-1.5 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors active:scale-90"
            title="Add to Play Queue"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Start Song Radio */}
          <button
            onClick={handleCreateSimilarPlaylist}
            className="p-1.5 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors active:scale-90"
            title="Start Song Radio (Similar Tracks Mix)"
          >
            <Radio className="w-4 h-4" />
          </button>

          {/* Favorite toggle */}
          <button
            onClick={handleFavoriteClick}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${
              liked ? 'text-white' : 'text-neutral-500 hover:text-white'
            }`}
            title="Like / Favorite"
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-white' : ''}`} />
          </button>

          {/* Download button */}
          <button
            onClick={handleDownloadClick}
            disabled={downloading}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${
              downloading ? 'text-neutral-600 cursor-wait' : 'text-neutral-500 hover:text-white'
            }`}
            title={downloading ? 'Downloading...' : 'Download track'}
          >
            <Download className={`w-4 h-4 ${downloading ? 'animate-pulse' : ''}`} />
          </button>

          {/* Delete local file track button */}
          {track.source === 'local' && (
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded hover:bg-white/10 text-neutral-500 hover:text-red-400 transition-colors"
              title="Delete from Library"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <TrackContextMenu
        track={track}
        anchorPosition={contextMenuPosition}
        onClose={() => setContextMenuPosition(null)}
        onPlay={handlePlayClick}
        onAddToQueue={() => { addToQueue(track); toast('Added to queue', 'info'); }}
        onToggleFavorite={handleFavoriteClick}
        onDownload={async () => {
          try {
            useDownloadStore.getState().enqueue(track);
            toast('Added to download queue', 'info');
          } catch (err) {
            console.error('Download enqueue failed:', err);
          }
        }}
        onAddToBatch={handleAddToBatch}
        onDelete={track.source === 'local' ? handleDeleteClick : undefined}
        onGoToArtist={() => navigate(`/artist/${encodeURIComponent(track.artist)}`)}
        onGoToAlbum={() => navigate(`/album/${encodeURIComponent(track.album)}?artist=${encodeURIComponent(track.artist)}`)}
        isFavorite={liked}
        onCreateSimilarPlaylist={handleCreateSimilarPlaylist}
      />
    </div>
  );
});
TrackCard.displayName = 'TrackCard';
export default TrackCard;
