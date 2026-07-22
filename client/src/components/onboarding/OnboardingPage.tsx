import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, ArrowRight, Music, Heart, Disc, Search, Globe, ChevronRight } from 'lucide-react';
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
}

const LANGUAGES = [
  { id: 'en', name: 'English', flag: '🌐' },
  { id: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { id: 'pa', name: 'Punjabi', flag: '🌾' },
  { id: 'es', name: 'Spanish', flag: '🇪🇸' },
  { id: 'ko', name: 'Korean (K-Pop)', flag: '🇰🇷' },
  { id: 'ja', name: 'Japanese (Anime/J-Pop)', flag: '🇯🇵' },
  { id: 'fr', name: 'French', flag: '🇫🇷' },
  { id: 'ta', name: 'Tamil', flag: '🎶' },
  { id: 'te', name: 'Telugu', flag: '🎵' },
  { id: 'de', name: 'German', flag: '🇩🇪' },
];

const GENRES = [
  { id: 'pop', name: 'Pop', color: 'from-pink-500 to-rose-600', icon: '🎤' },
  { id: 'hiphop', name: 'Hip-Hop / Rap', color: 'from-amber-500 to-red-600', icon: '🎧' },
  { id: 'bollywood', name: 'Bollywood', color: 'from-orange-500 to-yellow-500', icon: '🪘' },
  { id: 'punjabi', name: 'Punjabi Hits', color: 'from-yellow-400 to-orange-600', icon: '🎺' },
  { id: 'rnb', name: 'R&B / Soul', color: 'from-purple-600 to-indigo-700', icon: '🎷' },
  { id: 'rock', name: 'Rock / Alternative', color: 'from-red-600 to-zinc-800', icon: '🎸' },
  { id: 'kpop', name: 'K-Pop', color: 'from-fuchsia-500 to-purple-600', icon: '✨' },
  { id: 'edm', name: 'EDM / Dance', color: 'from-cyan-500 to-blue-600', icon: '⚡' },
  { id: 'indie', name: 'Indie & Acoustic', color: 'from-emerald-500 to-teal-700', icon: '🌿' },
  { id: 'lofi', name: 'Lo-Fi / Chill', color: 'from-indigo-400 to-violet-600', icon: '☕' },
  { id: 'metal', name: 'Metal', color: 'from-zinc-700 to-neutral-900', icon: '🤘' },
  { id: 'classical', name: 'Classical', color: 'from-yellow-600 to-amber-800', icon: '🎻' },
];

const INITIAL_ARTISTS: ArtistItem[] = [
  {
    id: 'the-weeknd',
    name: 'The Weeknd',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    genre: 'R&B / Pop',
    related: ['Frank Ocean', 'SZA', 'Giveon']
  },
  {
    id: 'drake',
    name: 'Drake',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80',
    genre: 'Hip-Hop',
    related: ['21 Savage', 'Future', 'Lil Baby']
  },
  {
    id: 'taylor-swift',
    name: 'Taylor Swift',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
    genre: 'Pop',
    related: ['Sabrina Carpenter', 'Olivia Rodrigo', 'Gracie Abrams']
  },
  {
    id: 'arijit-singh',
    name: 'Arijit Singh',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80',
    genre: 'Bollywood',
    related: ['Pritam', 'Atif Aslam', 'Shreya Ghoshal']
  },
  {
    id: 'billie-eilish',
    name: 'Billie Eilish',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80',
    genre: 'Indie Pop',
    related: ['Lorde', 'Lana Del Rey', 'FINNEAS']
  },
  {
    id: 'travis-scott',
    name: 'Travis Scott',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80',
    genre: 'Hip-Hop / Trap',
    related: ['Don Toliver', 'Playboi Carti', 'Metro Boomin']
  },
  {
    id: 'badshah',
    name: 'Badshah',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80',
    genre: 'Punjabi / Hip-Hop',
    related: ['Yo Yo Honey Singh', 'Divine', 'King']
  },
  {
    id: 'bts',
    name: 'BTS',
    image: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=80',
    genre: 'K-Pop',
    related: ['BLACKPINK', 'Stray Kids', 'TWICE']
  },
  {
    id: 'bruno-mars',
    name: 'Bruno Mars',
    image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80',
    genre: 'Pop / R&B',
    related: ['Anderson .Paak', 'Silk Sonic', 'Post Malone']
  },
  {
    id: 'diljit-dosanjh',
    name: 'Diljit Dosanjh',
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&auto=format&fit=crop&q=80',
    genre: 'Punjabi',
    related: ['Karan Aujla', 'AP Dhillon', 'Sidhu Moose Wala']
  },
  {
    id: 'kendrick-lamar',
    name: 'Kendrick Lamar',
    image: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=500&auto=format&fit=crop&q=80',
    genre: 'Hip-Hop',
    related: ['J. Cole', 'Baby Keem', 'Tyler, The Creator']
  },
  {
    id: 'dua-lipa',
    name: 'Dua Lipa',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80',
    genre: 'Dance Pop',
    related: ['Charli xcx', 'Calvin Harris', 'Bebe Rexha']
  }
];

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en', 'hi']);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['pop', 'hiphop', 'bollywood']);
  const [artistList, setArtistList] = useState<ArtistItem[]>(INITIAL_ARTISTS);
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set(['the-weeknd', 'arijit-singh']));
  const [searchQuery, setSearchQuery] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const toggleLanguage = (id: string) => {
    if (selectedLanguages.includes(id)) {
      setSelectedLanguages(selectedLanguages.filter(l => l !== id));
    } else {
      setSelectedLanguages([...selectedLanguages, id]);
    }
  };

  const toggleGenre = (id: string) => {
    if (selectedGenres.includes(id)) {
      setSelectedGenres(selectedGenres.filter(g => g !== id));
    } else {
      setSelectedGenres([...selectedGenres, id]);
    }
  };

  const toggleArtist = (artist: ArtistItem) => {
    const next = new Set(selectedArtists);
    const isSelecting = !next.has(artist.id);

    if (isSelecting) {
      next.add(artist.id);

      // Spotify-style: Dynamically spawn related artists into the grid if available
      if (artist.related && artist.related.length > 0) {
        const existingNames = new Set(artistList.map(a => a.name.toLowerCase()));
        const newSpawned: ArtistItem[] = [];

        for (const relName of artist.related) {
          if (!existingNames.has(relName.toLowerCase())) {
            newSpawned.push({
              id: relName.toLowerCase().replace(/\s+/g, '-'),
              name: relName,
              image: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random()*100000)}?w=500&auto=format&fit=crop&q=80`,
              genre: artist.genre,
            });
          }
        }

        if (newSpawned.length > 0) {
          const index = artistList.findIndex(a => a.id === artist.id);
          const updated = [...artistList];
          updated.splice(index + 1, 0, ...newSpawned);
          setArtistList(updated);
        }
      }
    } else {
      next.delete(artist.id);
    }

    setSelectedArtists(next);
  };

  const handleFinish = async () => {
    setIsBuilding(true);
    try {
      localStorage.setItem('singularity_onboarding_completed', 'true');
      updateSetting('autoSync', false);

      // Fetch top track for the first selected artist to seed initial listening queue
      const firstArtistName = artistList.find(a => selectedArtists.has(a.id))?.name || 'The Weeknd';
      const results = await api.search(`${firstArtistName} top songs`);

      if (results && results.length > 0) {
        playTrack(results[0], results.slice(0, 20));
      }
    } catch (e) {
      console.error('[Onboarding] Error building music recommendations:', e);
    } finally {
      setIsBuilding(false);
      navigate('/', { replace: true });
    }
  };

  const filteredArtists = artistList.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.genre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* Dynamic Background Ambient Blur */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-primary/30 via-purple-600/10 to-transparent blur-[140px] pointer-events-none" />

      {/* Header Bar */}
      <header className="relative z-10 w-full px-6 py-6 flex items-center justify-between border-b border-white/10 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
            <Disc className="w-6 h-6 animate-spin-slow" />
          </div>
          <span className="text-xl font-black tracking-tight text-white">Singularity</span>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <span className={step === 1 ? 'text-primary font-bold' : ''}>1. Languages</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className={step === 2 ? 'text-primary font-bold' : ''}>2. Genres</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className={step === 3 ? 'text-primary font-bold' : ''}>3. Artists</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col">
        <AnimatePresence mode="wait">
          {/* STAGE 1: LANGUAGES */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-primary font-bold w-fit">
                  <Globe className="w-3.5 h-3.5" /> Step 1 of 3
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight">What languages do you listen to?</h1>
                <p className="text-sm text-neutral-400">Select one or more languages to personalize your home discovery shelves.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 my-4">
                {LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang.id);
                  return (
                    <button
                      key={lang.id}
                      onClick={() => toggleLanguage(lang.id)}
                      className={`p-5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-32 relative overflow-hidden active:scale-95 ${
                        isSelected
                          ? 'bg-primary/15 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <span className="text-3xl">{lang.flag}</span>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{lang.name}</span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-primary text-black flex items-center justify-center">
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

          {/* STAGE 2: GENRES */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-primary font-bold w-fit">
                  <Music className="w-3.5 h-3.5" /> Step 2 of 3
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Choose your favorite genres</h1>
                <p className="text-sm text-neutral-400">Pick genres you love to tune your automatic recommendations.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 my-4">
                {GENRES.map((g) => {
                  const isSelected = selectedGenres.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGenre(g.id)}
                      className={`h-36 rounded-2xl p-5 border text-left flex flex-col justify-between relative overflow-hidden transition-all duration-200 active:scale-95 bg-gradient-to-br ${g.color} ${
                        isSelected
                          ? 'ring-4 ring-white shadow-2xl scale-[1.02]'
                          : 'opacity-85 hover:opacity-100 hover:scale-[1.01]'
                      }`}
                    >
                      <span className="text-4xl select-none">{g.icon}</span>
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-lg text-white shadow-sm">{g.name}</span>
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

          {/* STAGE 3: ARTISTS (SPOTIFY-STYLE WITH DYNAMIC EXPANSION) */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-primary font-bold w-fit">
                    <Heart className="w-3.5 h-3.5" /> Step 3 of 3
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Pick your favorite artists</h1>
                  <p className="text-sm text-neutral-400">Selecting an artist dynamically reveals similar artists next to them!</p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search artists..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white/10 border border-white/10 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Artist Grid */}
              <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 my-4 max-h-[50vh] overflow-y-auto no-scrollbar pr-1">
                {filteredArtists.map((artist) => {
                  const isSelected = selectedArtists.has(artist.id);
                  return (
                    <motion.div
                      layout
                      key={artist.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      onClick={() => toggleArtist(artist)}
                      className={`flex flex-col items-center gap-3 p-4 rounded-2xl cursor-pointer border transition-all duration-200 relative ${
                        isSelected
                          ? 'bg-white/15 border-primary shadow-[0_0_25px_rgba(var(--primary-rgb),0.35)] scale-105'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 hover:scale-102'
                      }`}
                    >
                      {/* Circular Avatar */}
                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shadow-lg border-2 border-white/10">
                        <img
                          src={artist.image}
                          alt={artist.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
                          }}
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/40 backdrop-blur-[2px] flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center shadow-lg">
                              <Check className="w-5 h-5 stroke-[3]" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex flex-col text-center min-w-0 w-full">
                        <span className="font-bold text-xs sm:text-sm truncate text-white">{artist.name}</span>
                        <span className="text-[11px] text-neutral-400 truncate mt-0.5">{artist.genre}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              {/* Bottom Finish Bar */}
              <div className="mt-auto pt-6 flex justify-between items-center border-t border-white/10">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-full bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-all"
                >
                  Back
                </button>
                
                <div className="flex items-center gap-4">
                  <span className="text-xs text-neutral-400 font-semibold">
                    {selectedArtists.size} artist{selectedArtists.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={handleFinish}
                    disabled={isBuilding || selectedArtists.size === 0}
                    className="px-8 py-4 rounded-full bg-white text-black font-extrabold text-sm hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(255,255,255,0.25)] disabled:opacity-50"
                  >
                    {isBuilding ? (
                      <span>Building Your Experience...</span>
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
