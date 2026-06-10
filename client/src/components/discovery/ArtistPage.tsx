import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Play, Heart, Download, Music, UserCheck, UserPlus, ArrowLeft, 
  BookOpen, Calendar, MapPin, Sparkles, ChevronRight 
} from 'lucide-react';
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

export const ArtistPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const artistName = name || 'Unknown Artist';
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const playTrack = usePlayerStore(state => state.playTrack);
  const setQueue = usePlayerStore(state => state.setQueue);
  const { getAllTracks, getPlaybackHistory } = useLibraryDB();
  
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [discoveredTracks, setDiscoveredTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowed, setIsFollowed] = useState(false);
  
  // Wikipedia integration
  const [wikiData, setWikiData] = useState<WikipediaSummary | null>(null);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(true);

  // Similar artists local cache
  const [similarArtists, setSimilarArtists] = useState<SimilarArtist[]>([]);

  // Get artist gradient as a styled banner fallback
  const getArtistGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${h1}, 75%, 25%) 0%, hsl(${h2}, 60%, 8%) 100%)`;
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

        // 2. Fetch follow state
        const entry = await db.get('settings', 'followed_artists');
        const followedList = entry ? entry.value : [];
        setIsFollowed(followedList.includes(artistName));

        // 3. Search online for discoverable tracks
        const onlineResults = await api.search(artistName);
        const artistOnlineTracks = onlineResults.filter(
          (t: Track) => t.artist.toLowerCase().includes(artistName.toLowerCase())
        );
        setDiscoveredTracks(artistOnlineTracks);

        // 4. Fetch Wikipedia summary & banner photo
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

        // 5. Compute similar artists from user library based on genre match
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

          // Resolve profile pictures from Wikipedia API for the similar artists in parallel
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
                // Ignore failure
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

  // Redirection to related artist page
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
    // Remove exact duplicates
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
      return libraryTracks[0]; // local newest first
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
    
    // Parse BORN details, e.g. "born 12 March 1983"
    let born: string | null = null;
    const bornMatch = extract.match(/born\s+([0-9]+\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]+,\s+[0-9]{4})/i);
    if (bornMatch) {
      born = bornMatch[1];
    }

    // Parse ORIGIN, e.g. "Pakistani singer" -> Pakistani
    let origin: string | null = null;
    const originMatch = extract.match(/is\s+an?\s+([A-Za-z]+)\s+(singer|musician|artist|composer)/i);
    if (originMatch) {
      origin = originMatch[1];
    }

    return { born, origin };
  }, [wikiData]);

  return (
    <div className="flex flex-col gap-8 w-full pb-16 overflow-y-auto pr-1 select-none">
      {/* Back navigation */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-all duration-200 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Large Apple Music Header Banner */}
      <div
        className="w-full rounded-3xl overflow-hidden relative border border-white/5 shadow-2xl flex flex-col justify-end aspect-[21/9] min-h-[280px]"
        style={{
          background: getArtistGradient(artistName),
        }}
      >
        {/* Wikipedia high-resolution profile backdrop */}
        {wikiImage && (
          <img 
            src={wikiImage} 
            alt={artistName} 
            className="absolute inset-0 w-full h-full object-cover object-top filter brightness-[0.42] saturate-[1.1]"
          />
        )}

        {/* Shadow overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent z-10" />
        <div className="absolute inset-0 bg-black/10 z-10" />

        {/* Content Overlay */}
        <div className="relative z-20 p-6 sm:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold">Artist Profile</span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white mt-2 tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
              {artistName}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-xs text-neutral-300 font-medium">
              <span>{libraryTracks.length} tracks in library</span>
              <span>•</span>
              <span>{discoveredTracks.length} online streams</span>
            </div>
          </div>

          {/* Banner buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-6 py-3 rounded-full font-bold transition-all duration-200 active:scale-95 shadow-xl"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Play</span>
            </button>
            
            <button
              onClick={handleToggleFollow}
              className={`flex items-center gap-2 border px-6 py-3 rounded-full font-bold transition-all duration-200 active:scale-95 shadow-xl ${
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
          
          {/* Row 1: Latest Release & Top Songs */}
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

            {/* Right Side: Top Songs (2 columns on large screens) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-bold tracking-wide text-white">Top Songs</h2>
                <button 
                  onClick={handlePlayAll}
                  className="flex items-center gap-1 text-xs text-primary font-semibold hover:text-white transition-colors"
                >
                  <span>Play All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {topSongs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {topSongs.map((track) => (
                    <TrackCard 
                      key={track.id} 
                      track={track} 
                    />
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-neutral-500 border border-white/5 rounded-2xl bg-white/[0.01] italic">
                  No tracks available
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Albums (Horizontal Scroll) */}
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
                    <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 relative shadow-md">
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
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                        <Play className="w-4 h-4 fill-white text-white" />
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-neutral-200 mt-2.5 truncate w-full group-hover:text-white transition-colors">
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

          {/* Row 3: Biography "About" & Facts */}
          {wikiData?.extract && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
              
              {/* Left Side: About Bio Text */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <h2 className="text-md font-bold tracking-wide text-white">About {artistName}</h2>
                <div className="flex-1 p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-4 text-xs sm:text-sm text-neutral-300 leading-relaxed shadow-sm font-sans">
                  <div className="flex items-center gap-2 text-primary font-semibold select-none">
                    <BookOpen className="w-4 h-4" />
                    <span>Wikipedia Biography Extract</span>
                  </div>
                  <p>{wikiData.extract}</p>
                </div>
              </div>

              {/* Right Side: Quick Facts */}
              <div className="lg:col-span-1 flex flex-col gap-4">
                <h2 className="text-md font-bold tracking-wide text-white">Quick Facts</h2>
                <div className="flex-1 p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-4 justify-center shadow-sm">
                  {/* Birthdate */}
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

                  {/* Origin Location */}
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

                  {/* Main Genre */}
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

          {/* Row 4: Similar Artists */}
          {similarArtists.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-md font-bold tracking-wide text-white">Similar Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                {similarArtists.map((sa) => (
                  <div 
                    key={sa.name}
                    onClick={() => handleArtistClick(sa.name)}
                    className="flex flex-col items-center text-center group cursor-pointer p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 transition-all duration-300 hover:scale-[1.04]"
                  >
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border border-white/10 group-hover:border-white/20 transition-all duration-300 shadow-md mb-3">
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
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors truncate w-full select-none">
                      {sa.name}
                    </span>
                    {sa.genres.length > 0 && (
                      <span className="text-[9px] text-neutral-500 capitalize mt-1 select-none">
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
