import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Play, Pause, Heart, Download, Music, UserCheck, UserPlus, ArrowLeft, 
  BookOpen, Calendar, MapPin, Sparkles, ChevronRight, Plus, ListPlus, Loader2 
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { useToast } from '../../hooks/useToast';
import { Track } from '../../types';
import { api } from '../../utils/api';
import { initDB } from '../../lib/db';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { formatDuration } from '../../utils/formatDuration';
import { TrackContextMenu } from '../ui/TrackContextMenu';

interface WikipediaSummary {
  extract?: string;
  originalimage?: { source: string };
  thumbnail?: { source: string };
  description?: string;
}

interface SimilarArtist {
  name: string;
  imageUrl: string | null;
  genres: string[];
}

// Helper to generate a soft glow HSL color based on string hashing
const getGlowColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsla(${h}, 75%, 55%, 0.18)`;
};

// Sub-component for Equalizer Animation
const EqualizerIcon: React.FC = () => {
  return (
    <div className="flex items-end justify-center gap-[2.5px] h-3.5 w-4 overflow-hidden select-none">
      <span className="w-[2px] bg-primary rounded-t-full h-full equalizer-bar-1" />
      <span className="w-[2px] bg-primary rounded-t-full h-full equalizer-bar-2" />
      <span className="w-[2px] bg-primary rounded-t-full h-full equalizer-bar-3" />
    </div>
  );
};

// Sub-component for Interactive Song Table Row
interface ArtistTrackRowProps {
  track: Track;
  index: number;
  queue: Track[];
  playCount: number;
  liked: boolean;
  onToggleFavorite: (trackId: string) => void;
}

const ArtistTrackRow: React.FC<ArtistTrackRowProps> = ({
  track,
  index,
  queue,
  playCount,
  liked,
  onToggleFavorite
}) => {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const isBuffering = usePlayerStore(state => state.isBuffering);
  const playTrack = usePlayerStore(state => state.playTrack);
  const playNext = usePlayerStore(state => state.playNext);
  const addToQueue = usePlayerStore(state => state.addToQueue);
  
  const [contextMenuPosition, setContextMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const isCurrent = currentTrack?.id === track.id;
  
  const handlePlayClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isCurrent) {
      usePlayerStore.getState().setPlaying(!isPlaying);
    } else {
      playTrack(track, queue);
    }
  };

  const handleFavoriteClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onToggleFavorite(track.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ top: e.clientY, left: e.clientX });
  };

  return (
    <>
      <div 
        onClick={handlePlayClick}
        onContextMenu={handleContextMenu}
        className={`group flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer border border-transparent select-none transition-all duration-200 ${
          isCurrent 
            ? 'bg-primary/10 border-primary/20 hover:bg-primary/15' 
            : 'bg-white/[0.01] hover:bg-white/5 hover:border-white/5'
        }`}
      >
        {/* Rank / Play icon / Equalizer */}
        <div className="flex items-center gap-4 flex-1 truncate">
          <div className="w-8 shrink-0 flex justify-center items-center">
            {/* Play/Pause on hover */}
            <button
              onClick={handlePlayClick}
              className="hidden group-hover:flex text-neutral-300 hover:text-white transition-all duration-200 cursor-pointer"
            >
              {isCurrent && isPlaying ? (
                <Pause className="w-4 h-4 fill-current text-primary" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5 text-primary" />
              )}
            </button>
            {/* Default state */}
            <div className="group-hover:hidden flex items-center justify-center">
              {isCurrent && isBuffering ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : isCurrent && isPlaying ? (
                <EqualizerIcon />
              ) : (
                <span className="font-mono text-xs text-neutral-500">{String(index + 1).padStart(2, '0')}</span>
              )}
            </div>
          </div>

          {/* Cover Art */}
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 border border-white/5 shrink-0 relative">
            {track.coverArtUrl ? (
              <img 
                src={api.coverUrl(track.coverArtUrl, track.videoId)!} 
                alt={track.title} 
                className="w-full h-full object-cover" 
                loading="lazy" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-4 h-4 text-neutral-600" />
              </div>
            )}
          </div>

          {/* Title and Subtitle */}
          <div className="flex flex-col truncate">
            <span className={`text-xs sm:text-sm font-semibold truncate ${isCurrent ? 'text-primary animate-pulse' : 'text-neutral-100'}`}>
              {track.title}
            </span>
            <span className="text-[10px] text-neutral-500 mt-0.5">
              {track.artist}
            </span>
          </div>
        </div>

        {/* Album Column */}
        <span 
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/album/${encodeURIComponent(track.album)}?artist=${encodeURIComponent(track.artist)}`);
          }}
          className="hidden md:block w-1/3 hover:underline text-xs text-neutral-400 hover:text-white truncate pr-4"
        >
          {track.album || 'Single'}
        </span>

        {/* Plays Column */}
        <span className="hidden sm:block w-24 text-xs text-neutral-400 font-medium select-none">
          {playCount > 0 ? `${playCount} ${playCount === 1 ? 'play' : 'plays'}` : '—'}
        </span>

        {/* Action icons & time duration */}
        <div className="flex items-center gap-4 shrink-0 text-xs select-none">
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity duration-200">
            <button
              onClick={(e) => { e.stopPropagation(); playNext(track); toast('Will play next', 'info'); }}
              className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Play Next"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); addToQueue(track); toast('Added to queue', 'info'); }}
              className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Add to Queue"
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleFavoriteClick}
            className={`p-1 rounded hover:bg-white/10 transition-colors cursor-pointer ${
              liked ? 'text-primary' : 'text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-white'
            }`}
            title="Like / Favorite"
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />
          </button>

          <span className="font-mono text-neutral-400 w-10 text-right">{formatDuration(track.duration)}</span>
        </div>
      </div>

      <TrackContextMenu
        track={track}
        anchorPosition={contextMenuPosition}
        onClose={() => setContextMenuPosition(null)}
        onPlay={handlePlayClick}
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
        onGoToArtist={() => navigate(`/artist/${encodeURIComponent(track.artist)}`)}
        onGoToAlbum={() => navigate(`/album/${encodeURIComponent(track.album)}?artist=${encodeURIComponent(track.artist)}`)}
        isFavorite={liked}
      />
    </>
  );
};

export const ArtistPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const artistName = name || 'Unknown Artist';
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const playTrack = usePlayerStore(state => state.playTrack);
  const setQueue = usePlayerStore(state => state.setQueue);
  const favorites = usePlayerStore(state => state.favorites);
  const { getAllTracks, getPlaybackHistory, toggleFavorite } = useLibraryDB();
  
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [discoveredTracks, setDiscoveredTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowed, setIsFollowed] = useState(false);
  const [playCounts, setPlayCounts] = useState<Map<string, number>>(new Map());
  
  // Wikipedia integration
  const [wikiData, setWikiData] = useState<WikipediaSummary | null>(null);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(true);

  // Similar artists local cache
  const [similarArtists, setSimilarArtists] = useState<SimilarArtist[]>([]);

  // Get dynamic dominant backdrop gradient from name
  const dynamicBackdropColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < artistName.length; i++) {
      hash = artistName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsla(${h}, 70%, 15%, 0.45)`;
  }, [artistName]);

  const getArtistGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${h1}, 75%, 22%) 0%, hsl(${h2}, 60%, 8%) 100%)`;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setWikiLoading(true);
      try {
        const [allLibTracks, history, db] = await Promise.all([
          getAllTracks(),
          getPlaybackHistory(),
          initDB()
        ]);

        // 1. Fetch library tracks for this artist
        const artistLibTracks = allLibTracks.filter(
          (t) => t.artist.toLowerCase() === artistName.toLowerCase()
        );
        setLibraryTracks(artistLibTracks);

        // 2. Load playback counts
        const counts = new Map<string, number>();
        for (const entry of history) {
          counts.set(entry.trackId, (counts.get(entry.trackId) || 0) + 1);
        }
        setPlayCounts(counts);

        // 3. Fetch follow state
        const entry = await db.get('settings', 'followed_artists');
        const followedList = entry ? entry.value : [];
        setIsFollowed(followedList.includes(artistName));

        // 4. Search online for discoverable tracks
        const onlineResults = await api.search(artistName);
        const artistOnlineTracks = onlineResults.filter(
          (t: Track) => t.artist.toLowerCase().includes(artistName.toLowerCase())
        );
        setDiscoveredTracks(artistOnlineTracks);

        // 5. Fetch Wikipedia summary & banner photo
        try {
          const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`
          );
          if (res.ok) {
            const data: WikipediaSummary = await res.json();
            setWikiData(data);
            setWikiImage(data.originalimage?.source || data.thumbnail?.source || null);
          }
        } catch (err) {
          console.error('[ArtistPage] Failed to fetch wiki description:', err);
        } finally {
          setWikiLoading(false);
        }

        // 6. Compute similar artists from user library based on genre match
        const artistGenres = new Set(artistLibTracks.map(t => (t.genre || '').toLowerCase().trim()).filter(Boolean));
        if (artistGenres.size > 0) {
          const otherArtistsMap = new Map<string, { name: string; score: number; genres: string[]; covers: string[] }>();
          for (const t of allLibTracks) {
            const trackArtist = t.artist;
            if (trackArtist.toLowerCase() === artistName.toLowerCase()) continue;
            
            const genre = (t.genre || '').toLowerCase().trim();
            if (genre && artistGenres.has(genre)) {
              let stats = otherArtistsMap.get(trackArtist);
              if (!stats) {
                stats = { name: trackArtist, score: 0, genres: [], covers: [] };
                otherArtistsMap.set(trackArtist, stats);
              }
              stats.score += 1;
              if (!stats.genres.includes(t.genre!)) stats.genres.push(t.genre!);
              if (t.coverArtUrl && stats.covers.length < 3) stats.covers.push(t.coverArtUrl);
            }
          }

          const similarSorted = Array.from(otherArtistsMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

          // Resolve profile pictures from Wikipedia API in parallel
          const resolvedSimilar = await Promise.all(
            similarSorted.map(async (sa) => {
              let imgUrl: string | null = null;
              try {
                const res = await fetch(
                  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sa.name)}`
                );
                if (res.ok) {
                  const data = await res.json();
                  imgUrl = data.originalimage?.source || data.thumbnail?.source || null;
                }
              } catch (e) {
                // Ignore
              }
              return {
                name: sa.name,
                imageUrl: imgUrl,
                genres: sa.genres
              };
            })
          );
          setSimilarArtists(resolvedSimilar);
        }

      } catch (err) {
        console.error('Error fetching artist page data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [artistName]);

  const handleArtistClick = (name: string) => {
    navigate(`/artist/${encodeURIComponent(name)}`);
  };

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

  const handleToggleFavorite = async (trackId: string) => {
    try {
      const nextState = await toggleFavorite(trackId);
      toast(nextState ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handlePlayAll = () => {
    const activeTracks = libraryTracks.length > 0 ? libraryTracks : discoveredTracks;
    if (activeTracks.length > 0) {
      setQueue(activeTracks, 0);
      toast(`Playing all tracks by ${artistName}`, 'success');
    } else {
      toast('No tracks to play', 'info');
    }
  };

  // Compile Album List
  const albums = useMemo(() => {
    const albumMap = new Map<string, { title: string; coverUrl: string | null; tracks: Track[] }>();
    const allTracks = [...libraryTracks, ...discoveredTracks];
    for (const track of allTracks) {
      const albumTitle = track.album || 'Single / Unknown Album';
      let album = albumMap.get(albumTitle);
      if (!album) {
        album = { title: albumTitle, coverUrl: track.coverArtUrl || null, tracks: [] };
        albumMap.set(albumTitle, album);
      }
      album.tracks.push(track);
      if (!album.coverUrl && track.coverArtUrl) {
        album.coverUrl = track.coverArtUrl;
      }
    }
    return Array.from(albumMap.values());
  }, [libraryTracks, discoveredTracks]);

  // Compile Top Songs (sorted by user plays, capped at 6)
  const topSongs = useMemo(() => {
    const allTracks = [...libraryTracks, ...discoveredTracks];
    const uniqueMap = new Map<string, Track>();
    for (const t of allTracks) {
      if (!uniqueMap.has(t.title.toLowerCase())) {
        uniqueMap.set(t.title.toLowerCase(), t);
      }
    }
    return Array.from(uniqueMap.values()).slice(0, 6);
  }, [libraryTracks, discoveredTracks]);

  // Compile Latest Release
  const latestRelease = useMemo(() => {
    if (libraryTracks.length > 0) {
      return libraryTracks[0];
    }
    if (discoveredTracks.length > 0) {
      return discoveredTracks[0];
    }
    return null;
  }, [libraryTracks, discoveredTracks]);

  // Smart biographical parser
  const parsedBioDetails = useMemo(() => {
    if (!wikiData?.extract) return { born: null, origin: null };
    const extract = wikiData.extract;
    
    let born: string | null = null;
    const bornMatch = extract.match(/born\s+([0-9]+\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]+,\s+[0-9]{4})/i);
    if (bornMatch) {
      born = bornMatch[1];
    }

    let origin: string | null = null;
    const originMatch = extract.match(/is\s+an?\s+([A-Za-z]+)\s+(singer|musician|artist|composer)/i);
    if (originMatch) {
      origin = originMatch[1];
    }

    return { born, origin };
  }, [wikiData]);

  return (
    <div className="flex flex-col gap-8 w-full pb-16 overflow-y-auto pr-1 select-none relative">
      {/* Dynamic ambient backdrop gradient */}
      <div 
        className="absolute top-0 left-0 right-0 h-[600px] pointer-events-none -z-10 opacity-70 transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${dynamicBackdropColor} 0%, transparent 80%)`
        }}
      />

      {/* Back navigation */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Hero Banner */}
      <div
        className="w-full rounded-3xl overflow-hidden relative border border-white/5 shadow-2xl flex flex-col justify-end aspect-[21/8] min-h-[280px]"
        style={{
          background: getArtistGradient(artistName),
        }}
      >
        {wikiImage && (
          <img 
            src={wikiImage} 
            alt={artistName} 
            className="absolute inset-0 w-full h-full object-cover object-top filter brightness-[0.40] saturate-[1.15] transition-transform duration-1000 hover:scale-[1.03]"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent z-10" />

        <div className="relative z-20 p-6 sm:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">Artist Profile</span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white mt-2 tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
              {artistName}
            </h1>
            <div className="flex items-center gap-3 mt-3.5 text-xs text-neutral-300 font-medium">
              <span>{libraryTracks.length} library tracks</span>
              <span>•</span>
              <span>{discoveredTracks.length} online streams</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-6 py-3 rounded-full font-bold transition-all duration-200 active:scale-95 shadow-xl cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Play All</span>
            </button>
            
            <button
              onClick={handleToggleFollow}
              className={`flex items-center gap-2 border px-6 py-3 rounded-full font-bold transition-all duration-200 active:scale-95 shadow-xl cursor-pointer ${
                isFollowed
                  ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
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
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={4} variant="track" />
      ) : (
        <div className="flex flex-col gap-10">
          
          {/* Row 1: Latest Release & Top Songs Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Left Side: Latest Release */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              <h2 className="text-md font-bold tracking-wide text-white">Latest Release</h2>
              {latestRelease ? (
                <div 
                  onClick={() => playTrack(latestRelease, [latestRelease])}
                  className="group cursor-pointer flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all duration-300"
                >
                  <div className="aspect-square w-full rounded-xl overflow-hidden bg-neutral-900 border border-white/5 relative shadow-md">
                    {latestRelease.coverArtUrl ? (
                      <img 
                        src={api.coverUrl(latestRelease.coverArtUrl, latestRelease.videoId)!} 
                        alt={latestRelease.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-12 h-12 text-neutral-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                      <div className="p-3 rounded-full bg-white text-black shadow-lg scale-90 group-hover:scale-100 transition-all duration-300">
                        <Play className="w-5 h-5 fill-black" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase select-none">
                      {latestRelease.album || 'Single'}
                    </span>
                    <span className="text-sm font-semibold text-white truncate mt-1 group-hover:text-primary transition-colors">
                      {latestRelease.title}
                    </span>
                    <span className="text-xs text-neutral-400 mt-0.5 truncate font-medium">
                      {latestRelease.artist}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-neutral-500 border border-white/5 rounded-2xl bg-white/[0.01] italic">
                  No releases cataloged
                </div>
              )}
            </div>

            {/* Right Side: Popular Tracks Interactive Song Table */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-bold tracking-wide text-white">Popular Songs</h2>
                <button 
                  onClick={handlePlayAll}
                  className="flex items-center gap-1 text-xs text-primary font-semibold hover:text-white transition-colors cursor-pointer"
                >
                  <span>Play All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {topSongs.length > 0 ? (
                <div className="flex flex-col bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden p-2 gap-1.5 shadow-sm">
                  {/* Table Header */}
                  <div className="flex items-center justify-between px-4 py-2 text-[9px] uppercase font-bold tracking-wider text-neutral-500 select-none">
                    <div className="flex items-center gap-4 flex-1">
                      <span className="w-8 text-center">#</span>
                      <span className="ml-14">Title</span>
                    </div>
                    <span className="hidden md:block w-1/3">Album</span>
                    <span className="hidden sm:block w-24">Library Stats</span>
                    <span className="w-16 text-right mr-1">Time</span>
                  </div>
                  
                  {/* Table Rows */}
                  <div className="flex flex-col gap-1">
                    {topSongs.map((track, idx) => (
                      <ArtistTrackRow 
                        key={track.id} 
                        track={track} 
                        index={idx}
                        queue={topSongs}
                        playCount={playCounts.get(track.id) || 0}
                        liked={favorites?.includes(track.id) || false}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-neutral-500 border border-white/5 rounded-2xl bg-white/[0.01] italic">
                  No tracks available
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Albums Horizontal Carousel */}
          <div className="flex flex-col gap-4">
            <h2 className="text-md font-bold tracking-wide text-white">Albums</h2>
            {albums.length > 0 ? (
              <div className="flex gap-5 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
                {albums.map((album, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      if (album.tracks.length > 0) {
                        setQueue(album.tracks, 0);
                        toast(`Playing Album: ${album.title}`, 'success');
                      }
                    }}
                    className="flex flex-col w-36 sm:w-40 shrink-0 group cursor-pointer"
                  >
                    <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 relative shadow-md group-hover:shadow-[0_10px_30px_rgba(255,255,255,0.04)] transition-all duration-350">
                      {album.coverUrl ? (
                        <img 
                          src={api.coverUrl(album.coverUrl)!} 
                          alt={album.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-10 h-10 text-neutral-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                        <div className="p-3 rounded-full bg-white text-black scale-90 group-hover:scale-100 transition-all duration-300 shadow-lg">
                          <Play className="w-4 h-4 fill-black" />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-neutral-200 mt-2.5 truncate w-full group-hover:text-primary transition-colors">
                      {album.title}
                    </span>
                    <span className="text-[10px] text-neutral-500 mt-0.5 font-medium select-none">
                      {album.tracks.length} {album.tracks.length === 1 ? 'song' : 'songs'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-500 border border-white/5 rounded-2xl bg-white/[0.01] italic">
                No albums found
              </div>
            )}
          </div>

          {/* Row 3: Biography Glassmorphic Card & Facts */}
          {wikiData?.extract && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
              
              {/* Biography Panel */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <h2 className="text-md font-bold tracking-wide text-white">About {artistName}</h2>
                <div className="flex-1 p-6 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border border-white/10 flex flex-col gap-4 text-xs sm:text-sm text-neutral-300 leading-relaxed shadow-xl font-sans hover:border-white/20 transition-all duration-300">
                  <div className="flex items-center gap-2 text-primary font-semibold select-none">
                    <BookOpen className="w-4 h-4" />
                    <span>Wikipedia Biography Extract</span>
                  </div>
                  <p>{wikiData.extract}</p>
                </div>
              </div>

              {/* Facts Panel */}
              <div className="lg:col-span-1 flex flex-col gap-4">
                <h2 className="text-md font-bold tracking-wide text-white">Quick Facts</h2>
                <div className="flex-1 p-6 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border border-white/10 flex flex-col gap-4 justify-center shadow-xl hover:border-white/20 transition-all duration-300">
                  {parsedBioDetails.born && (
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-neutral-400">
                        <Calendar className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Born</span>
                        <span className="text-xs font-semibold text-neutral-200 mt-0.5">{parsedBioDetails.born}</span>
                      </div>
                    </div>
                  )}

                  {parsedBioDetails.origin && (
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-neutral-400">
                        <MapPin className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">From</span>
                        <span className="text-xs font-semibold text-neutral-200 mt-0.5">{parsedBioDetails.origin}</span>
                      </div>
                    </div>
                  )}

                  {libraryTracks.length > 0 && libraryTracks[0].genre && (
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-neutral-400">
                        <Sparkles className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Genre</span>
                        <span className="text-xs font-semibold text-neutral-200 mt-0.5 capitalize">{libraryTracks[0].genre}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Row 4: Similar Artists Grid with Radial Glows */}
          {similarArtists.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-md font-bold tracking-wide text-white">Similar Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                {similarArtists.map((sa) => (
                  <div 
                    key={sa.name}
                    onClick={() => handleArtistClick(sa.name)}
                    className="flex flex-col items-center text-center group cursor-pointer p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 transition-all duration-300 hover:scale-[1.04] relative"
                  >
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 mb-3 shrink-0 select-none">
                      {/* radial glow back element */}
                      <div 
                        className="absolute inset-0 rounded-full blur-xl scale-125 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"
                        style={{
                          background: `radial-gradient(circle, ${getGlowColor(sa.name)} 0%, transparent 70%)`
                        }}
                      />
                      
                      <div className="relative z-10 w-full h-full rounded-full overflow-hidden border border-white/10 group-hover:border-white/20 transition-all duration-300 shadow-md">
                        {sa.imageUrl ? (
                          <img 
                            src={sa.imageUrl} 
                            alt={sa.name} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                            <Music className="w-5 h-5 text-neutral-700" />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors truncate w-full select-none relative z-10">
                      {sa.name}
                    </span>
                    {sa.genres.length > 0 && (
                      <span className="text-[9px] text-neutral-500 capitalize mt-1 select-none relative z-10">
                        {sa.genres[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default ArtistPage;
