import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { tokens } from '../../theme/muiTheme';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  iconColor,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      py: 10,
      px: 4,
      textAlign: 'center',
    }}
  >
    <Box
      sx={{
        p: 2,
        borderRadius: '50%',
        backgroundColor: `${iconColor || tokens.colors.primary}15`,
        mb: 3,
      }}
    >
      <Icon size={40} color={iconColor || tokens.colors.primary} />
    </Box>
    <Typography variant="h6" sx={{ mb: 1, color: tokens.colors.textPrimary }}>
      {title}
    </Typography>
    <Typography
      variant="body2"
      sx={{ color: tokens.colors.textSecondary, maxWidth: 400 }}
    >
      {description}
    </Typography>
    {actionLabel && onAction && (
      <Button
        variant="contained"
        onClick={onAction}
        sx={{ mt: 3, borderRadius: `${tokens.radius.lg}px` }}
      >
        {actionLabel}
      </Button>
    )}
  </Box>
);
