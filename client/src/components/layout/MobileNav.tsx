import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Box } from '@mui/material';
import {
  Home as HomeIcon,
  Search as SearchIcon,
  LibraryMusic as LibraryIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { tokens } from '../../theme/muiTheme';

export const MobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [value, setValue] = useState('/');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    setValue(location.pathname);
  }, [location.pathname]);

  // Hide mobile nav when keyboard is active (useful on search page input focus)
  useEffect(() => {
    const handleResize = () => {
      const isKeyboard = window.innerHeight < 500;
      setIsKeyboardOpen(isKeyboard);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isKeyboardOpen) return null;

  return (
    <Box
      sx={{
        display: { xs: 'block', md: 'none' },
        position: 'fixed',
        bottom: 0, // Sit flush at the bottom of the screen
        left: 0,
        right: 0,
        zIndex: 40,
      }}
    >
      <Paper
        elevation={4}
        sx={{
          borderRadius: 0,
          borderTop: `1px solid ${tokens.colors.surfaceBorder}`,
          bgcolor: tokens.colors.background,
        }}
      >
        <BottomNavigation
          showLabels
          value={value}
          onChange={(_, newValue) => {
            setValue(newValue);
            navigate(newValue);
          }}
          sx={{
            height: 64,
            bgcolor: tokens.colors.background,
            '& .MuiBottomNavigationAction-root': {
              color: tokens.colors.textTertiary,
              minWidth: 'auto',
              padding: '6px 0',
              '&.Mui-selected': {
                color: tokens.colors.primary,
                '& .MuiSvgIcon-root': {
                  color: tokens.colors.primary,
                },
              },
            },
          }}
        >
          <BottomNavigationAction
            label="Home"
            value="/"
            icon={<HomeIcon />}
            aria-label="Navigate to Home"
          />
          <BottomNavigationAction
            label="Search"
            value="/search"
            icon={<SearchIcon />}
            aria-label="Navigate to Search"
          />
          <BottomNavigationAction
            label="Library"
            value="/library"
            icon={<LibraryIcon />}
            aria-label="Navigate to Library"
          />
          <BottomNavigationAction
            label="Downloads"
            value="/downloads"
            icon={<DownloadIcon />}
            aria-label="Navigate to Downloads"
          />
          <BottomNavigationAction
            label="Settings"
            value="/settings"
            icon={<SettingsIcon />}
            aria-label="Navigate to Settings"
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
};

export default MobileNav;
