import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { CheckCircle2 as CompleteIcon, AlertCircle as ErrorIcon, Pause as PauseIcon, Clock as QueueIcon } from 'lucide-react';
import { tokens } from '../../theme/muiTheme';
import { DownloadStatus } from '../../types';

interface DownloadProgressBarProps {
  status: DownloadStatus;
  progress: number;
}

export const DownloadProgressBar: React.FC<DownloadProgressBarProps> = ({ status, progress }) => {
  const isPending = status === 'queued';
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';
  const isComplete = status === 'completed';

  const getColor = () => {
    if (isComplete) return tokens.colors.success;
    if (isFailed) return tokens.colors.error;
    if (isPaused) return tokens.colors.warning;
    return tokens.colors.primary;
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
      {/* Icon indicators */}
      <Box sx={{ display: 'flex', flexShrink: 0 }}>
        {isComplete && <CompleteIcon size={16} color={tokens.colors.success} />}
        {isFailed && <ErrorIcon size={16} color={tokens.colors.error} />}
        {isPaused && <PauseIcon size={16} color={tokens.colors.warning} />}
        {isPending && <QueueIcon size={16} color={tokens.colors.textTertiary} className="animate-pulse" />}
      </Box>

      {/* Progress Line */}
      <Box sx={{ flex: 1 }}>
        {isPending ? (
          <LinearProgress
            variant="indeterminate"
            sx={{
              height: 4,
              borderRadius: tokens.radius.full,
              bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiLinearProgress-bar': {
                bgcolor: tokens.colors.textTertiary,
              },
            }}
          />
        ) : (
          <LinearProgress
            variant={progress < 0 ? 'indeterminate' : 'determinate'}
            value={progress >= 0 ? progress : undefined}
            sx={{
              height: 4,
              borderRadius: tokens.radius.full,
              bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiLinearProgress-bar': {
                bgcolor: getColor(),
                transition: 'transform 0.4s ease',
              },
            }}
          />
        )}
      </Box>

      {/* Percentage Text */}
      {!isPending && !isComplete && !isFailed && progress >= 0 && (
        <Typography variant="caption" sx={{ color: tokens.colors.textSecondary, minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
          {progress}%
        </Typography>
      )}
    </Box>
  );
};
export default DownloadProgressBar;
