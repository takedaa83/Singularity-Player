import { createTheme, alpha } from '@mui/material/styles';

// ─── Design Tokens ────────────────────────────────────────────────────
// Single source of truth for the entire design system.

export const tokens = {
  colors: {
    // Surfaces
    background: '#0a0a0a',
    surface: '#141414',
    surfaceVariant: '#1c1c1c',
    surfaceElevated: '#242424',
    surfaceBorder: '#2a2a2a',
    // Text
    textPrimary: '#ffffff',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
    textDisabled: '#525252',
    // Brand / Accent
    primary: '#a855f7',
    primaryLight: '#c084fc',
    primaryDark: '#7c3aed',
    // Semantic accents
    accent: {
      violet: '#a855f7',
      pink: '#ec4899',
      cyan: '#22d3ee',
      amber: '#f59e0b',
      emerald: '#10b981',
      red: '#ef4444',
      blue: '#3b82f6',
    },
    // Source badges
    source: {
      youtube: '#ff4444',
      deezer: '#a855f7',
      itunes: '#f472b6',
      local: '#22d3ee',
      demo: '#facc15',
    },
    // Status
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },
  // Consistent border radius scale
  radius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 24,
    full: 9999,
  },
  // Consistent spacing scale (in px, maps to 4px grid)
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
  },
  // Typography scale (replacing ad-hoc text-[9px]..text-[15px])
  typography: {
    caption: { size: 11, lineHeight: 1.4, weight: 400 },
    body2: { size: 13, lineHeight: 1.5, weight: 400 },
    body1: { size: 14, lineHeight: 1.5, weight: 400 },
    subtitle2: { size: 14, lineHeight: 1.4, weight: 500 },
    subtitle1: { size: 16, lineHeight: 1.4, weight: 500 },
    h6: { size: 18, lineHeight: 1.3, weight: 600 },
    h5: { size: 20, lineHeight: 1.3, weight: 600 },
    h4: { size: 24, lineHeight: 1.2, weight: 700 },
    h3: { size: 30, lineHeight: 1.2, weight: 700 },
    h2: { size: 36, lineHeight: 1.1, weight: 700 },
    h1: { size: 48, lineHeight: 1.1, weight: 800 },
  },
  // Z-index scale
  zIndex: {
    sidebar: 100,
    playerBar: 200,
    panel: 300,
    modal: 400,
    toast: 500,
    tooltip: 600,
  },
  // Transitions
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
    spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ─── MUI Theme ────────────────────────────────────────────────────────

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: tokens.colors.primary,
      light: tokens.colors.primaryLight,
      dark: tokens.colors.primaryDark,
    },
    secondary: {
      main: tokens.colors.accent.pink,
    },
    background: {
      default: tokens.colors.background,
      paper: tokens.colors.surface,
    },
    text: {
      primary: tokens.colors.textPrimary,
      secondary: tokens.colors.textSecondary,
      disabled: tokens.colors.textDisabled,
    },
    error: { main: tokens.colors.error },
    warning: { main: tokens.colors.warning },
    success: { main: tokens.colors.success },
    info: { main: tokens.colors.info },
    divider: tokens.colors.surfaceBorder,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    caption: {
      fontSize: tokens.typography.caption.size,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    body2: {
      fontSize: tokens.typography.body2.size,
      lineHeight: tokens.typography.body2.lineHeight,
    },
    body1: {
      fontSize: tokens.typography.body1.size,
      lineHeight: tokens.typography.body1.lineHeight,
    },
    subtitle2: {
      fontSize: tokens.typography.subtitle2.size,
      fontWeight: tokens.typography.subtitle2.weight,
    },
    subtitle1: {
      fontSize: tokens.typography.subtitle1.size,
      fontWeight: tokens.typography.subtitle1.weight,
    },
    h6: {
      fontSize: tokens.typography.h6.size,
      fontWeight: tokens.typography.h6.weight,
    },
    h5: {
      fontSize: tokens.typography.h5.size,
      fontWeight: tokens.typography.h5.weight,
    },
    h4: {
      fontSize: tokens.typography.h4.size,
      fontWeight: tokens.typography.h4.weight,
    },
    h3: {
      fontSize: tokens.typography.h3.size,
      fontWeight: tokens.typography.h3.weight,
    },
    h2: {
      fontSize: tokens.typography.h2.size,
      fontWeight: tokens.typography.h2.weight,
    },
    h1: {
      fontSize: tokens.typography.h1.size,
      fontWeight: tokens.typography.h1.weight,
    },
  },
  shape: {
    borderRadius: tokens.radius.md,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          scrollbarColor: `${tokens.colors.surfaceElevated} transparent`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: tokens.radius.lg,
          fontWeight: 500,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.lg,
          transition: tokens.transitions.fast,
          '&:hover': {
            backgroundColor: alpha(tokens.colors.textPrimary, 0.08),
          },
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
        enterDelay: 400,
      },
      styleOverrides: {
        tooltip: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.surfaceBorder}`,
          fontSize: tokens.typography.caption.size,
          borderRadius: tokens.radius.sm,
        },
        arrow: {
          color: tokens.colors.surfaceElevated,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.colors.surface,
          borderRadius: tokens.radius.xl,
          border: `1px solid ${tokens.colors.surfaceBorder}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.colors.surface,
          borderRight: `1px solid ${tokens.colors.surfaceBorder}`,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.surfaceBorder}`,
          borderRadius: tokens.radius.lg,
          backgroundImage: 'none',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          margin: '2px 4px',
          fontSize: tokens.typography.body2.size,
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: tokens.colors.primary,
        },
        thumb: {
          width: 14,
          height: 14,
          '&:hover': {
            boxShadow: `0 0 0 6px ${alpha(tokens.colors.primary, 0.16)}`,
          },
        },
        track: {
          height: 4,
          borderRadius: 2,
        },
        rail: {
          height: 4,
          borderRadius: 2,
          opacity: 0.3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: tokens.typography.body2.size,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          fontWeight: 500,
          fontSize: tokens.typography.caption.size,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.colors.surfaceVariant,
          borderRadius: tokens.radius.xl,
          border: `1px solid ${tokens.colors.surfaceBorder}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.full,
          height: 4,
          backgroundColor: alpha(tokens.colors.primary, 0.15),
        },
        bar: {
          borderRadius: tokens.radius.full,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(tokens.colors.textPrimary, 0.06),
        },
      },
    },
  },
});

export const lightTheme = createTheme({
  ...darkTheme,
  palette: {
    mode: 'light',
    primary: {
      main: tokens.colors.primaryDark,
      light: tokens.colors.primary,
      dark: '#6d28d9',
    },
    secondary: {
      main: tokens.colors.accent.pink,
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    text: {
      primary: '#0a0a0a',
      secondary: '#525252',
      disabled: '#a3a3a3',
    },
    divider: '#e5e5e5',
  },
});
