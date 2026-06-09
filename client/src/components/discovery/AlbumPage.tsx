import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Heart, Download, Music, Disc, ArrowLeft } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useToast } from '../../hooks/useToast';
import { Track } from '../../types';
import { api } from '../../utils/api';
import { tokens } from '../../theme/muiTheme';
import TrackCard from '../search/TrackCard';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';

export const AlbumPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const albumName = name || 'Unknown Album';
  const [searchParams] = useSearchParams();
  const artistName = searchParams.get('artist') || '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const playTrack = usePlayerStore(state => state.playTrack);
  const setQueue = usePlayerStore(state => state.setQueue);
  const { getAllTracks } = useLibraryDB();

  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [discoveredTracks, setDiscoveredTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch library tracks for this album
        const allLibTracks = await getAllTracks();
        const albumLibTracks = allLibTracks.filter((t) => {
          const matchAlbum = t.album.toLowerCase() === albumName.toLowerCase();
          const matchArtist = !artistName || t.artist.toLowerCase() === artistName.toLowerCase();
          return matchAlbum && matchArtist;
        });
        setLibraryTracks(albumLibTracks);

        if (albumLibTracks.length === 0) {
          setActiveTab('discover');
        }

        // 2. Fetch online search results
        const searchQuery = artistName ? `${artistName} ${albumName}` : albumName;
        const onlineResults = await api.search(searchQuery);
        // Filter results that have the same album name if possible
        const albumOnlineTracks = onlineResults.filter(
          (t: Track) => t.album.toLowerCase().includes(albumName.toLowerCase())
        );
        setDiscoveredTracks(albumOnlineTracks);
      } catch (err) {
        console.error('Error fetching album data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [albumName, artistName]);

  const handlePlayAll = () => {
    const activeTracks = activeTab === 'library' ? libraryTracks : discoveredTracks;
    if (activeTracks.length > 0) {
      setQueue(activeTracks, 0);
      toast(`Playing album ${albumName}`, 'success');
    } else {
      toast('No tracks to play', 'info');
    }
  };

  const handleDownloadAll = () => {
    const activeTracks = activeTab === 'library' ? libraryTracks : discoveredTracks;
    if (activeTracks.length === 0) {
      toast('No tracks to download', 'info');
      return;
    }

    const downloadStore = useDownloadStore.getState();
    activeTracks.forEach((t) => {
      downloadStore.enqueue(t);
    });
    toast(`Added ${activeTracks.length} tracks to download queue`, 'success');
  };

  // Get cover art from the first available track
  const coverArtUrl = libraryTracks[0]?.coverArtUrl || discoveredTracks[0]?.coverArtUrl || null;
  const albumArtist = libraryTracks[0]?.artist || discoveredTracks[0]?.artist || artistName || 'Unknown Artist';

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      {/* Back navigation */}
      <div className="flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Album Header Block */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-8 p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 relative overflow-hidden">
        {/* Blurred backdrop art glow */}
        {coverArtUrl && (
          <div
            className="absolute inset-0 -z-10 opacity-15 blur-[60px] scale-125"
            style={{
              backgroundImage: `url(${api.coverUrl(coverArtUrl, libraryTracks[0]?.videoId || discoveredTracks[0]?.videoId) || ''})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}

        {/* Artwork cover container */}
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl shrink-0 flex items-center justify-center relative group">
          {api.coverUrl(coverArtUrl, libraryTracks[0]?.videoId || discoveredTracks[0]?.videoId) ? (
            <img 
              src={api.coverUrl(coverArtUrl, libraryTracks[0]?.videoId || discoveredTracks[0]?.videoId)!} 
              alt={albumName} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                const vId = libraryTracks[0]?.videoId || discoveredTracks[0]?.videoId;
                if (vId && target.src !== `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`) {
                  target.src = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
                }
              }}
            />
          ) : (
            <Disc className="w-20 h-20 text-neutral-700" />
          )}
        </div>

        {/* Text & stats info */}
        <div className="flex flex-col flex-1 text-center md:text-left">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold">Album</span>
          <h1 className="text-2xl md:text-4xl font-extrabold text-white mt-1 drop-shadow-sm">
            {albumName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-neutral-300">
            <span
              onClick={() => navigate(`/artist/${encodeURIComponent(albumArtist)}`)}
              className="font-bold text-purple-400 hover:underline cursor-pointer"
            >
              {albumArtist}
            </span>
            <span>•</span>
            <span>{libraryTracks.length + discoveredTracks.length} total tracks</span>
            {libraryTracks.length > 0 && (
              <>
                <span>•</span>
                <span className="text-emerald-400">{libraryTracks.length} in library</span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center md:justify-start gap-4 mt-6">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-6 py-2.5 rounded-full font-semibold transition-all active:scale-95 shadow-lg"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Play All</span>
            </button>

            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 border border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800 px-6 py-2.5 rounded-full font-semibold transition-all text-neutral-300 hover:text-white active:scale-95 shadow-lg"
            >
              <Download className="w-4 h-4" />
              <span>Download Album</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 gap-6 mt-4">
        {libraryTracks.length > 0 && (
          <button
            onClick={() => setActiveTab('library')}
            className={`pb-3 text-sm font-semibold transition-all border-b-2 px-1 ${
              activeTab === 'library'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Library Tracks ({libraryTracks.length})
          </button>
        )}
        <button
          onClick={() => setActiveTab('discover')}
          className={`pb-3 text-sm font-semibold transition-all border-b-2 px-1 ${
            activeTab === 'discover'
              ? 'border-purple-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Discover Tracks ({discoveredTracks.length})
        </button>
      </div>

      {/* Tracks List */}
      <div className="flex flex-col gap-2 mt-2">
        {loading ? (
          <LoadingSkeleton count={4} variant="track" />
        ) : activeTab === 'library' ? (
          libraryTracks.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 italic">
              No tracks from this album in your library.
            </div>
          ) : (
            libraryTracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))
          )
        ) : discoveredTracks.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500 italic">
            No additional tracks found online for this album.
          </div>
        ) : (
          discoveredTracks.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))
        )}
      </div>
    </div>
  );
};

export default AlbumPage;
