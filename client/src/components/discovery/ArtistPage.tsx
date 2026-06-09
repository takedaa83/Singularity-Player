import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Heart, Download, Music, UserCheck, UserPlus, ArrowLeft } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useToast } from '../../hooks/useToast';
import { Track } from '../../types';
import { api } from '../../utils/api';
import { tokens } from '../../theme/muiTheme';
import { initDB } from '../../lib/db';
import TrackCard from '../search/TrackCard';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';

export const ArtistPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const artistName = name || 'Unknown Artist';
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const playTrack = usePlayerStore(state => state.playTrack);
  const setQueue = usePlayerStore(state => state.setQueue);
  const { getAllTracks } = useLibraryDB();
  
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [discoveredTracks, setDiscoveredTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowed, setIsFollowed] = useState(false);
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library');

  // Generate a beautiful, stable gradient based on the artist name
  const getArtistGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${h1}, 70%, 20%) 0%, hsl(${h2}, 60%, 8%) 100%)`;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch library tracks
        const allLibTracks = await getAllTracks();
        const artistLibTracks = allLibTracks.filter(
          (t) => t.artist.toLowerCase() === artistName.toLowerCase()
        );
        setLibraryTracks(artistLibTracks);
        
        // If no library tracks, default tab to discover
        if (artistLibTracks.length === 0) {
          setActiveTab('discover');
        }

        // 2. Fetch follow state
        const db = await initDB();
        const entry = await db.get('settings', 'followed_artists');
        const followedList = entry ? entry.value : [];
        setIsFollowed(followedList.includes(artistName));

        // 3. Search online
        const onlineResults = await api.search(artistName);
        // Filter search results to mostly target this artist
        const artistOnlineTracks = onlineResults.filter(
          (t: Track) => t.artist.toLowerCase().includes(artistName.toLowerCase())
        );
        setDiscoveredTracks(artistOnlineTracks);
      } catch (err) {
        console.error('Error fetching artist data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [artistName]);

  const handleToggleFollow = async () => {
    try {
      const db = await initDB();
      const entry = await db.get('settings', 'followed_artists');
      let followedList = entry ? entry.value : [];
      
      if (followedList.includes(artistName)) {
        followedList = followedList.filter((a: string) => a !== artistName);
        setIsFollowed(false);
        toast(`Unfollowed ${artistName}`, 'info');
      } else {
        followedList.push(artistName);
        setIsFollowed(true);
        toast(`Following ${artistName}`, 'success');
      }
      
      await db.put('settings', { key: 'followed_artists', value: followedList });
    } catch (err) {
      console.error('Failed to toggle follow state:', err);
    }
  };

  const handlePlayAll = () => {
    const activeTracks = activeTab === 'library' ? libraryTracks : discoveredTracks;
    if (activeTracks.length > 0) {
      setQueue(activeTracks, 0);
      toast(`Playing all tracks by ${artistName}`, 'success');
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

      {/* Artist Hero Header */}
      <div
        className="w-full rounded-2xl overflow-hidden relative border border-neutral-800"
        style={{
          background: getArtistGradient(artistName),
          minHeight: '260px',
        }}
      >
        {/* Glow overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        
        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-xl shrink-0">
              <Music className="w-10 h-10 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold">Artist</span>
              <h1 className="text-3xl md:text-5xl font-extrabold text-white mt-1 drop-shadow-md">
                {artistName}
              </h1>
              <div className="flex items-center gap-4 mt-3 text-xs text-neutral-300">
                <span>{libraryTracks.length} tracks in library</span>
                <span>•</span>
                <span>{discoveredTracks.length} discoverable tracks</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-5 py-2.5 rounded-full font-semibold transition-all active:scale-95 shadow-lg"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Play All</span>
            </button>
            
            <button
              onClick={handleToggleFollow}
              className={`flex items-center gap-2 border px-5 py-2.5 rounded-full font-semibold transition-all active:scale-95 shadow-lg ${
                isFollowed
                  ? 'border-neutral-500 bg-white/10 text-white hover:bg-white/20'
                  : 'border-white bg-transparent text-white hover:bg-white/5'
              }`}
            >
              {isFollowed ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Follow</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadAll}
              className="p-3 rounded-full border border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-all active:scale-95"
              title="Download All"
            >
              <Download className="w-4 h-4" />
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
          Discover Online ({discoveredTracks.length})
        </button>
      </div>

      {/* Tracks List */}
      <div className="flex flex-col gap-2 mt-2">
        {loading ? (
          <LoadingSkeleton count={5} variant="track" />
        ) : activeTab === 'library' ? (
          libraryTracks.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 italic">
              No tracks from this artist in your library.
            </div>
          ) : (
            libraryTracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))
          )
        ) : discoveredTracks.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500 italic">
            No discoverable tracks found online for this artist.
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

export default ArtistPage;
