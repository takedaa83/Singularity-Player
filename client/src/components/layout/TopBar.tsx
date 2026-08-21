import React, { useEffect, useState } from 'react';
import { IconButton, Tooltip, Badge, Box } from '@mui/material';
import { Sun, Moon, UploadCloud, Menu, Download, Sparkles, Minus, Square, Copy, X, PictureInPicture2, ArrowUpCircle } from 'lucide-react';
import { SearchInput } from '../search/SearchInput';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { updaterService, UpdateStatus } from '../../services/updaterService';
import { tokens } from '../../theme/muiTheme';

interface TopBarProps {
  onSearch: (query: string) => void;
  searchQuery: string;
  onUploadClick: () => void;
  onMenuClick?: () => void;
  onOpenSpotifyImport?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSearch,
  searchQuery,
  onUploadClick,
  onMenuClick,
  onOpenSpotifyImport
}) => {
  const theme = useSettingsStore((s) => s.settings.theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const activeDownloadCount = useDownloadStore((s) => s.queue.filter(d => d.status === 'active').length);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    // Check for updates in background on launch
    updaterService.checkForUpdates(false);
    const unsub = updaterService.subscribe(setUpdateStatus);
    return unsub;
  }, []);

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      const unsubscribe = window.electronAPI.onMaximizeChange((max) => {
        setIsMaximized(max);
      });
      return unsubscribe;
    }
  }, [isElectron]);

  const handleThemeToggle = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    updateSetting('theme', nextTheme);
  };

  return (
    <header
      style={isElectron ? ({ WebkitAppRegion: 'drag' } as any) : undefined}
      className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sm:gap-6 shrink-0 z-20 backdrop-blur-2xl bg-black/40 border-b border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.25)] select-none"
    >
      {/* Left balancing box (Menu button on mobile, Brand on desktop) */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 1.5 }} style={{ WebkitAppRegion: 'no-drag' } as any}>
        {onMenuClick && (
          <IconButton
            onClick={onMenuClick}
            aria-label="Open menu"
            sx={{ display: { lg: 'none' }, color: 'var(--text-secondary)', p: 0.5 }}
          >
            <Menu className="w-5 h-5" />
          </IconButton>
        )}
        {isElectron && (
          <div className="hidden lg:flex items-center gap-2 select-none pointer-events-none opacity-90">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-[#fa2d55] to-[#ec4899] flex items-center justify-center shadow-[0_0_10px_rgba(250,45,85,0.4)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            <span className="text-[11.5px] font-extrabold tracking-tight text-white/90">SINGULARITY</span>
          </div>
        )}
      </Box>

      {/* Centered Search Field with Cmd+K Badge */}
      <Box 
        sx={{ flex: '0 1 auto', width: '100%', maxWidth: 520, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <SearchInput onSearch={onSearch} initialValue={searchQuery} />
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-slate-400 shrink-0">
          ⌘K
        </span>
      </Box>

      {/* Right Action Buttons */}
      <Box 
        sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: { xs: 1, sm: 1.5 } }}
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* Desktop Mini-Player Trigger */}
        {isElectron && (
          <Tooltip title="Floating Mini-Player (Ctrl+Shift+M)">
            <IconButton
              onClick={() => window.electronAPI?.toggleMiniPlayer()}
              aria-label="Toggle Mini-Player"
              sx={{
                p: 1,
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                },
              }}
            >
              <PictureInPicture2 className="w-4 h-4" />
            </IconButton>
          </Tooltip>
        )}

        {/* Download indicator */}
        {activeDownloadCount > 0 && (
          <Tooltip title={`${activeDownloadCount} download${activeDownloadCount > 1 ? 's' : ''} active`}>
            <IconButton
              aria-label="Active downloads"
              sx={{
                color: 'var(--primary)',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            >
              <Badge badgeContent={activeDownloadCount} color="primary" max={9}>
                <Download className="w-4 h-4" />
              </Badge>
            </IconButton>
          </Tooltip>
        )}

        {/* Update Available Indicator */}
        {updateStatus?.updateAvailable && (
          <Tooltip title={`Update Available (${updateStatus.latestVersion || updateStatus.latestCommit}) - Click to view in Settings`}>
            <button
              onClick={() => {
                window.location.hash = '#settings';
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#fa2d55]/20 to-[#8b5cf6]/20 text-[#ff8099] hover:text-white border border-[#fa2d55]/40 transition-all active:scale-95 shadow-[0_0_12px_rgba(250,45,85,0.25)] animate-pulse"
            >
              <ArrowUpCircle className="w-3.5 h-3.5 text-[#fa2d55]" />
              <span className="hidden sm:inline">Update</span>
            </button>
          </Tooltip>
        )}

        {/* Spotify Import Link Button */}
        {onOpenSpotifyImport && (
          <Tooltip title="Import Spotify Playlist">
            <button
              onClick={onOpenSpotifyImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all active:scale-95 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Spotify Import</span>
            </button>
          </Tooltip>
        )}

        {/* Theme Toggle */}
        <Tooltip title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          <IconButton
            onClick={handleThemeToggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{
              p: 1,
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
              },
            }}
          >
            <div
              className="transition-transform duration-300"
              style={{ transform: theme === 'light' ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </div>
          </IconButton>
        </Tooltip>

        {/* Native Electron Window Controls (Minimize / Maximize / Close) */}
        {isElectron && (
          <div className="flex items-center gap-1 ml-2 pl-3 border-l border-white/10">
            <button
              onClick={() => window.electronAPI?.minimize()}
              title="Minimize"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.electronAPI?.maximize()}
              title={isMaximized ? 'Restore' : 'Maximize'}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={() => window.electronAPI?.close()}
              title="Close to Tray"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/80 hover:text-white text-slate-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Box>
    </header>
  );
};
export default TopBar;

