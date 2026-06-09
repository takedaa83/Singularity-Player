import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ListMusic, Play, X } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track, Playlist } from '../../types';
import { TrackCard } from '../search/TrackCard';
import { usePlayerStore } from '../../stores/playerStore';
import { useGsapFadeIn } from '../../hooks/useGsap';

interface PlaylistViewProps {
  playlistId?: string;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({
  playlistId: propPlaylistId,
  refreshTrigger,
  triggerRefresh
}) => {
  const { id: urlPlaylistId } = useParams<{ id: string }>();
  const playlistId = propPlaylistId || urlPlaylistId || '';
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const { getAllPlaylists, getAllTracks, removeTrackFromPlaylist } = useLibraryDB();
  const setQueue = usePlayerStore(state => state.setQueue);

  useEffect(() => {
    const loadPlaylistData = async () => {
      setLoading(true);
      try {
        const playlists = await getAllPlaylists();
        const pl = playlists.find(p => p.id === playlistId) || null;
        setPlaylist(pl);

        if (pl) {
          const allTracks = await getAllTracks();
          // Filter matching trackIds and maintain index order
          const plTracks = pl.trackIds
            .map(id => allTracks.find(t => t.id === id))
            .filter((t): t is Track => !!t);
          setTracks(plTracks);
        } else {
          setTracks([]);
        }
      } catch (e) {
        console.error('Failed to load playlist:', e);
      } finally {
        setLoading(false);
      }
    };

    loadPlaylistData();
  }, [playlistId, refreshTrigger]);

  useGsapFadeIn('.playlist-track-item', tracks);

  const handlePlayPlaylist = () => {
    if (tracks.length > 0) {
      setQueue(tracks, 0);
    }
  };

  const handleRemoveTrack = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this track from the playlist?')) {
      await removeTrackFromPlaylist(playlistId, trackId);
      triggerRefresh();
    }
  };

  if (!playlist) {
    return <div className="text-white p-6 italic">Playlist not found.</div>;
  }

  return (
    <div className="flex flex-col gap-6 text-white h-full overflow-y-auto pb-10">
      {/* Playlist Hero Header */}
      <div className="flex items-center gap-6 p-4 rounded-lg bg-neutral-900 border border-neutral-800">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
          <ListMusic className="w-12 h-12 text-white" />
        </div>
        <div className="flex flex-col gap-2 truncate">
          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Playlist</span>
          <h2 className="text-xl sm:text-2xl font-black truncate">{playlist.name}</h2>
          <span className="text-xs text-neutral-400 truncate">{playlist.description}</span>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs font-semibold text-neutral-500">
              {tracks.length} tracks
            </span>
            {tracks.length > 0 && (
              <button
                onClick={handlePlayPlaylist}
                className="flex items-center gap-1.5 px-4.5 py-2 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all text-xs font-bold shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-black text-black ml-0.5" />
                <span>Play All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Playlist tracks */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="h-16 w-full rounded-2xl shimmer" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
          <p className="text-sm italic">This playlist has no tracks yet.</p>
          <p className="text-xs text-neutral-600 mt-1">
            Right-click or click track options in search or library to add songs.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tracks.map((track) => (
            <div key={track.id} className="playlist-track-item relative group/pl-card">
              <TrackCard 
                track={track} 
                refreshTrigger={triggerRefresh}
                onDeleteSuccess={triggerRefresh}
              />
              {/* Overlay remove from playlist button */}
              <button
                onClick={(e) => handleRemoveTrack(track.id, e)}
                className="absolute right-20 top-4.5 p-1 rounded bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 opacity-0 group-hover/pl-card:opacity-100 transition-opacity z-10"
                title="Remove from Playlist"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default PlaylistView;
