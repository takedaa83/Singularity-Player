import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Search, Music, Sparkles, Play, ChevronRight } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { usePlayerStore } from '../../stores/playerStore';
import { Track } from '../../types';
import { useGsapFadeIn } from '../../hooks/useGsap';

interface ArtistsViewProps {
  refreshTrigger?: number;
  triggerRefresh?: () => void;
}

interface ArtistStats {
  name: string;
  playCount: number;
  trackCount: number;
  isFavorite: boolean;
  lastPlayed: number;
}

interface WikipediaSummary {
  extract?: string;
  originalimage?: { source: string };
  thumbnail?: { source: string };
  description?: string;
}

// Memory cache for Wikipedia artist images to prevent double fetches
const artistImageCache = new Map<string, string | null>();
const artistBioCache = new Map<string, WikipediaSummary | null>();

// Generate HSL colors dynamically based on string hashing
const getGlowColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsla(${h}, 75%, 55%, 0.18)`;
};

const getGradientByName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 65%, 25%) 0%, hsl(${h2}, 60%, 8%) 100%)`;
};

// Subcomponent for Spotlight Banner
interface SpotlightBannerProps {
  artist: ArtistStats;
  onPlay: (artistName: string) => void;
}

const SpotlightBanner: React.FC<SpotlightBannerProps> = ({ artist, onPlay }) => {
  const navigate = useNavigate();
  const [wikiData, setWikiData] = useState<WikipediaSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchWiki = async () => {
      if (artistBioCache.has(artist.name)) {
        setWikiData(artistBioCache.get(artist.name) || null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist.name)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setWikiData(data);
            artistBioCache.set(artist.name, data);
            if (data.originalimage?.source || data.thumbnail?.source) {
              artistImageCache.set(artist.name, data.originalimage?.source || data.thumbnail?.source);
            }
          }
        } else {
          if (active) artistBioCache.set(artist.name, null);
        }
      } catch (err) {
        console.error('Failed to fetch spotlight Wikipedia summary:', err);
        if (active) artistBioCache.set(artist.name, null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchWiki();
    return () => {
      active = false;
    };
  }, [artist.name]);

  const bannerImg = wikiData?.originalimage?.source || wikiData?.thumbnail?.source || null;

  const extractText = useMemo(() => {
    if (!wikiData?.extract) return 'No biography extract available for this artist.';
    const text = wikiData.extract;
    if (text.length <= 190) return text;
    const end = text.indexOf(' ', 190);
    return end === -1 ? text.substring(0, 190) + '...' : text.substring(0, end) + '...';
  }, [wikiData]);

  return (
    <div 
      className="spotlight-banner relative w-full rounded-3xl overflow-hidden aspect-[21/8] min-h-[240px] sm:min-h-[280px] border border-white/5 shadow-2xl flex flex-col justify-end p-6 sm:p-8 select-none transition-all duration-500 hover:border-white/10"
      style={{
        background: getGradientByName(artist.name)
      }}
    >
      {bannerImg && (
        <img 
          src={bannerImg} 
          alt={artist.name} 
          className="absolute inset-0 w-full h-full object-cover object-top filter brightness-[0.35] saturate-[1.1] blur-[1px] transition-transform duration-700 hover:scale-105"
        />
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent z-10" />

      <div className="relative z-20 w-full md:max-w-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col gap-3 shadow-xl">
        <div className="flex items-center gap-2 text-primary font-bold text-[10px] tracking-[0.2em] uppercase">
          <Sparkles className="w-3.5 h-3.5 text-primary fill-primary animate-pulse" />
          <span>Spotlight Artist</span>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
            {artist.name}
          </h3>
          <p className="text-[10px] text-neutral-400 font-medium">
            Your #1 listened artist • {artist.playCount} total plays • {artist.trackCount} tracks in library
          </p>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed max-w-xl font-sans">
          {loading ? 'Retrieving Wikipedia summary...' : wikiData?.description || extractText}
        </p>

        <div className="flex items-center gap-3 mt-1.5">
          <button
            onClick={() => onPlay(artist.name)}
            className="flex items-center gap-1.5 bg-white text-black hover:bg-neutral-200 px-5 py-2 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 shadow-md cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>Play Spotlight</span>
          </button>
          
          <button
            onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
            className="flex items-center gap-1.5 border border-white/20 bg-white/5 text-white hover:bg-white/10 px-5 py-2 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 shadow-md cursor-pointer"
          >
            <span>View Profile</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-component for circular artist card
const ArtistCard: React.FC<{ artist: ArtistStats }> = ({ artist }) => {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(true);

  const initials = useMemo(() => {
    const parts = artist.name.split(' ').filter(Boolean);
    if (parts.length === 0) return 'A';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [artist.name]);

  useEffect(() => {
    let active = true;
    const fetchArtistImage = async () => {
      // Check memory cache first
      if (artistImageCache.has(artist.name)) {
        setImageUrl(artistImageCache.get(artist.name) || null);
        setLoadingImg(false);
        return;
      }

      setLoadingImg(true);
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist.name)}`
        );
        if (res.ok) {
          const data = await res.json();
          const source = data.originalimage?.source || data.thumbnail?.source || null;
          if (active) {
            setImageUrl(source);
            artistImageCache.set(artist.name, source);
          }
        } else {
          if (active) artistImageCache.set(artist.name, null);
        }
      } catch (err) {
        console.error(`Failed to fetch Wikipedia photo for ${artist.name}:`, err);
        if (active) artistImageCache.set(artist.name, null);
      } finally {
        if (active) setLoadingImg(false);
      }
    };

    fetchArtistImage();
    return () => {
      active = false;
    };
  }, [artist.name]);

  const handleCardClick = () => {
    navigate(`/artist/${encodeURIComponent(artist.name)}`);
  };

  return (
    <div 
      onClick={handleCardClick}
      className="artist-card-item group cursor-pointer flex flex-col items-center text-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all duration-300 hover:scale-[1.04] relative overflow-visible"
    >
      {/* Circular Image / Placeholder with Back Glow */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-4 shrink-0 select-none">
        {/* radial glow back element */}
        <div 
          className="absolute inset-0 rounded-full blur-xl scale-125 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"
          style={{
            background: `radial-gradient(circle, ${getGlowColor(artist.name)} 0%, transparent 70%)`
          }}
        />

        <div className="relative z-10 w-full h-full rounded-full overflow-hidden shadow-lg border border-white/10 group-hover:shadow-indigo-500/20 group-hover:border-white/20 transition-all duration-300">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={artist.name} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center font-bold text-lg select-none text-white/90"
              style={{ background: getGradientByName(artist.name) }}
            >
              {loadingImg ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="tracking-wide text-xl">{initials}</span>
              )}
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-all duration-300" />
        </div>
      </div>

      {/* Artist Text Details */}
      <span className="font-semibold text-xs sm:text-sm text-neutral-200 group-hover:text-white transition-colors truncate w-full max-w-[130px] relative z-10">
        {artist.name}
      </span>
      
      <span className="text-[10px] text-neutral-500 group-hover:text-neutral-400 transition-colors mt-1 select-none font-medium relative z-10">
        {artist.playCount} {artist.playCount === 1 ? 'play' : 'plays'} • {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
      </span>
    </div>
  );
};

export const ArtistsView: React.FC<ArtistsViewProps> = ({ refreshTrigger = 0, triggerRefresh }) => {
  const [artists, setArtists] = useState<ArtistStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const { getPlaybackHistory, getAllTracks, getAllFavorites } = useLibraryDB();
  const setQueue = usePlayerStore(state => state.setQueue);

  useEffect(() => {
    const loadArtistsData = async () => {
      setLoading(true);
      try {
        const [history, tracks, favIds] = await Promise.all([
          getPlaybackHistory(),
          getAllTracks(),
          getAllFavorites()
        ]);

        const artistStatsMap = new Map<string, ArtistStats>();

        // 1. Process Library Tracks to initialize track counts
        for (const track of tracks) {
          const name = (track.artist || '').trim();
          if (!name) continue;

          const normalized = name; 
          const lowerName = name.toLowerCase();

          let key = normalized;
          for (const k of artistStatsMap.keys()) {
            if (k.toLowerCase() === lowerName) {
              key = k;
              break;
            }
          }

          let stats = artistStatsMap.get(key);
          if (!stats) {
            stats = {
              name: key,
              playCount: 0,
              trackCount: 0,
              isFavorite: false,
              lastPlayed: 0
            };
            artistStatsMap.set(key, stats);
          }
          stats.trackCount++;
          
          if (favIds.includes(track.id)) {
            stats.isFavorite = true;
          }
        }

        // 2. Process Playback History to tally plays and recency
        const trackMap = new Map(tracks.map(t => [t.id, t]));
        for (const entry of history) {
          const track = trackMap.get(entry.trackId);
          if (!track) continue;

          const name = (track.artist || '').trim();
          if (!name) continue;

          const lowerName = name.toLowerCase();
          let key = name;
          for (const k of artistStatsMap.keys()) {
            if (k.toLowerCase() === lowerName) {
              key = k;
              break;
            }
          }

          let stats = artistStatsMap.get(key);
          if (!stats) {
            stats = {
              name: key,
              playCount: 0,
              trackCount: 0, 
              isFavorite: false,
              lastPlayed: 0
            };
            artistStatsMap.set(key, stats);
          }
          stats.playCount++;
          if (entry.playedAt > stats.lastPlayed) {
            stats.lastPlayed = entry.playedAt;
          }
        }

        const list = Array.from(artistStatsMap.values());

        // Smart Sort: plays -> last played -> tracks count -> alpha
        list.sort((a, b) => {
          if (b.playCount !== a.playCount) {
            return b.playCount - a.playCount;
          }
          if (b.lastPlayed !== a.lastPlayed) {
            return b.lastPlayed - a.lastPlayed;
          }
          if (b.trackCount !== a.trackCount) {
            return b.trackCount - a.trackCount;
          }
          return a.name.localeCompare(b.name);
        });

        setArtists(list);
      } catch (err) {
        console.error('[ArtistsView] Failed to compute artist statistics:', err);
      } finally {
        setLoading(false);
      }
    };

    loadArtistsData();
  }, [refreshTrigger]);

  // Apply staggered GSAP animation to artist cards on render
  useGsapFadeIn('.artist-card-item', artists.length, 0.02);
  useGsapFadeIn('.spotlight-banner', 1, 0.1);

  // Filter list based on search query
  const filteredArtists = useMemo(() => {
    const cleanQuery = searchQuery.toLowerCase().trim();
    if (!cleanQuery) return artists;
    return artists.filter(a => a.name.toLowerCase().includes(cleanQuery));
  }, [artists, searchQuery]);

  // Group artists alphabetically for jump indexes
  const groupedArtists = useMemo(() => {
    const groups: { [key: string]: ArtistStats[] } = {};
    for (const artist of filteredArtists) {
      const firstChar = artist.name.trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(artist);
    }
    
    return Object.keys(groups)
      .sort((a, b) => {
        if (a === '#') return 1;
        if (b === '#') return -1;
        return a.localeCompare(b);
      })
      .map(key => ({
        letter: key,
        artists: groups[key].sort((a, b) => a.name.localeCompare(b.name))
      }));
  }, [filteredArtists]);

  const activeLetters = useMemo(() => {
    return new Set(groupedArtists.map(g => g.letter));
  }, [groupedArtists]);

  const spotlightArtist = useMemo(() => {
    return artists.length > 0 ? artists[0] : null;
  }, [artists]);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

  const scrollToLetter = (letter: string) => {
    const element = document.getElementById(`artist-group-${letter}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePlayArtistTracks = async (artistName: string) => {
    try {
      const tracks = await getAllTracks();
      const artistTracks = tracks.filter(
        t => t.artist.toLowerCase() === artistName.toLowerCase()
      );
      if (artistTracks.length > 0) {
        setQueue(artistTracks, 0);
      }
    } catch (err) {
      console.error('Failed to play artist tracks:', err);
    }
  };

  return (
    <div className="flex gap-4 h-full relative text-white select-none">
      {/* Left side: Main scrollable list */}
      <div className="flex-1 flex flex-col gap-6 h-full overflow-y-auto pb-10 pr-2 scroll-smooth no-scrollbar">
        {/* Header section */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <User className="w-5.5 h-5.5 text-primary" />
              <h2 className="text-xl font-bold tracking-wide">Artists</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Smart compilation of artists from your music library and listening habits ({artists.length} artists)
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artists..."
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-neutral-900 border border-white/5 placeholder-neutral-500 text-white focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        {/* Spotlight Banner - Only show if not searching and we have a top artist */}
        {!searchQuery && spotlightArtist && !loading && (
          <SpotlightBanner artist={spotlightArtist} onPlay={handlePlayArtistTracks} />
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="flex flex-col items-center p-4 bg-white/[0.01] rounded-2xl border border-white/5 gap-3">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full shimmer" />
                <div className="h-4 w-20 rounded shimmer" />
                <div className="h-3.5 w-24 rounded shimmer" />
              </div>
            ))}
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <User className="w-7 h-7 text-neutral-500" />
            </div>
            <h3 className="text-sm font-bold mb-1">No Artists Found</h3>
            <p className="text-xs text-neutral-500 max-w-sm">
              {searchQuery ? "No matching artists match your search query." : "Upload music or play some tracks to start building your library."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {groupedArtists.map(({ letter, artists: letterArtists }) => (
              <div 
                key={letter} 
                id={`artist-group-${letter}`} 
                className="flex flex-col gap-4 scroll-mt-6"
              >
                <div className="flex items-center gap-4 select-none">
                  <h3 className="text-sm font-extrabold text-primary font-mono w-6 text-center">{letter}</h3>
                  <div className="h-[1px] bg-white/5 flex-1" />
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {letterArtists.map((artist) => (
                    <ArtistCard key={artist.name} artist={artist} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right side: Alphabet jump list */}
      {groupedArtists.length > 0 && !loading && (
        <div className="hidden sm:flex flex-col justify-center items-center py-4 text-[9px] font-mono font-bold select-none sticky top-0 h-full shrink-0 z-30">
          <div className="flex flex-col gap-0.5 bg-white/[0.01] border border-white/5 px-2 py-3 rounded-2xl backdrop-blur-md">
            {alphabet.map((char) => {
              const hasArtists = activeLetters.has(char);
              return (
                <button
                  key={char}
                  onClick={() => hasArtists && scrollToLetter(char)}
                  disabled={!hasArtists}
                  className={`w-5 h-4.5 flex items-center justify-center rounded transition-all duration-200 ${
                    hasArtists
                      ? 'text-primary hover:text-white hover:bg-primary/20 cursor-pointer'
                      : 'text-neutral-700 cursor-not-allowed opacity-30'
                  }`}
                >
                  {char}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtistsView;
