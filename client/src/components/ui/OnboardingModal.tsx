import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Music2, User, Check, ArrowRight, Flame } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { api } from '../../utils/api';
import { usePlayerStore } from '../../stores/playerStore';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const POPULAR_GENRES = [
  'Bollywood', 'Pop', 'Hip Hop', 'Punjabi', 'R&B', 'Rock', 'Indie', 'Lo-Fi', 'EDM', 'K-Pop', 'Melodic'
];

const POPULAR_ARTISTS = [
  'Arijit Singh', 'The Weeknd', 'Taylor Swift', 'Drake', 'Badshah', 
  'Shreya Ghoshal', 'Travis Scott', 'Ed Sheeran', 'Post Malone', 'BTS', 'Pritam', 'Diljit Dosanjh'
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Bollywood', 'Pop']);
  const [selectedArtists, setSelectedArtists] = useState<string[]>(['Arijit Singh', 'The Weeknd']);
  const [customArtistInput, setCustomArtistInput] = useState('');
  const [loading, setLoading] = useState(false);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const playTrack = usePlayerStore((s) => s.playTrack);

  if (!isOpen) return null;

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const toggleArtist = (artist: string) => {
    if (selectedArtists.includes(artist)) {
      setSelectedArtists(selectedArtists.filter(a => a !== artist));
    } else {
      setSelectedArtists([...selectedArtists, artist]);
    }
  };

  const handleAddCustomArtist = () => {
    const trimmed = customArtistInput.trim();
    if (trimmed && !selectedArtists.includes(trimmed)) {
      setSelectedArtists([...selectedArtists, trimmed]);
      setCustomArtistInput('');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      localStorage.setItem('singularity_onboarding_completed', 'true');
      updateSetting('autoSync', false);

      // Fetch top track for the first selected artist to seed the player queue
      const primaryArtist = selectedArtists[0] || selectedGenres[0] || 'Arijit Singh';
      const searchRes = await api.search(`${primaryArtist} top hits`);
      if (searchRes && searchRes.length > 0) {
        playTrack(searchRes[0], searchRes.slice(0, 15));
      }
    } catch (e) {
      console.error('Onboarding setup failed:', e);
    } finally {
      setLoading(false);
      onComplete();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl text-white"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="w-full max-w-xl bg-neutral-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col gap-6"
        >
          {/* Header Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="flex flex-col gap-2 text-center relative z-10">
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold w-fit mx-auto">
              <Sparkles className="w-3.5 h-3.5" />
              Welcome to Singularity Player
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">
              Personalize Your Music Taste
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              Pick your favorite genres and artists to build your custom home feed.
            </p>
          </div>

          {/* Section 1: Genres */}
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <Music2 className="w-4 h-4 text-primary" />
              1. Choose Genres
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto no-scrollbar py-1">
              {POPULAR_GENRES.map((g) => {
                const isSelected = selectedGenres.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? 'bg-primary text-black shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]'
                        : 'bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Artists */}
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <User className="w-4 h-4 text-primary" />
              2. Choose Favorite Artists
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto no-scrollbar py-1">
              {POPULAR_ARTISTS.map((a) => {
                const isSelected = selectedArtists.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleArtist(a)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? 'bg-white text-black shadow-md'
                        : 'bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black" />}
                    {a}
                  </button>
                );
              })}
            </div>
            
            {/* Custom Artist Input */}
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={customArtistInput}
                onChange={(e) => setCustomArtistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomArtist()}
                placeholder="Add any other artist..."
                className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleAddCustomArtist}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 relative z-10">
            <button
              onClick={handleSubmit}
              disabled={loading || (selectedGenres.length === 0 && selectedArtists.length === 0)}
              className="w-full py-3.5 rounded-2xl bg-white text-black font-extrabold text-sm hover:bg-neutral-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(255,255,255,0.2)] disabled:opacity-50"
            >
              {loading ? (
                <span>Building Your Experience...</span>
              ) : (
                <>
                  <span>Start Listening</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
