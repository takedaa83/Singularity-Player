import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Search, Music, Sparkles } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';
import { useGsapFadeIn } from '../../hooks/useGsap';
import { tokens } from '../../theme/muiTheme';

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

// Memory cache for Wikipedia artist images to prevent double fetches
const artistImageCache = new Map<string, string | null>();

// Sub-component for circular artist card to isolate API fetch overhead
const ArtistCard: React.FC<{ artist: ArtistStats }> = ({ artist }) => {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(true);

  // Generate a beautiful consistent gradient background based on name
  const getGradientByName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${h1}, 65%, 35%) 0%, hsl(${h2}, 60%, 15%) 100%)`;
  };

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
        // Fetch summary from Wikipedia API
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
      className="artist-card-item group cursor-pointer flex flex-col items-center text-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all duration-300 hover:scale-[1.04]"
    >
      {/* Circular Image / Placeholder */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden mb-4 shadow-lg border border-white/10 shrink-0 select-none group-hover:shadow-indigo-500/20 group-hover:border-white/20 transition-all duration-300">
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
        
        {/* Glow backdrop inside card */}
        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-all duration-300" />
      </div>

      {/* Artist Text Details */}
      <span className="font-semibold text-xs sm:text-sm text-neutral-200 group-hover:text-white transition-colors truncate w-full max-w-[130px]">
        {artist.name}
      </span>
      
      <span className="text-[10px] text-neutral-500 group-hover:text-neutral-400 transition-colors mt-1 select-none font-medium">
        {artist.playCount} {artist.playCount === 1 ? 'play' : 'plays'} • {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
      </span>
    </div>
  );
};

export const ArtistsView: React.FC<ArtistsViewProps> = ({ refreshTrigger = 0, triggerRefresh }) => {
  const [artists, setArtists] = useState<ArtistStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const { getPlaybackHistory, getAllTracks, getAllFavorites } = useLibraryDB();

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

          // Normalize casing to match names correctly
          const normalized = name; 
          const lowerName = name.toLowerCase();

          // Find key (if case-insensitive match already exists)
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
              trackCount: 0, // not in library
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

        // Convert Map to array
        const list = Array.from(artistStatsMap.values());

        // Smart Sort:
        // Prioritize by plays, then by recency, then by track count, and lastly alphabetical
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
  useGsapFadeIn('.artist-card-item', artists.length, 0.03);

  // Filter list based on search query
  const filteredArtists = useMemo(() => {
    const cleanQuery = searchQuery.toLowerCase().trim();
    if (!cleanQuery) return artists;
    return artists.filter(a => a.name.toLowerCase().includes(cleanQuery));
  }, [artists, searchQuery]);

  return (
    <div className="flex flex-col gap-6 text-white h-full overflow-y-auto pb-10 pr-2 select-none">
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

      {/* Grid displays */}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredArtists.map((artist) => (
            <ArtistCard key={artist.name} artist={artist} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ArtistsView;
