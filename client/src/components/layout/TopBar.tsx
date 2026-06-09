import React from 'react';
import { IconButton, Tooltip, Badge, Box } from '@mui/material';
import { Sun, Moon, UploadCloud, Menu, Download } from 'lucide-react';
import { SearchInput } from '../search/SearchInput';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { tokens } from '../../theme/muiTheme';

interface TopBarProps {
  onSearch: (query: string) => void;
  searchQuery: string;
  onUploadClick: () => void;
  onMenuClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSearch,
  searchQuery,
  onUploadClick,
  onMenuClick
}) => {
  const theme = useSettingsStore((s) => s.settings.theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const activeDownloadCount = useDownloadStore((s) => s.queue.filter(d => d.status === 'active').length);

  const handleThemeToggle = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    updateSetting('theme', nextTheme);
  };

  return (
    <header
      className="h-14 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sm:gap-6 shrink-0 z-20"
      style={{
        backgroundColor: tokens.colors.surface,
        borderBottom: `1px solid ${tokens.colors.surfaceBorder}`,
      }}
    >
      {/* Left balancing box (Menu button on mobile, empty on desktop) */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
        {onMenuClick && (
          <IconButton
            onClick={onMenuClick}
            aria-label="Open menu"
            sx={{ display: { lg: 'none' }, color: tokens.colors.textSecondary, p: 0.5 }}
          >
            <Menu className="w-5 h-5" />
          </IconButton>
        )}
      </Box>

      {/* Centered Search Field */}
      <Box sx={{ flex: '0 1 auto', width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'center' }}>
        <SearchInput onSearch={onSearch} initialValue={searchQuery} />
      </Box>

      {/* Right Action Buttons */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: { xs: 1, sm: 1.5 } }}>
        {/* Download indicator */}
        {activeDownloadCount > 0 && (
          <Tooltip title={`${activeDownloadCount} download${activeDownloadCount > 1 ? 's' : ''} active`}>
            <IconButton
              aria-label="Active downloads"
              sx={{
                color: tokens.colors.accent.cyan,
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

        {/* Theme Toggle */}
        <Tooltip title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          <IconButton
            onClick={handleThemeToggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{
              p: 1,
              borderRadius: `${tokens.radius.lg}px`,
              backgroundColor: tokens.colors.surfaceVariant,
              border: `1px solid ${tokens.colors.surfaceBorder}`,
              color: tokens.colors.textSecondary,
              transition: tokens.transitions.fast,
              '&:hover': {
                borderColor: tokens.colors.textTertiary,
                color: tokens.colors.textPrimary,
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
      </Box>
    </header>
  );
};
export default TopBar;
