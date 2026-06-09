import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music, Heart, FolderHeart, ListMusic, Plus, Download, Upload, Trash2,
  Sliders, Search, Home, Clock, Settings, ChevronDown, ChevronRight, Package
} from 'lucide-react';
import { Box, Typography, IconButton, Tooltip, Divider } from '@mui/material';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Playlist } from '../../types';
import { tokens } from '../../theme/muiTheme';

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
  onUploadClick
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const { getAllPlaylists, savePlaylist, deletePlaylist, getAllTracks, saveTrack, getAllFavorites, toggleFavorite } = useLibraryDB();
  const [showPlaylistInput, setShowPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

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
    if (id === 'favorites') return activeView.includes('favorites');
    if (id === 'history') return activeView.includes('history');
    if (id === 'downloads') return activeView.includes('downloads');
    if (id === 'settings') return activeView.includes('settings');
    if (id === 'batch-download') return activeView.includes('batch-download');
    return activeView === id;
  };

  const mainNav = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'library', icon: FolderHeart, label: 'Library' },
    { id: 'favorites', icon: Heart, label: 'Favorites', color: tokens.colors.accent.pink },
    { id: 'history', icon: Clock, label: 'History' },
  ];

  const toolsNav = [
    { id: 'downloads', icon: Download, label: 'Downloads', color: tokens.colors.accent.cyan },
    { id: 'batch-download', icon: Package, label: 'Batch Packager', color: tokens.colors.primary },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const NavButton: React.FC<{ id: string; icon: any; label: string; color?: string }> = ({ id, icon: Icon, label, color }) => {
    const active = isViewActive(id) && !selectedPlaylistId;
    return (
      <button
        onClick={() => { setActiveView(id); setSelectedPlaylistId(null); }}
        aria-label={`Navigate to ${label}`}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all relative group"
        style={{
          backgroundColor: active ? `${tokens.colors.primary}18` : 'transparent',
          color: active ? tokens.colors.primary : tokens.colors.textSecondary,
        }}
      >
        <Icon
          className="w-[18px] h-[18px] shrink-0 transition-colors"
          style={{ color: active ? (color || tokens.colors.primary) : undefined }}
        />
        <span className="group-hover:text-white transition-colors">{label}</span>
        {active && (
          <motion.div
            layoutId="sidebar-indicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
            style={{ height: 20, backgroundColor: color || tokens.colors.primary }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
      </button>
    );
  };

  return (
    <aside
      className="w-60 h-full flex flex-col justify-between py-4 px-3 text-white shrink-0 z-10"
      style={{
        backgroundColor: tokens.colors.surface,
        borderRight: `1px solid ${tokens.colors.surfaceBorder}`,
      }}
    >
      <div className="flex flex-col gap-6 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {/* Branding */}
        <div className="flex items-center gap-3 px-2 pt-1">
          <div
            className="p-2 rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
            }}
          >
            <Music className="w-5 h-5 text-white" />
          </div>
          <div>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: 13, color: tokens.colors.textPrimary }}>
              SINGULARITY
            </Typography>
            <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.15em' }}>
              MUSIC PLATFORM
            </Typography>
          </div>
        </div>

        {/* Upload Music Button */}
        <Box sx={{ px: 1, mt: 1, mb: 0.5 }}>
          <button
            onClick={onUploadClick}
            aria-label="Upload music"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-all shadow-md hover:shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
              color: '#fff',
              boxShadow: `0 4px 14px ${tokens.colors.primary}30`,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Music</span>
          </button>
        </Box>

        {/* Main Navigation */}
        <nav className="flex flex-col gap-0.5">
          <Typography
            variant="caption"
            sx={{ px: 1, mb: 1, color: tokens.colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, fontWeight: 600 }}
          >
            Menu
          </Typography>
          {mainNav.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
        </nav>

        <Divider sx={{ borderColor: tokens.colors.surfaceBorder, mx: 1 }} />

        {/* Tools */}
        <nav className="flex flex-col gap-0.5">
          <Typography
            variant="caption"
            sx={{ px: 1, mb: 1, color: tokens.colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, fontWeight: 600 }}
          >
            Tools
          </Typography>
          {toolsNav.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
          <button
            onClick={() => setShowEqualizer(!showEqualizer)}
            aria-label="Toggle equalizer"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: showEqualizer ? `${tokens.colors.accent.amber}18` : 'transparent',
              color: showEqualizer ? tokens.colors.accent.amber : tokens.colors.textSecondary,
            }}
          >
            <Sliders className="w-[18px] h-[18px] shrink-0" />
            <span className="hover:text-white transition-colors">Equalizer</span>
          </button>
        </nav>

        <Divider sx={{ borderColor: tokens.colors.surfaceBorder, mx: 1 }} />

        {/* Playlists */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between items-center px-1 mb-1">
            <button
              onClick={() => setPlaylistsExpanded(!playlistsExpanded)}
              className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors"
              aria-label={playlistsExpanded ? 'Collapse playlists' : 'Expand playlists'}
            >
              {playlistsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Typography
                variant="caption"
                sx={{ color: tokens.colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, fontWeight: 600 }}
              >
                Playlists ({playlists.length})
              </Typography>
            </button>
            <Tooltip title="Create playlist" arrow>
              <IconButton
                size="small"
                onClick={() => setShowPlaylistInput(!showPlaylistInput)}
                aria-label="Create playlist"
                sx={{ p: 0.5, color: tokens.colors.textTertiary, '&:hover': { color: tokens.colors.textPrimary } }}
              >
                <Plus className="w-3.5 h-3.5" />
              </IconButton>
            </Tooltip>
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
                  className="w-full px-3 py-1.5 rounded-lg text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: tokens.colors.background,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
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
                  <Typography variant="caption" sx={{ px: 2, py: 1, color: tokens.colors.textTertiary, fontStyle: 'italic', fontSize: 11 }}>
                    No playlists yet
                  </Typography>
                ) : (
                  playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        setSelectedPlaylistId(pl.id);
                      }}
                      className="w-full group flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: selectedPlaylistId === pl.id
                          ? `${tokens.colors.primary}12`
                          : 'transparent',
                        color: selectedPlaylistId === pl.id
                          ? tokens.colors.textPrimary
                          : tokens.colors.textSecondary,
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <ListMusic className="w-3.5 h-3.5 shrink-0" style={{ color: tokens.colors.textTertiary }} />
                        <span className="truncate">{pl.name}</span>
                      </div>
                      <Trash2
                        onClick={(e: any) => handleDeletePlaylist(pl.id, e)}
                        className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1 cursor-pointer"
                        style={{ color: tokens.colors.error }}
                      />
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer: Backup/Restore */}
      <div className="pt-3 mt-2" style={{ borderTop: `1px solid ${tokens.colors.surfaceBorder}` }}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleBackup}
            aria-label="Export library backup"
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: tokens.colors.surfaceVariant,
              color: tokens.colors.textSecondary,
              border: `1px solid ${tokens.colors.surfaceBorder}`,
            }}
          >
            <Download className="w-3 h-3" />
            Backup
          </button>
          <label
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: tokens.colors.surfaceVariant,
              color: tokens.colors.textSecondary,
              border: `1px solid ${tokens.colors.surfaceBorder}`,
            }}
            aria-label="Import library backup"
          >
            <Upload className="w-3 h-3" />
            Restore
            <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
          </label>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
