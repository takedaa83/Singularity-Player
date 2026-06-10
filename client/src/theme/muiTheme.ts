import { createTheme } from '@mui/material/styles';

export function alpha(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

// ─── Design Tokens ────────────────────────────────────────────────────
// Single source of truth for the entire design system.

export const tokens = {
  colors: {
    // Surfaces
    background: 'var(--bg-primary)',
    surface: 'var(--bg-secondary)',
    surfaceVariant: 'var(--bg-tertiary)',
    surfaceElevated: 'var(--bg-surface)',
    surfaceBorder: 'var(--border-primary)',
    // Text
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textTertiary: 'var(--text-tertiary)',
    textDisabled: 'var(--text-disabled)',
    // Brand / Accent
    primary: 'var(--primary)',
    primaryLight: 'var(--primary-light)',
    primaryDark: 'var(--primary-dark)',
    // Semantic accents
    accent: {
      violet: 'var(--primary)', // Allow accent violet to match the user's primary selection
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

// Helper to adjust hex colors for light/dark shades
const adjustHexColor = (hex: string, percent: number) => {
  try {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0x00ff) + Math.round(2.55 * percent);
    let b = (num & 0x0000ff) + Math.round(2.55 * percent);

    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
};

export const getMuiTheme = (themeMode: 'light' | 'dark', accentColor: string) => {
  const primaryMain = accentColor;
  const primaryLight = adjustHexColor(accentColor, 15);
  const primaryDark = adjustHexColor(accentColor, -15);

  return createTheme({
    palette: {
      mode: themeMode,
      primary: {
        main: primaryMain,
        light: primaryLight,
        dark: primaryDark,
        contrastText: '#ffffff',
      },
      secondary: {
        main: tokens.colors.accent.pink,
      },
      background: {
        default: themeMode === 'dark' ? '#000000' : '#ffffff',
        paper: themeMode === 'dark' ? '#0a0a0a' : '#fafafa',
      },
      text: {
        primary: themeMode === 'dark' ? '#ffffff' : '#0a0a0a',
        secondary: themeMode === 'dark' ? '#a3a3a3' : '#525252',
        disabled: themeMode === 'dark' ? '#525252' : '#a3a3a3',
      },
      error: { main: tokens.colors.error },
      warning: { main: tokens.colors.warning },
      success: { main: tokens.colors.success },
      info: { main: tokens.colors.info },
      divider: themeMode === 'dark' ? '#262626' : '#e5e5e5',
    },
    shape: {
      borderRadius: tokens.radius.md,
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
            color: primaryMain,
          },
          thumb: {
            width: 14,
            height: 14,
            '&:hover': {
              boxShadow: `0 0 0 6px color-mix(in srgb, ${primaryMain} 16%, transparent)`,
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
            backgroundColor: `color-mix(in srgb, ${primaryMain} 15%, transparent)`,
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
};
