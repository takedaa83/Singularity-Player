import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { Play, ListPlus, Heart, Download, Trash2, User, Disc, Package } from 'lucide-react';
import { Track } from '../../types';
import { tokens } from '../../theme/muiTheme';

interface TrackContextMenuProps {
  track: Track | null;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onPlay?: () => void;
  onAddToQueue?: () => void;
  onToggleFavorite?: () => void;
  onDownload?: () => void;
  onAddToBatch?: () => void;
  onDelete?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  isFavorite?: boolean;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  track,
  anchorPosition,
  onClose,
  onPlay,
  onAddToQueue,
  onToggleFavorite,
  onDownload,
  onAddToBatch,
  onDelete,
  onGoToArtist,
  onGoToAlbum,
  isFavorite,
}) => {
  if (!track) return null;

  return (
    <Menu
      open={!!anchorPosition}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition || undefined}
      slotProps={{ paper: { sx: { minWidth: 200, py: 0.5 } } }}
    >
      {onPlay && (
        <MenuItem onClick={() => { onPlay(); onClose(); }}>
          <ListItemIcon>
            <Play size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Play</ListItemText>
        </MenuItem>
      )}
      {onAddToQueue && (
        <MenuItem onClick={() => { onAddToQueue(); onClose(); }}>
          <ListItemIcon>
            <ListPlus size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Add to Queue</ListItemText>
        </MenuItem>
      )}

      <Divider sx={{ my: 0.5 }} />

      {onToggleFavorite && (
        <MenuItem onClick={() => { onToggleFavorite(); onClose(); }}>
          <ListItemIcon>
            <Heart
              size={16}
              color={isFavorite ? tokens.colors.accent.pink : tokens.colors.textSecondary}
              fill={isFavorite ? tokens.colors.accent.pink : 'none'}
            />
          </ListItemIcon>
          <ListItemText>
            {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </ListItemText>
        </MenuItem>
      )}
      {onDownload && (
        <MenuItem onClick={() => { onDownload(); onClose(); }}>
          <ListItemIcon>
            <Download size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
      )}
      {onAddToBatch && (
        <MenuItem onClick={() => { onAddToBatch(); onClose(); }}>
          <ListItemIcon>
            <Package size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Add to Batch Packager</ListItemText>
        </MenuItem>
      )}

      <Divider sx={{ my: 0.5 }} />

      {onGoToArtist && (
        <MenuItem onClick={() => { onGoToArtist(); onClose(); }}>
          <ListItemIcon>
            <User size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Go to Artist</ListItemText>
        </MenuItem>
      )}
      {onGoToAlbum && (
        <MenuItem onClick={() => { onGoToAlbum(); onClose(); }}>
          <ListItemIcon>
            <Disc size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Go to Album</ListItemText>
        </MenuItem>
      )}

      {onDelete && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem onClick={() => { onDelete(); onClose(); }}>
            <ListItemIcon>
              <Trash2 size={16} color={tokens.colors.error} />
            </ListItemIcon>
            <ListItemText
              sx={{ '& .MuiTypography-root': { color: tokens.colors.error } }}
            >
              Delete
            </ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
};
