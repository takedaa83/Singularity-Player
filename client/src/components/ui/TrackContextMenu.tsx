import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { Play, ListPlus, Plus, Heart, Download, Trash2, User, Disc, Package, Radio } from 'lucide-react';
import { Track } from '../../types';
import { tokens } from '../../theme/muiTheme';

interface TrackContextMenuProps {
  track: Track | null;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onPlay?: () => void;
  onAddToQueue?: () => void;
  onPlayNext?: () => void;
  onToggleFavorite?: () => void;
  onDownload?: () => void;
  onAddToBatch?: () => void;
  onDelete?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  isFavorite?: boolean;
  onCreateSimilarPlaylist?: () => void;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  track,
  anchorPosition,
  onClose,
  onPlay,
  onAddToQueue,
  onPlayNext,
  onToggleFavorite,
  onDownload,
  onAddToBatch,
  onDelete,
  onGoToArtist,
  onGoToAlbum,
  isFavorite,
  onCreateSimilarPlaylist,
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
        <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
          <ListItemIcon>
            <Play size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Play</ListItemText>
        </MenuItem>
      )}
      {onAddToQueue && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onAddToQueue(); onClose(); }}>
          <ListItemIcon>
            <ListPlus size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Add to Queue</ListItemText>
        </MenuItem>
      )}
      {onPlayNext && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onPlayNext(); onClose(); }}>
          <ListItemIcon>
            <Plus size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Play Next</ListItemText>
        </MenuItem>
      )}
      {onCreateSimilarPlaylist && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onCreateSimilarPlaylist(); onClose(); }}>
          <ListItemIcon>
            <Radio size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Start Song Radio</ListItemText>
        </MenuItem>
      )}

      <Divider sx={{ my: 0.5 }} />

      {onToggleFavorite && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onToggleFavorite(); onClose(); }}>
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
        <MenuItem onClick={(e) => { e.stopPropagation(); onDownload(); onClose(); }}>
          <ListItemIcon>
            <Download size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
      )}
      {onAddToBatch && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onAddToBatch(); onClose(); }}>
          <ListItemIcon>
            <Package size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Add to Batch Packager</ListItemText>
        </MenuItem>
      )}

      <Divider sx={{ my: 0.5 }} />

      {onGoToArtist && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onGoToArtist(); onClose(); }}>
          <ListItemIcon>
            <User size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Go to Artist</ListItemText>
        </MenuItem>
      )}
      {onGoToAlbum && (
        <MenuItem onClick={(e) => { e.stopPropagation(); onGoToAlbum(); onClose(); }}>
          <ListItemIcon>
            <Disc size={16} color={tokens.colors.textSecondary} />
          </ListItemIcon>
          <ListItemText>Go to Album</ListItemText>
        </MenuItem>
      )}

      {onDelete && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}>
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
