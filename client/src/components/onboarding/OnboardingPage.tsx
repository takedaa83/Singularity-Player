import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkles, Check, ArrowRight, Music, Disc, Search, X,
  Radio, Headphones, Volume2, Mic2, Flame, RefreshCw, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlayerStore } from '../../stores/playerStore';
import { api } from '../../utils/api';

interface ArtistItem {
  id: string;
  name: string;
  image: string;
  genre: string;
  related?: string[];
  isCustom?: boolean;
  isLoadingImage?: boolean;
}

const LANGUAGES = [
  { id: 'en', name: 'English', desc: 'Global Hits & Pop' },
  { id: 'hi', name: 'Hindi', desc: 'Bollywood & Indie' },
  { id: 'pa', name: 'Punjabi', desc: 'Bhangra & Pop' },
  { id: 'es', name: 'Spanish', desc: 'Latin & Reggaeton' },
  { id: 'ko', name: 'Korean', desc: 'K-Pop & R&B' },
  { id: 'ja', name: 'Japanese', desc: 'J-Pop & Anime' },
  { id: 'fr', name: 'French', desc: 'Chanson & Electro' },
  { id: 'ta', name: 'Tamil', desc: 'Kollywood & Folk' },
  { id: 'te', name: 'Telugu', desc: 'Tollywood Hits' },
  { id: 'de', name: 'German', desc: 'Synth & Rock' },
];

const GENRES = [
  { id: 'pop', name: 'Pop', color: 'from-pink-500 via-rose-500 to-red-600', icon: Sparkles },
  { id: 'hiphop', name: 'Hip-Hop / Rap', color: 'from-amber-500 via-orange-600 to-red-700', icon: Headphones },
  { id: 'bollywood', name: 'Bollywood', color: 'from-amber-400 via-yellow-500 to-orange-500', icon: Disc },
  { id: 'punjabi', name: 'Punjabi Hits', color: 'from-yellow-400 via-amber-500 to-orange-600', icon: Radio },
  { id: 'rnb', name: 'R&B / Soul', color: 'from-purple-600 via-indigo-600 to-blue-700', icon: Mic2 },
  { id: 'rock', name: 'Rock / Alt', color: 'from-red-600 via-zinc-800 to-black', icon: Flame },
  { id: 'kpop', name: 'K-Pop', color: 'from-fuchsia-500 via-purple-500 to-pink-600', icon: Zap },
  { id: 'edm', name: 'EDM / Dance', color: 'from-cyan-400 via-blue-500 to-indigo-600', icon: Volume2 },
  { id: 'indie', name: 'Indie Acoustic', color: 'from-emerald-500 via-teal-600 to-cyan-700', icon: Music },
  { id: 'lofi', name: 'Lo-Fi Chill', color: 'from-indigo-400 via-violet-500 to-purple-700', icon: Headphones },
  { id: 'metal', name: 'Metal', color: 'from-neutral-700 via-zinc-800 to-black', icon: Flame },
  { id: 'classical', name: 'Classical', color: 'from-amber-700 via-amber-800 to-neutral-900', icon: Disc },
];

const INITIAL_ARTISTS: ArtistItem[] = [
  { id: 'the-weeknd', name: 'The Weeknd', image: '', genre: 'R&B / Pop', related: ['Frank Ocean', 'SZA', 'Giveon'] },
  { id: 'drake', name: 'Drake', image: '', genre: 'Hip-Hop', related: ['21 Savage', 'Future', 'Lil Baby'] },
  { id: 'taylor-swift', name: 'Taylor Swift', image: '', genre: 'Pop', related: ['Sabrina Carpenter', 'Olivia Rodrigo', 'Gracie Abrams'] },
  { id: 'arijit-singh', name: 'Arijit Singh', image: '', genre: 'Bollywood', related: ['Pritam', 'Atif Aslam', 'Shreya Ghoshal'] },
  { id: 'billie-eilish', name: 'Billie Eilish', image: '', genre: 'Indie Pop', related: ['Lorde', 'Lana Del Rey', 'FINNEAS'] },
  { id: 'travis-scott', name: 'Travis Scott', image: '', genre: 'Hip-Hop / Trap', related: ['Don Toliver', 'Playboi Carti', 'Metro Boomin'] },
  { id: 'badshah', name: 'Badshah', image: '', genre: 'Punjabi / Rap', related: ['Yo Yo Honey Singh', 'Divine', 'King'] },
  { id: 'bts', name: 'BTS', image: '', genre: 'K-Pop', related: ['BLACKPINK', 'Stray Kids', 'TWICE'] },
  { id: 'bruno-mars', name: 'Bruno Mars', image: '', genre: 'Pop / R&B', related: ['Anderson .Paak', 'Silk Sonic', 'Post Malone'] },
  { id: 'diljit-dosanjh', name: 'Diljit Dosanjh', image: '', genre: 'Punjabi', related: ['Karan Aujla', 'AP Dhillon', 'Sidhu Moose Wala'] },
  { id: 'kendrick-lamar', name: 'Kendrick Lamar', image: '', genre: 'Hip-Hop', related: ['J. Cole', 'Baby Keem', 'Tyler, The Creator'] },
  { id: 'dua-lipa', name: 'Dua Lipa', image: '', genre: 'Dance Pop', related: ['Charli xcx', 'Calvin Harris', 'Bebe Rexha'] }
];

// Fetch REAL related artists from similarity graph. Never invent fake names.
const fetchSimilarArtists = async (artistName: string, limit = 3): Promise<string[]> => {
  try {
    const res = await api.similarArtists(artistName, limit);
    return res?.artists || [];
  } catch (e) {
    console.warn('[Onboarding] Similar-artist lookup failed:', e);
    return [];
  }
};

// High-reliability official artist image resolver querying iTunes Search API / Deezer
const fetchRealArtistImage = async (artistName: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data?.results?.[0]?.artworkUrl100) {
        return data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
      }
    }
  } catch (e) {
    // Ignore error and try fallback
  }

  try {
    const results = await api.search(`${artistName} official`);
    if (results && results.length > 0) {
      return api.coverUrl(results[0].coverArtUrl, results[0].videoId);
    }
  } catch (e) {
    // Ignore error
  }

  return null;
};

// Fallback Colored Initials Avatar component for artists
const InitialsAvatar: React.FC<{ name: string }> = ({ name }) => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '🎵';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'from-purple-600 to-blue-600',
    'from-pink-600 to-rose-600',
    'from-amber-500 to-red-600',
    'from-emerald-500 to-teal-700',
    'from-indigo-600 to-violet-800',
    'from-cyan-500 to-blue-700'
  ];
  const selectedColor = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`w-full h-full bg-gradient-to-br ${selectedColor} flex items-center justify-center font-black text-xl text-white shadow-inner`}>
      {initials}
    </div>
  );
};

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en', 'hi']);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['pop', 'hiphop', 'bollywood']);
  
  const [artistList, setArtistList] = useState<ArtistItem[]>(INITIAL_ARTISTS);
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set(['the-weeknd', 'arijit-singh']));
  
  // Real API Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Payoff animation transition state
  const [isBuilding, setIsBuilding] = useState(false);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const playTrack = usePlayerStore((s) => s.playTrack);

  // Fetch real official artist images on load for INITIAL_ARTISTS
  useEffect(() => {
    let isMounted = true;
    const loadImages = async () => {
      const updated = await Promise.all(
        artistList.map(async (artist) => {
          if (artist.image) return artist;
          const realImg = await fetchRealArtistImage(artist.name);
          return { ...artist, image: realImg || '' };
        })
      );
      if (isMounted) {
        setArtistList(updated);
      }
    };
    loadImages();
    return () => { isMounted = false; };
  }, []);

  const toggleLanguage = (id: string) => {
    const updated = selectedLanguages.includes(id)
      ? selectedLanguages.filter(l => l !== id)
      : [...selectedLanguages, id];
    setSelectedLanguages(updated);
  };

  const toggleGenre = (id: string) => {
    const updated = selectedGenres.includes(id)
      ? selectedGenres.filter(g => g !== id)
      : [...selectedGenres, id];
    setSelectedGenres(updated);
  };

  // Debounced real YouTube Music API Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.search(`${searchQuery.trim()} artist`);
        if (results && results.length > 0) {
          const mapped: ArtistItem[] = results.slice(0, 8).map(t => ({
            id: `api-${t.id}`,
            name: t.artist || t.title,
            image: api.coverUrl(t.coverArtUrl, t.videoId) || '',
            genre: t.genre || 'Music Artist',
            isCustom: true
          }));
          setSearchResults(mapped);
        }
      } catch (err) {
        console.warn('[Onboarding] Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Recursive Related Artist Spawning with REAL similarity graph resolution
  const toggleArtist = async (artist: ArtistItem) => {
    const next = new Set(selectedArtists);
    const isSelecting = !next.has(artist.id);

    if (isSelecting) {
      next.add(artist.id);

      // Fetch REAL related artists from similarity graph (never invent fake Radio/Station names!)
      const relatedNames = artist.related?.length
        ? artist.related
        : await fetchSimilarArtists(artist.name, 3);

      const existingNames = new Set(artistList.map(a => a.name.toLowerCase()));
      const newSpawned: ArtistItem[] = [];

      for (const relName of relatedNames) {
        if (!existingNames.has(relName.toLowerCase())) {
          newSpawned.push({
            id: relName.toLowerCase().replace(/\s+/g, '-'),
            name: relName,
            image: '',
            genre: artist.genre,
            isLoadingImage: true
          });
          existingNames.add(relName.toLowerCase()); // Stops dupes within this same batch!
        }
      }

      if (newSpawned.length > 0) {
        const index = artistList.findIndex(a => a.id === artist.id);
        const updated = [...artistList];
        updated.splice(index !== -1 ? index + 1 : updated.length, 0, ...newSpawned);
        setArtistList(updated);

        // Fetch real artist photos in background for the spawned artists
        Promise.all(
          newSpawned.map(async (spawn) => {
            const realImg = await fetchRealArtistImage(spawn.name);
            return { id: spawn.id, image: realImg || '' };
          })
        ).then((resolved) => {
          setArtistList((prev) =>
            prev.map((item) => {
              const match = resolved.find((r) => r.id === item.id);
              return match ? { ...item, image: match.image, isLoadingImage: false } : item;
            })
          );
        });
      }
    } else {
      next.delete(artist.id);
    }

    setSelectedArtists(next);
  };

  const handleSkip = () => {
    localStorage.setItem('singularity_onboarding_completed', 'true');
    navigate('/', { replace: true });
  };

  const handleFinish = async () => {
    if (selectedArtists.size < 3) return;
    
    setIsBuilding(true);

    try {
      localStorage.setItem('singularity_onboarding_completed', 'true');
      updateSetting('autoSync', false);

      const firstArtistName = artistList.find(a => selectedArtists.has(a.id))?.name || 'The Weeknd';
      const results = await api.search(`${firstArtistName} top hits`);

      if (results && results.length > 0) {
        playTrack(results[0], results.slice(0, 20));
      }
    } catch (e) {
      console.error('[Onboarding] Error seeding recommendations:', e);
    }

    setTimeout(() => {
      setIsBuilding(false);
      navigate('/', { replace: true });
    }, 2200);
  };

  const currentArtists = searchQuery.trim() ? searchResults : artistList;
  const minimumRemaining = Math.max(0, 3 - selectedArtists.size);

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* PAYOFF ANIMATED SCREEN */}
      <AnimatePresence>
        {isBuilding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-600/20 blur-[120px] animate-pulse pointer-events-none" />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              className="relative z-10 flex flex-col items-center gap-6"
            >
              <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-primary shadow-[0_0_50px_rgba(var(--primary-rgb),0.5)]">
                <Disc className="w-12 h-12 animate-spin" />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  Personalizing your music library...
                </h2>
                <p className="text-sm text-neutral-400">
                  Curating top shelves based on your favorite artists & genres.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-primary/20 via-purple-600/10 to-transparent blur-[140px] pointer-events-none" />

      {/* TOP FULL-WIDTH PROGRESS BAR & SKIP BAR */}
      <header className="relative z-10 w-full flex flex-col">
        <div className="w-full bg-neutral-900 h-1.5 overflow-hidden flex">
          <motion.div
            className="bg-primary h-full transition-all duration-500 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="px-6 py-4 flex items-center justify-between max-w-7xl w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <Disc className="w-5 h-5 animate-spin-slow" />
            </div>
            <span className="text-lg font-black tracking-tight text-white">Singularity</span>
          </div>

          <button
            onClick={handleSkip}
            className="text-xs font-semibold text-neutral-400 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/10 transition-all"
          >
            Skip for now
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-6 flex flex-col">
        <AnimatePresence mode="wait">
          {/* STEP 1: LANGUAGES */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Step 1 of 3</span>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight">What languages do you listen to?</h1>
                <p className="text-sm text-neutral-400">Select one or more to tune your home discovery shelves.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 my-2">
                {LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang.id);
                  return (
                    <button
                      key={lang.id}
                      aria-pressed={isSelected}
                      onClick={() => toggleLanguage(lang.id)}
                      className={`p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-28 relative overflow-hidden active:scale-95 ${
                        isSelected
                          ? 'bg-primary/15 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <span className="font-extrabold text-base text-white">{lang.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-neutral-400">{lang.desc}</span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-primary text-black flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto pt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={selectedLanguages.length === 0}
                  className="px-8 py-4 rounded-full bg-white text-black font-extrabold text-sm hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  <span>Next: Choose Genres</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: GENRES */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Step 2 of 3</span>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Choose your favorite genres</h1>
                <p className="text-sm text-neutral-400">Pick genres you love to tune your automatic recommendations.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 my-2">
                {GENRES.map((g) => {
                  const isSelected = selectedGenres.includes(g.id);
                  const IconComp = g.icon;
                  return (
                    <button
                      key={g.id}
                      aria-pressed={isSelected}
                      onClick={() => toggleGenre(g.id)}
                      className={`h-32 rounded-2xl p-5 border text-left flex flex-col justify-between relative overflow-hidden transition-all duration-200 active:scale-95 bg-gradient-to-br ${g.color} ${
                        isSelected
                          ? 'ring-4 ring-white shadow-2xl scale-[1.02]'
                          : 'opacity-85 hover:opacity-100 hover:scale-[1.01]'
                      }`}
                    >
                      <IconComp className="w-7 h-7 text-white/90" />
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-base text-white shadow-sm">{g.name}</span>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center shadow-md">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto pt-6 flex justify-between items-center">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-full bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedGenres.length === 0}
                  className="px-8 py-4 rounded-full bg-white text-black font-extrabold text-sm hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  <span>Next: Choose Artists</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: ARTISTS */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Step 3 of 3</span>
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Pick 3 or more artists you love</h1>
                  <p className="text-sm text-neutral-400">Tapping any artist smoothly reveals similar artists next to them!</p>
                </div>

                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any artist live..."
                    className="w-full pl-11 pr-10 py-3 rounded-full bg-white/10 border border-white/10 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-primary"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* ARTIST GRID */}
              {isSearching ? (
                <div className="flex-1 flex items-center justify-center flex-col gap-3 text-neutral-400 py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs font-semibold">Searching YouTube Music for official artists...</span>
                </div>
              ) : (
                <motion.div
                  layout
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 my-2 max-h-[52vh] overflow-y-auto no-scrollbar pr-1"
                >
                  {currentArtists.map((artist) => {
                    const isSelected = selectedArtists.has(artist.id);
                    return (
                      <motion.div
                        layout
                        key={artist.id}
                        transition={{ layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
                        onClick={() => toggleArtist(artist)}
                        aria-pressed={isSelected}
                        className="flex flex-col items-center cursor-pointer group select-none"
                      >
                        {/* Circular Avatar Container */}
                        <div
                          className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 transition-all duration-300 transform-gpu bg-neutral-900 ${
                            isSelected
                              ? 'border-primary ring-4 ring-primary/30 scale-105 shadow-[0_0_25px_rgba(var(--primary-rgb),0.4)]'
                              : 'border-white/10 group-hover:border-white/30 group-hover:scale-102'
                          }`}
                        >
                          {artist.image ? (
                            <img
                              src={artist.image}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <InitialsAvatar name={artist.name} />
                          )}

                          {/* Checkmark Badge */}
                          {isSelected && (
                            <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary text-black flex items-center justify-center shadow-lg border-2 border-black">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          )}
                        </div>

                        {/* Name & Genre BELOW the Circle */}
                        <span className="font-extrabold text-xs sm:text-sm text-white mt-3 text-center truncate max-w-[120px]">
                          {artist.name}
                        </span>
                        <span className="text-[11px] text-neutral-400 text-center truncate max-w-[120px] mt-0.5">
                          {artist.genre}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {/* Bottom Navigation & Finish Bar */}
              <div className="mt-auto pt-4 flex justify-between items-center border-t border-white/10">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-full bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-all"
                >
                  Back
                </button>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-neutral-400 font-semibold hidden sm:inline">
                    {selectedArtists.size} artist{selectedArtists.size !== 1 ? 's' : ''} selected
                  </span>

                  <button
                    onClick={handleFinish}
                    disabled={selectedArtists.size < 3}
                    className="px-8 py-4 rounded-full bg-white text-black font-extrabold text-sm hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(255,255,255,0.25)] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {minimumRemaining > 0 ? (
                      <span>Pick {minimumRemaining} more to continue</span>
                    ) : (
                      <>
                        <span>Finish & Start Listening</span>
                        <Sparkles className="w-4 h-4 fill-black" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default OnboardingPage;
