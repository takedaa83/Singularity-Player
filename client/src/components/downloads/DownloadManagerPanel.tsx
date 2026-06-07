import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  Download,
  Pause,
  Play,
  RotateCcw,
  X,
  Trash2,
} from 'lucide-react';
import {
  useDownloadStore,
  selectActiveDownloads,
  selectQueuedDownloads,
  selectCompletedDownloads,
  selectFailedDownloads,
} from '../../stores/downloadStore';
import { DownloadQueueItem } from '../../types';
import { tokens } from '../../theme/muiTheme';
import { formatDuration } from '../../utils/formatDuration';
import { EmptyState } from '../ui/EmptyState';
import { ViewHeader } from '../ui/ViewHeader';

import { DownloadProgressBar } from './DownloadProgressBar';

// ─── Individual Download Item ────────────────────────────────────────

const DownloadItem: React.FC<{ item: DownloadQueueItem }> = ({ item }) => {
  const { cancel, pause, resume, retry } = useDownloadStore();

  const statusColors: Record<string, string> = {
    queued: tokens.colors.textTertiary,
    active: tokens.colors.primary,
    paused: tokens.colors.warning,
    completed: tokens.colors.success,
    failed: tokens.colors.error,
  };

  const statusLabels: Record<string, string> = {
    queued: 'Queued',
    active: 'Downloading',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return '';
    if (bytesPerSec > 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
    if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec} B/s`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderRadius: `${tokens.radius.lg}px`,
        backgroundColor: tokens.colors.surfaceVariant,
        border: `1px solid ${tokens.colors.surfaceBorder}`,
        transition: tokens.transitions.fast,
        '&:hover': { backgroundColor: tokens.colors.surfaceElevated },
      }}
    >
      {/* Cover art */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: `${tokens.radius.md}px`,
          flexShrink: 0,
          overflow: 'hidden',
          backgroundColor: tokens.colors.surface,
        }}
      >
        {item.track.coverArtUrl && (
          <img
            src={item.track.coverArtUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </Box>

      {/* Track info + progress */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: tokens.colors.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.track.title}
        </Typography>
        <Typography variant="caption" sx={{ color: tokens.colors.textSecondary }}>
          {item.track.artist}
        </Typography>

        <Box sx={{ mt: 1 }}>
          <DownloadProgressBar status={item.status} progress={item.progress} />
          {item.status === 'active' && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
                {item.speed > 0 ? formatSpeed(item.speed) : ''}
              </Typography>
              {item.eta > 0 && (
                <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>
                  {formatDuration(item.eta)} remaining
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {item.status === 'failed' && item.error && (
          <Typography
            variant="caption"
            sx={{ color: tokens.colors.error, mt: 0.5, display: 'block' }}
          >
            {item.error}
          </Typography>
        )}
      </Box>

      {/* Status chip */}
      <Chip
        label={statusLabels[item.status]}
        size="small"
        sx={{
          backgroundColor: `${statusColors[item.status]}20`,
          color: statusColors[item.status],
          fontWeight: 500,
          fontSize: 11,
        }}
      />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {item.status === 'active' && (
          <Tooltip title="Pause">
            <IconButton
              size="small"
              onClick={() => pause(item.id)}
              aria-label="Pause download"
            >
              <Pause size={16} />
            </IconButton>
          </Tooltip>
        )}
        {item.status === 'paused' && (
          <Tooltip title="Resume">
            <IconButton
              size="small"
              onClick={() => resume(item.id)}
              aria-label="Resume download"
            >
              <Play size={16} />
            </IconButton>
          </Tooltip>
        )}
        {item.status === 'failed' && (
          <Tooltip title="Retry">
            <IconButton
              size="small"
              onClick={() => retry(item.id)}
              aria-label="Retry download"
            >
              <RotateCcw size={16} />
            </IconButton>
          </Tooltip>
        )}
        {(item.status === 'queued' ||
          item.status === 'active' ||
          item.status === 'paused' ||
          item.status === 'failed') && (
          <Tooltip title="Cancel">
            <IconButton
              size="small"
              onClick={() => cancel(item.id)}
              aria-label="Cancel download"
            >
              <X size={16} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

// ─── Download Section ────────────────────────────────────────────────

const DownloadSection: React.FC<{
  title: string;
  count: number;
  items: DownloadQueueItem[];
  titleColor?: string;
}> = ({ title, count, items, titleColor }) => {
  if (items.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="subtitle2"
        sx={{
          color: titleColor || tokens.colors.textSecondary,
          mb: 1.5,
          textTransform: 'uppercase',
          fontSize: 11,
          letterSpacing: 1,
        }}
      >
        {title} ({count})
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item) => (
          <DownloadItem key={item.id} item={item} />
        ))}
      </Box>
    </Box>
  );
};

// ─── Download Manager Panel ──────────────────────────────────────────

export const DownloadManagerPanel: React.FC = () => {
  const activeDownloads = useDownloadStore(selectActiveDownloads);
  const queuedDownloads = useDownloadStore(selectQueuedDownloads);
  const completedDownloads = useDownloadStore(selectCompletedDownloads);
  const failedDownloads = useDownloadStore(selectFailedDownloads);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);

  const allItems = useDownloadStore((s) => s.queue);
  const hasItems = allItems.length > 0;

  return (
    <Box>
      <ViewHeader
        icon={Download}
        title="Downloads"
        subtitle={
          hasItems
            ? `${activeDownloads.length} active • ${queuedDownloads.length} queued • ${completedDownloads.length} completed`
            : 'Manage your downloads'
        }
        iconColor={tokens.colors.accent.cyan}
        actions={
          completedDownloads.length > 0 ? (
            <Button
              size="small"
              startIcon={<Trash2 size={14} />}
              onClick={clearCompleted}
              sx={{ color: tokens.colors.textSecondary }}
            >
              Clear Completed
            </Button>
          ) : undefined
        }
      />

      {!hasItems && (
        <EmptyState
          icon={Download}
          title="No Downloads"
          description="Download tracks to see them here. Click the download button on any track to get started."
        />
      )}

      <DownloadSection
        title="Active"
        count={activeDownloads.length}
        items={activeDownloads}
      />

      <DownloadSection
        title="Queued"
        count={queuedDownloads.length}
        items={queuedDownloads}
      />

      <DownloadSection
        title="Failed"
        count={failedDownloads.length}
        items={failedDownloads}
        titleColor={tokens.colors.error}
      />

      <DownloadSection
        title="Completed"
        count={completedDownloads.length}
        items={completedDownloads}
        titleColor={tokens.colors.success}
      />
    </Box>
  );
};
