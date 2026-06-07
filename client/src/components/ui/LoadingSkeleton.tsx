import React from 'react';
import { Box, Skeleton } from '@mui/material';
import { tokens } from '../../theme/muiTheme';

interface LoadingSkeletonProps {
  count?: number;
  variant?: 'track' | 'card' | 'section';
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  count = 5,
  variant = 'track',
}) => {
  if (variant === 'card') {
    return (
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'hidden' }}>
        {Array.from({ length: count }).map((_, i) => (
          <Box key={i} sx={{ flexShrink: 0, width: 160 }}>
            <Skeleton
              variant="rounded"
              width={160}
              height={160}
              sx={{ borderRadius: `${tokens.radius.lg}px`, mb: 1 }}
            />
            <Skeleton width="80%" height={16} />
            <Skeleton width="60%" height={14} />
          </Box>
        ))}
      </Box>
    );
  }

  if (variant === 'section') {
    return (
      <Box sx={{ mb: 4 }}>
        <Skeleton width={200} height={28} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width={160}
              height={200}
              sx={{ borderRadius: `${tokens.radius.lg}px`, flexShrink: 0 }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // Default: track variant
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 1.5,
            borderRadius: `${tokens.radius.md}px`,
          }}
        >
          <Skeleton
            variant="rounded"
            width={44}
            height={44}
            sx={{ borderRadius: `${tokens.radius.sm}px`, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1 }}>
            <Skeleton width={`${60 + (i * 7) % 30}%`} height={16} />
            <Skeleton width={`${40 + (i * 11) % 20}%`} height={14} sx={{ mt: 0.5 }} />
          </Box>
          <Skeleton width={40} height={14} />
        </Box>
      ))}
    </Box>
  );
};
