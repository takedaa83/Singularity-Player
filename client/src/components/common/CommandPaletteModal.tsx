/**
 * Raycast / Linear-Style Command Palette Modal
 * Fast, keyboard-first command launcher with instant fuzzy search across
 * tracks, playlists, AI studio tools, audio FX, and system theme toggles.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, Command, Play, Mic, Sparkles, Sliders, Moon, Sun, Flame, Radio, Music, X, CornerDownLeft } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface CommandPaletteModalProps {
  onClose: () => void;
  onOpenStemSeparator: () => void;
  onOpenPitchHarmonizer: () => void;
  onOpenAiMastering: () => void;
  onOpenFocusMode: () => void;
  onOpenMusicalDna: () => void;
  onOpenAiSuggestions: () => void;
  onOpenAiPlaylistStudio: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Actions' | 'AI Studio' | 'Audio FX' | 'Navigation';
  icon: React.ReactNode;
  action: () => void;
  shortcut?: string;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  onClose,
  onOpenStemSeparator,
  onOpenPitchHarmonizer,
  onOpenAiMastering,
  onOpenFocusMode,
  onOpenMusicalDna,
  onOpenAiSuggestions
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const theme = useSettingsStore((s) => s.settings.theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands: CommandItem[] = [
    {
      id: 'toggle-play',
      title: isPlaying ? 'Pause Playback' : 'Play Audio',
      category: 'Actions',
      icon: <Play className="w-4 h-4 text-amber-400" />,
      action: () => { setPlaying(!isPlaying); onClose(); },
      shortcut: 'Space'
    },
    {
      id: 'next-track',
      title: 'Skip to Next Track',
      category: 'Actions',
      icon: <Flame className="w-4 h-4 text-amber-400" />,
      action: () => { nextTrack(true); onClose(); },
      shortcut: 'N'
    },
    {
      id: 'prev-track',
      title: 'Previous Track',
      category: 'Actions',
      icon: <Flame className="w-4 h-4 text-amber-400 rotate-180" />,
      action: () => { prevTrack(); onClose(); },
      shortcut: 'P'
    },
    {
      id: 'toggle-mute',
      title: 'Toggle Audio Mute',
      category: 'Actions',
      icon: <Sliders className="w-4 h-4 text-amber-400" />,
      action: () => { toggleMute(); onClose(); },
      shortcut: 'M'
    },
    {
      id: 'ai-stems',
      title: 'AI Stem Separator (Vocals, Drums, Bass)',
      category: 'AI Studio',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
      action: () => { onOpenStemSeparator(); onClose(); },
      shortcut: 'S'
    },
    {
      id: 'ai-autotune',
      title: 'AI Pitch Harmonizer & Auto-Tune',
      category: 'AI Studio',
      icon: <Mic className="w-4 h-4 text-pink-400" />,
      action: () => { onOpenPitchHarmonizer(); onClose(); }
    },
    {
      id: 'ai-mastering',
      title: 'AI Smart Auto-Mastering EQ Curves',
      category: 'AI Studio',
      icon: <Sliders className="w-4 h-4 text-indigo-400" />,
      action: () => { onOpenAiMastering(); onClose(); }
    },
    {
      id: 'ai-suggestions',
      title: 'AI Neural Song Suggestions',
      category: 'AI Studio',
      icon: <Radio className="w-4 h-4 text-purple-400" />,
      action: () => { onOpenAiSuggestions(); onClose(); }
    },
    {
      id: 'ai-playlist-studio',
      title: 'AI Playlist Studio (Camelot Wheel & Energy Arcs)',
      category: 'AI Studio',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      action: () => { onOpenAiPlaylistStudio(); onClose(); }
    },
    {
      id: 'focus-mode',
      title: 'Pomodoro Focus Mode & Soundscapes',
      category: 'Navigation',
      icon: <Music className="w-4 h-4 text-emerald-400" />,
      action: () => { onOpenFocusMode(); onClose(); },
      shortcut: 'F'
    },
    {
      id: 'musical-dna',
      title: 'View SVG Musical DNA Analytics',
      category: 'Navigation',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      action: () => { onOpenMusicalDna(); onClose(); }
    },
    {
      id: 'toggle-theme',
      title: `Switch Theme to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      category: 'Navigation',
      icon: theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-purple-300" />,
      action: () => { updateSetting('theme', theme === 'dark' ? 'light' : 'dark'); onClose(); }
    }
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div
        className="relative w-full max-w-xl rounded-2xl bg-neutral-900/90 border border-neutral-800/90 text-white shadow-2xl overflow-hidden flex flex-col glass-card"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Field */}
        <div className="flex items-center px-4 py-3.5 border-b border-neutral-800/80 gap-3">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command or search actions... (e.g., Auto-Tune, Stems, Play)"
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
          />
          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
            ESC
          </span>
        </div>

        {/* Command Results List */}
        <div className="max-h-[340px] overflow-y-auto p-2 flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 font-mono">
              No matching commands found for "{query}"
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
                      : 'text-neutral-300 hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-neutral-800 border border-neutral-700/50">
                      {cmd.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold truncate">{cmd.title}</span>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">{cmd.category}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {cmd.shortcut && (
                      <span className="text-[10px] font-mono text-neutral-400 bg-black/40 px-2 py-0.5 rounded border border-neutral-800">
                        {cmd.shortcut}
                      </span>
                    )}
                    {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="px-4 py-2 bg-black/40 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>Singularity Engine v2.0</span>
        </div>
      </div>
    </div>
  );
};
