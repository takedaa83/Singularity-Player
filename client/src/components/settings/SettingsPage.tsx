import React, { useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  Slider,
  Select,
  MenuItem,
  Button,
  Divider,
  FormControl,
  SelectChangeEvent,
} from '@mui/material';
import {
  Settings,
  Palette,
  PlayCircle,
  Headphones,
  Download,
  HardDrive,
  Info,
  Trash2,
  Database,
  Upload,
  FolderDown,
  RotateCcw,
} from 'lucide-react';
import { tokens } from '../../theme/muiTheme';
import { EQ_PRESETS, UserSettings } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { ViewHeader } from '../ui/ViewHeader';

// ─── Accent Color Palette ────────────────────────────────────────────

const ACCENT_COLORS = [
  { name: 'Purple', color: '#a855f7' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Cyan', color: '#22d3ee' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Blue', color: '#3b82f6' },
];

// ─── Settings Section Wrapper ────────────────────────────────────────

interface SettingSectionProps {
  icon: React.ElementType;
  title: string;
  iconColor: string;
  children: React.ReactNode;
}

const SettingSection: React.FC<SettingSectionProps> = ({
  icon: Icon,
  title,
  iconColor,
  children,
}) => (
  <Card
    sx={{
      mb: 2,
      backgroundColor: tokens.colors.surfaceVariant,
      border: `1px solid ${tokens.colors.surfaceBorder}`,
      borderRadius: `${tokens.radius.xl}px`,
      backgroundImage: 'none',
    }}
  >
    <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: `${tokens.radius.md}px`,
            background: `linear-gradient(135deg, ${iconColor}30, ${iconColor}10)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} color={iconColor} />
        </Box>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, color: tokens.colors.textPrimary }}
        >
          {title}
        </Typography>
      </Box>
      {children}
    </CardContent>
  </Card>
);

// ─── Individual Setting Row ──────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  noDivider?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  noDivider,
}) => (
  <>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1.5,
        gap: 3,
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography
          variant="body1"
          sx={{ color: tokens.colors.textPrimary, fontWeight: 500 }}
        >
          {label}
        </Typography>
        {description && (
          <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Box>
    {!noDivider && <Divider sx={{ borderColor: tokens.colors.surfaceBorder }} />}
  </>
);

// ─── Settings Page ───────────────────────────────────────────────────

export const SettingsPage: React.FC = () => {
  const { settings, updateSetting } = useSettingsStore();

  const handleThemeChange = useCallback(
    (theme: UserSettings['theme']) => updateSetting('theme', theme),
    [updateSetting]
  );

  const handleEqChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const preset = EQ_PRESETS.find((p) => p.name === event.target.value);
      if (preset) {
        updateSetting('eqPreset', preset.name);
        updateSetting('eqBands', preset.bands);
      }
    },
    [updateSetting]
  );

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <ViewHeader
        icon={Settings}
        title="Settings"
        subtitle="Customize your experience"
        iconColor={tokens.colors.accent.violet}
      />

      {/* ── Appearance ──────────────────────────────────────────── */}
      <SettingSection
        icon={Palette}
        title="Appearance"
        iconColor={tokens.colors.accent.pink}
      >
        <SettingRow label="Theme" description="Choose your preferred visual theme">
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {(['dark', 'light'] as const).map((theme) => (
              <Button
                key={theme}
                size="small"
                variant={settings.theme === theme ? 'contained' : 'outlined'}
                onClick={() => handleThemeChange(theme)}
                sx={{
                  textTransform: 'capitalize',
                  minWidth: 72,
                  borderRadius: `${tokens.radius.md}px`,
                  borderColor: tokens.colors.surfaceBorder,
                  ...(settings.theme !== theme && {
                    color: tokens.colors.textSecondary,
                  }),
                }}
              >
                {theme}
              </Button>
            ))}
          </Box>
        </SettingRow>

        <SettingRow label="Accent Color" description="Primary color used across the app">
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {ACCENT_COLORS.map(({ name, color }) => (
              <Box
                key={name}
                role="button"
                tabIndex={0}
                aria-label={`Set accent color to ${name}`}
                onClick={() => updateSetting('accentColor', color)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    updateSetting('accentColor', color);
                  }
                }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: color,
                  cursor: 'pointer',
                  transition: tokens.transitions.fast,
                  border:
                    settings.accentColor === color
                      ? `3px solid ${tokens.colors.textPrimary}`
                      : '3px solid transparent',
                  outline:
                    settings.accentColor === color
                      ? `2px solid ${color}`
                      : '2px solid transparent',
                  '&:hover': {
                    transform: 'scale(1.15)',
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${color}`,
                    outlineOffset: 2,
                  },
                }}
              />
            ))}
          </Box>
        </SettingRow>

        <SettingRow label="Compact Mode" description="Reduce spacing for denser layout" noDivider>
          <Switch
            checked={settings.compactMode}
            onChange={(_, checked) => updateSetting('compactMode', checked)}
            slotProps={{ input: { 'aria-label': 'Toggle compact mode' } }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Playback ────────────────────────────────────────────── */}
      <SettingSection
        icon={PlayCircle}
        title="Playback"
        iconColor={tokens.colors.accent.cyan}
      >
        <SettingRow
          label="Crossfade Duration"
          description={`${settings.crossfadeDuration}s transition between tracks`}
        >
          <Slider
            value={settings.crossfadeDuration}
            min={0}
            max={10}
            step={1}
            onChange={(_, val) => updateSetting('crossfadeDuration', val as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}s`}
            sx={{ width: 160 }}
            aria-label="Crossfade duration"
          />
        </SettingRow>

        <SettingRow
          label="Playback Speed"
          description={`${settings.playbackSpeed.toFixed(1)}x speed`}
        >
          <Slider
            value={settings.playbackSpeed}
            min={0.5}
            max={2}
            step={0.1}
            onChange={(_, val) => updateSetting('playbackSpeed', val as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}x`}
            sx={{ width: 160 }}
            aria-label="Playback speed"
          />
        </SettingRow>

        <SettingRow label="Auto-play Next" description="Automatically play the next track" noDivider>
          <Switch
            checked={settings.autoPlayNext}
            onChange={(_, checked) => updateSetting('autoPlayNext', checked)}
            slotProps={{ input: { 'aria-label': 'Toggle auto-play next' } }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Audio ───────────────────────────────────────────────── */}
      <SettingSection
        icon={Headphones}
        title="Audio"
        iconColor={tokens.colors.accent.amber}
      >
        <SettingRow label="EQ Preset" description="Choose an equalizer profile">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={settings.eqPreset}
              onChange={handleEqChange}
              sx={{
                borderRadius: `${tokens.radius.md}px`,
                fontSize: tokens.typography.body2.size,
                backgroundColor: tokens.colors.surface,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: tokens.colors.surfaceBorder,
                },
              }}
              inputProps={{ 'aria-label': 'EQ preset' }}
            >
              {EQ_PRESETS.map((preset) => (
                <MenuItem key={preset.name} value={preset.name}>
                  {preset.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>

        <SettingRow label="Spatial Audio" description="Immersive 3D audio experience" noDivider>
          <Switch
            checked={settings.spatialAudioEnabled}
            onChange={(_, checked) => updateSetting('spatialAudioEnabled', checked)}
            slotProps={{ input: { 'aria-label': 'Toggle spatial audio' } }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Downloads ───────────────────────────────────────────── */}
      <SettingSection
        icon={Download}
        title="Downloads"
        iconColor={tokens.colors.accent.emerald}
      >
        <SettingRow
          label="Concurrent Downloads"
          description={`Up to ${settings.concurrentDownloads} simultaneous downloads`}
        >
          <Slider
            value={settings.concurrentDownloads}
            min={1}
            max={5}
            step={1}
            marks
            onChange={(_, val) => updateSetting('concurrentDownloads', val as number)}
            valueLabelDisplay="auto"
            sx={{ width: 160 }}
            aria-label="Concurrent downloads"
          />
        </SettingRow>

        <SettingRow
          label="Auto-download Favorites"
          description="Automatically download favorited tracks"
          noDivider
        >
          <Switch
            checked={settings.autoDownloadFavorites}
            onChange={(_, checked) => updateSetting('autoDownloadFavorites', checked)}
            slotProps={{ input: { 'aria-label': 'Toggle auto-download favorites' } }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Storage ─────────────────────────────────────────────── */}
      <SettingSection
        icon={HardDrive}
        title="Storage"
        iconColor={tokens.colors.accent.red}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1.5,
          }}
        >
          <Button
            variant="outlined"
            startIcon={<Trash2 size={16} />}
            sx={{
              borderColor: tokens.colors.surfaceBorder,
              color: tokens.colors.textSecondary,
              borderRadius: `${tokens.radius.lg}px`,
              py: 1.5,
              justifyContent: 'flex-start',
              '&:hover': {
                borderColor: tokens.colors.error,
                color: tokens.colors.error,
                backgroundColor: `${tokens.colors.error}08`,
              },
            }}
          >
            Clear History
          </Button>
          <Button
            variant="outlined"
            startIcon={<Database size={16} />}
            sx={{
              borderColor: tokens.colors.surfaceBorder,
              color: tokens.colors.textSecondary,
              borderRadius: `${tokens.radius.lg}px`,
              py: 1.5,
              justifyContent: 'flex-start',
              '&:hover': {
                borderColor: tokens.colors.warning,
                color: tokens.colors.warning,
                backgroundColor: `${tokens.colors.warning}08`,
              },
            }}
          >
            Clear Cache
          </Button>
          <Button
            variant="outlined"
            startIcon={<Upload size={16} />}
            sx={{
              borderColor: tokens.colors.surfaceBorder,
              color: tokens.colors.textSecondary,
              borderRadius: `${tokens.radius.lg}px`,
              py: 1.5,
              justifyContent: 'flex-start',
              '&:hover': {
                borderColor: tokens.colors.primary,
                color: tokens.colors.primary,
                backgroundColor: `${tokens.colors.primary}08`,
              },
            }}
          >
            Export Library
          </Button>
          <Button
            variant="outlined"
            startIcon={<FolderDown size={16} />}
            sx={{
              borderColor: tokens.colors.surfaceBorder,
              color: tokens.colors.textSecondary,
              borderRadius: `${tokens.radius.lg}px`,
              py: 1.5,
              justifyContent: 'flex-start',
              '&:hover': {
                borderColor: tokens.colors.accent.cyan,
                color: tokens.colors.accent.cyan,
                backgroundColor: `${tokens.colors.accent.cyan}08`,
              },
            }}
          >
            Import Library
          </Button>
        </Box>
      </SettingSection>

      {/* ── About ───────────────────────────────────────────────── */}
      <SettingSection
        icon={Info}
        title="About"
        iconColor={tokens.colors.accent.blue}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography
              variant="h6"
              sx={{
                color: tokens.colors.textPrimary,
                fontWeight: 700,
                background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.accent.pink})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Singularity Player
            </Typography>
            <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
              Version 2.0.0 • Music Platform
            </Typography>
          </Box>
          <Button
            size="small"
            startIcon={<RotateCcw size={14} />}
            onClick={() => useSettingsStore.getState().resetSettings()}
            sx={{
              color: tokens.colors.textTertiary,
              '&:hover': { color: tokens.colors.warning },
            }}
          >
            Reset All Settings
          </Button>
        </Box>
      </SettingSection>
    </Box>
  );
};
