import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music, Heart, FolderHeart, ListMusic, Plus, Download, Upload, Trash2,
  Sliders, Search, Home, Clock, Settings, ChevronDown, ChevronRight, ChevronLeft, Package, User, Sparkles, Radio
} from 'lucide-react';
import { Box, Typography, IconButton, Tooltip, Divider } from '@mui/material';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Playlist } from '../../types';
import { tokens } from '../../theme/muiTheme';
import { AbstractPlaylistCover } from '../library/AbstractPlaylistCover';
import { useSettingsStore } from '../../stores/settingsStore';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  showEqualizer: boolean;
  setShowEqualizer: (show: boolean) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  onUploadClick: () => void;
  onOpenSpotifyImport?: () => void;
  onOpenFocusMode?: () => void;
  onOpenMusicalDna?: () => void;
  onOpenMusicQuiz?: () => void;
  onOpenMetadataRepair?: () => void;
  onOpenStemSeparator?: () => void;
  onOpenPitchHarmonizer?: () => void;
  onOpenAiMastering?: () => void;
  onOpenAiSimilarity?: () => void;
  onOpenAiPlaylistStudio?: () => void;
  onOpenListenTogether?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  selectedPlaylistId,
  setSelectedPlaylistId,
  showEqualizer,
  setShowEqualizer,
  refreshTrigger,
  triggerRefresh,
  onUploadClick,
  onOpenSpotifyImport,
  onOpenFocusMode,
  onOpenMusicalDna,
  onOpenMusicQuiz,
  onOpenMetadataRepair,
  onOpenStemSeparator,
  onOpenPitchHarmonizer,
  onOpenAiMastering,
  onOpenAiSimilarity,
  onOpenAiPlaylistStudio,
  onOpenListenTogether
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const { getAllPlaylists, savePlaylist, deletePlaylist, getAllTracks, saveTrack, getAllFavorites, toggleFavorite } = useLibraryDB();
  const [showPlaylistInput, setShowPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);

  useEffect(() => {
    const loadPlaylists = async () => {
      const data = await getAllPlaylists();
      setPlaylists(data);
    };
    loadPlaylists();
  }, [refreshTrigger]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newPlaylist: Playlist = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10),
      name: newPlaylistName.trim(),
      description: 'Custom user playlist',
      coverUrl: null,
      trackIds: [],
      createdAt: Date.now()
    };

    await savePlaylist(newPlaylist);
    setNewPlaylistName('');
    setShowPlaylistInput(false);
    triggerRefresh();
  };

  const handleDeletePlaylist = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deletePlaylist(id);
    if (selectedPlaylistId === id) {
      setActiveView('library');
      setSelectedPlaylistId(null);
    }
    triggerRefresh();
  };

  const handleBackup = async () => {
    try {
      const tracks = await getAllTracks();
      const playlistData = await getAllPlaylists();
      const favorites = await getAllFavorites();
      const backupData = {
        version: 2,
        tracks,
        playlists: playlistData,
        favorites,
        exportedAt: Date.now()
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `singularity_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Backup failed:', e);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const backup = JSON.parse(event.target?.result as string);
          if (Array.isArray(backup.tracks)) {
            for (const track of backup.tracks) await saveTrack(track);
          }
          if (Array.isArray(backup.playlists)) {
            for (const playlist of backup.playlists) await savePlaylist(playlist);
          }
          if (Array.isArray(backup.favorites)) {
            for (const trackId of backup.favorites) await toggleFavorite(trackId);
          }
          triggerRefresh();
        } catch (err) {
          console.error('Restore parse error:', err);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('Restore read error:', err);
    }
  };

  const isViewActive = (id: string) => {
    if (id === 'home') return activeView === '/' || activeView === 'home';
    if (id === 'search') return activeView.includes('search');
    if (id === 'library') return activeView.includes('library');
    if (id === 'artists') return activeView.includes('artists') || activeView.includes('artist/');
    if (id === 'favorites') return activeView.includes('favorites');
    if (id === 'history') return activeView.includes('history');
    if (id === 'downloads') return activeView.includes('downloads');
    if (id === 'settings') return activeView.includes('settings');
    if (id === 'batch-download') return activeView.includes('batch-download');
    if (id === 'capsule') return activeView.includes('capsule');
    return activeView === id;
  };

  const mainNav = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'library', icon: FolderHeart, label: 'Library' },
    { id: 'artists', icon: User, label: 'Artists' },
    { id: 'favorites', icon: Heart, label: 'Favorites' },
    { id: 'history', icon: Clock, label: 'History' },
  ];

  const toolsNav = [
    { id: 'capsule', icon: Sparkles, label: 'Time Capsule' },
    { id: 'downloads', icon: Download, label: 'Downloads' },
    { id: 'batch-download', icon: Package, label: 'Batch Packager' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const NavButton: React.FC<{ id: string; icon: any; label: string }> = ({ id, icon: Icon, label }) => {
    const active = isViewActive(id) && !selectedPlaylistId;
    
    const buttonContent = (
      <button
        onClick={() => { setActiveView(id); setSelectedPlaylistId(null); }}
        aria-label={`Navigate to ${label}`}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2.5'} rounded-xl text-[13px] font-medium transition-all duration-200 relative group active:scale-[0.98] ${
          active
            ? 'text-white font-semibold'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
        }`}
        style={active ? {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        } : {
          border: '1px solid transparent',
        }}
      >
        <Icon
          className={`w-[18px] h-[18px] shrink-0 transition-all duration-300 ${
            active 
              ? 'text-primary opacity-100 scale-105' 
              : 'text-slate-400 group-hover:text-white opacity-75 group-hover:opacity-100 group-hover:scale-105'
          }`}
          style={active ? {
            filter: 'drop-shadow(0 0 8px rgba(var(--primary-rgb), 0.5))',
          } : undefined}
        />
        {!sidebarCollapsed && <span className="transition-colors tracking-wide">{label}</span>}
        {active && (
          <motion.div
            layoutId="sidebar-indicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary"
            style={{
              height: 20,
              boxShadow: '0 0 12px rgba(var(--primary-rgb), 0.8), 0 0 20px rgba(var(--primary-rgb), 0.4)',
            }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </button>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip title={label} placement="right" arrow>
          {buttonContent}
        </Tooltip>
      );
    }

    return buttonContent;
  };

  return (
    <aside
      className={`h-full flex flex-col justify-between py-5 text-white shrink-0 z-10 transition-all duration-300 ${sidebarCollapsed ? 'w-[72px] px-2.5' : 'w-[252px] px-3.5'}`}
      style={{
        background: 'linear-gradient(180deg, rgba(14, 16, 22, 0.95) 0%, rgba(10, 11, 15, 0.98) 100%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: 'inset -1px 0 0 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex flex-col gap-1 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        {/* ── Branding ── */}
        <div className={`flex items-center ${sidebarCollapsed ? 'flex-col justify-center gap-3' : 'justify-between'} mb-5`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'flex-col' : 'gap-3'}`}>
            <div
              className="relative p-2.5 rounded-2xl flex items-center justify-center bg-primary shrink-0"
              style={{
                boxShadow: '0 4px 20px rgba(var(--primary-rgb), 0.3), 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <Music className="w-5 h-5 text-white" />
              {/* Subtle reflection */}
              <div className="absolute inset-0 rounded-2xl" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)', pointerEvents: 'none' }} />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col">
                <span className="text-[13px] font-extrabold tracking-[0.08em] text-white leading-tight">SINGULARITY</span>
                <span className="text-[9px] font-medium tracking-[0.18em] leading-tight" style={{ color: 'rgba(148, 163, 184, 0.5)' }}>AUDIO PLATFORM</span>
              </div>
            )}
          </div>
          
          <IconButton
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            size="small"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{ 
              color: 'rgba(148,163,184,0.4)',
              width: 28, height: 28,
              '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' },
              mt: sidebarCollapsed ? 0 : 0,
            }}
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </IconButton>
        </div>

        {/* ── Upload & Import ── */}
        <div className={`flex flex-col ${sidebarCollapsed ? 'items-center' : ''} gap-1.5 mb-5`}>
          {sidebarCollapsed ? (
            <>
              <Tooltip title="Upload Music" placement="right" arrow>
                <button
                  onClick={onUploadClick}
                  aria-label="Upload music"
                  className="w-10 h-10 flex items-center justify-center rounded-xl active:scale-95 transition-all text-white"
                  style={{
                    background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.25) 0%, rgba(var(--primary-rgb), 0.1) 100%)',
                    border: '1px solid rgba(var(--primary-rgb), 0.2)',
                    boxShadow: '0 2px 8px rgba(var(--primary-rgb), 0.15)',
                  }}
                >
                  <Upload className="w-[17px] h-[17px]" />
                </button>
              </Tooltip>
              {onOpenSpotifyImport && (
                <Tooltip title="Import Spotify Playlist" placement="right" arrow>
                  <button
                    onClick={onOpenSpotifyImport}
                    aria-label="Import Spotify Playlist"
                    className="w-10 h-10 flex items-center justify-center rounded-xl active:scale-95 transition-all text-slate-400 hover:text-white"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <ListMusic className="w-[17px] h-[17px]" />
                  </button>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onUploadClick}
                aria-label="Upload music"
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl font-semibold text-[13px] active:scale-[0.97] transition-all text-white"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.2) 0%, rgba(var(--primary-rgb), 0.08) 100%)',
                  border: '1px solid rgba(var(--primary-rgb), 0.18)',
                  boxShadow: '0 2px 12px rgba(var(--primary-rgb), 0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <Upload className="w-4 h-4 opacity-90" />
                <span>Upload Music</span>
              </button>

              {onOpenSpotifyImport && (
                <button
                  onClick={onOpenSpotifyImport}
                  aria-label="Import Spotify Playlist"
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-xl font-medium text-[12px] active:scale-[0.97] transition-all text-slate-400 hover:text-slate-200"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Import Spotify Link</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Main Navigation ── */}
        <nav className="flex flex-col gap-0.5 mb-1">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-2 mb-2">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'rgba(148,163,184,0.35)' }}>Navigate</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
            </div>
          )}
          {mainNav.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
        </nav>

        {/* ── AI Studio Section ── */}
        <div className="my-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-2 mb-2">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'rgba(148,163,184,0.35)' }}>AI Studio</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.15) 0%, transparent 100%)' }} />
            </div>
          )}
          {onOpenAiPlaylistStudio && (
            sidebarCollapsed ? (
              <Tooltip title="AI Playlist Studio" placement="right" arrow>
                <button
                  onClick={onOpenAiPlaylistStudio}
                  aria-label="AI Playlist Studio"
                  className="w-full flex items-center justify-center py-2.5 px-0 rounded-xl transition-all text-slate-300 hover:text-white"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                    border: '1px solid rgba(168,85,247,0.12)',
                  }}
                >
                  <Sparkles className="w-[18px] h-[18px] shrink-0 text-purple-400" />
                </button>
              </Tooltip>
            ) : (
              <button
                onClick={onOpenAiPlaylistStudio}
                aria-label="AI Playlist Studio"
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all group hover:scale-[1.01]"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(139,92,246,0.03) 100%)',
                  border: '1px solid rgba(168,85,247,0.1)',
                  color: 'rgba(216,180,254,0.9)',
                  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-[17px] h-[17px] shrink-0 text-purple-400" />
                  <span>AI Playlist Studio</span>
                </div>
                <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(139,92,246,0.1) 100%)',
                    color: 'rgba(192,132,252,0.9)',
                    border: '1px solid rgba(168,85,247,0.15)',
                  }}
                >Studio</span>
              </button>
            )
          )}
        </div>

        {/* ── Tools ── */}
        <nav className="flex flex-col gap-0.5 mb-1">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-2 mb-2">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'rgba(148,163,184,0.35)' }}>Tools</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
            </div>
          )}
          {toolsNav.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
          {onOpenListenTogether && (
            sidebarCollapsed ? (
              <Tooltip title="Listen Together" placement="right" arrow>
                <button
                  onClick={onOpenListenTogether}
                  aria-label="Listen Together"
                  className="w-full flex items-center justify-center py-2.5 px-0 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
                >
                  <Radio className="w-[18px] h-[18px] shrink-0 text-primary opacity-80" />
                </button>
              </Tooltip>
            ) : (
              <button
                onClick={onOpenListenTogether}
                aria-label="Listen Together"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                <Radio className="w-[18px] h-[18px] shrink-0 text-primary opacity-80" />
                <span>Listen Together</span>
              </button>
            )
          )}
          {sidebarCollapsed ? (
            <Tooltip title="Equalizer" placement="right" arrow>
              <button
                onClick={() => setShowEqualizer(!showEqualizer)}
                aria-label="Toggle equalizer"
                className={`w-full flex items-center justify-center py-2.5 px-0 rounded-xl transition-all ${
                  showEqualizer ? 'text-primary' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={showEqualizer ? {
                  background: 'rgba(var(--primary-rgb), 0.08)',
                  boxShadow: '0 0 12px rgba(var(--primary-rgb), 0.08)',
                } : undefined}
              >
                <Sliders className="w-[18px] h-[18px] shrink-0" />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={() => setShowEqualizer(!showEqualizer)}
              aria-label="Toggle equalizer"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                showEqualizer ? 'text-primary' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
              style={showEqualizer ? {
                background: 'rgba(var(--primary-rgb), 0.08)',
                boxShadow: '0 0 12px rgba(var(--primary-rgb), 0.08)',
              } : undefined}
            >
              <Sliders className="w-[18px] h-[18px] shrink-0" />
              <span>Equalizer</span>
            </button>
          )}
        </nav>

        {!sidebarCollapsed && (
          <>
            {/* ── Playlists ── */}
            <div className="flex flex-col gap-0.5 mt-1">
              <div className="flex justify-between items-center px-2 mb-1.5">
                <button
                  onClick={() => setPlaylistsExpanded(!playlistsExpanded)}
                  className="flex items-center gap-1.5 transition-colors group"
                  aria-label={playlistsExpanded ? 'Collapse playlists' : 'Expand playlists'}
                >
                  {playlistsExpanded
                    ? <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
                    : <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  }
                  <span className="text-[10px] font-semibold tracking-[0.14em] uppercase group-hover:text-slate-300 transition-colors" style={{ color: 'rgba(148,163,184,0.35)' }}>
                    Playlists ({playlists.length})
                  </span>
                </button>
                <div className="flex items-center gap-1.5">
                  {onOpenAiPlaylistStudio && (
                    <Tooltip title="AI Generate" arrow>
                      <button
                        onClick={onOpenAiPlaylistStudio}
                        aria-label="Open AI Playlist Studio"
                        className="flex items-center gap-1 px-1.5 py-1 rounded-md transition-all hover:scale-105"
                        style={{
                          background: 'rgba(168,85,247,0.08)',
                          border: '1px solid rgba(168,85,247,0.1)',
                          color: 'rgba(192,132,252,0.7)',
                          fontSize: '9px',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip title="Create manual playlist" arrow>
                    <IconButton
                      size="small"
                      onClick={() => setShowPlaylistInput(!showPlaylistInput)}
                      aria-label="Create playlist"
                      sx={{ p: 0.4, color: 'rgba(148,163,184,0.35)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' } }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>

              <AnimatePresence>
                {showPlaylistInput && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleCreatePlaylist}
                    className="px-1 mb-2 overflow-hidden"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="Playlist name..."
                      className="w-full px-3 py-2 rounded-lg text-xs text-white placeholder-neutral-600 focus:outline-none transition-all"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 0 0 0 rgba(var(--primary-rgb), 0)',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(var(--primary-rgb), 0.3)';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--primary-rgb), 0.08)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.boxShadow = '0 0 0 0 rgba(var(--primary-rgb), 0)';
                      }}
                    />
                  </motion.form>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {playlistsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-col gap-0.5 max-h-48 overflow-y-auto"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {playlists.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] italic" style={{ color: 'rgba(148,163,184,0.3)' }}>
                        No playlists yet
                      </p>
                    ) : (
                      playlists.map(pl => (
                        <button
                          key={pl.id}
                          onClick={() => {
                            setSelectedPlaylistId(pl.id);
                          }}
                          className="w-full group flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/[0.04]"
                          style={{
                            backgroundColor: selectedPlaylistId === pl.id
                              ? 'rgba(var(--primary-rgb), 0.07)'
                              : 'transparent',
                            color: selectedPlaylistId === pl.id
                              ? '#ffffff'
                              : 'rgba(148,163,184,0.7)',
                          }}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <AbstractPlaylistCover name={pl.name} id={pl.id} size="small" />
                            <span className="truncate">{pl.name}</span>
                          </div>
                          <Trash2
                            onClick={(e: any) => handleDeletePlaylist(pl.id, e)}
                            className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0 ml-1 cursor-pointer"
                            style={{ color: tokens.colors.error }}
                          />
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* ── Footer: Backup/Restore ── */}
      {sidebarCollapsed ? (
        <div className="flex flex-col gap-2 items-center pt-3 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <Tooltip title="Backup" placement="right" arrow>
            <button
              onClick={handleBackup}
              aria-label="Export library backup"
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-white/[0.04]"
              style={{
                color: 'rgba(148,163,184,0.4)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          
          <Tooltip title="Restore" placement="right" arrow>
            <label
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer hover:bg-white/[0.04]"
              style={{
                color: 'rgba(148,163,184,0.4)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
              aria-label="Import library backup"
            >
              <Upload className="w-3.5 h-3.5" />
              <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
            </label>
          </Tooltip>
        </div>
      ) : (
        <div className="pt-3 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleBackup}
              aria-label="Export library backup"
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[10px] font-medium transition-all hover:bg-white/[0.04]"
              style={{
                color: 'rgba(148,163,184,0.4)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <Download className="w-3 h-3" />
              Backup
            </button>
            <label
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[10px] font-medium transition-all cursor-pointer hover:bg-white/[0.04]"
              style={{
                color: 'rgba(148,163,184,0.4)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
              aria-label="Import library backup"
            >
              <Upload className="w-3 h-3" />
              Restore
              <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
            </label>
          </div>
        </div>
      )}
    </aside>
  );
};
export default Sidebar;
