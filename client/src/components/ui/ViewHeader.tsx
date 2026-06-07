import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/muiTheme';
import { LucideIcon } from 'lucide-react';

interface ViewHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconColor?: string;
  actions?: React.ReactNode;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  iconColor,
  actions,
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      mb: 4,
      flexWrap: 'wrap',
      gap: 2,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          p: 1.5,
          borderRadius: `${tokens.radius.lg}px`,
          background: `linear-gradient(135deg, ${iconColor || tokens.colors.primary}30, ${iconColor || tokens.colors.primary}10)`,
        }}
      >
        <Icon size={22} color={iconColor || tokens.colors.primary} />
      </Box>
      <Box>
        <Typography
          variant="h5"
          sx={{ color: tokens.colors.textPrimary, fontWeight: 700 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: tokens.colors.textSecondary }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
  </Box>
);
