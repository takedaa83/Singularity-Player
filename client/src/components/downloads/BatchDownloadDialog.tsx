import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, RadioGroup, FormControlLabel, Radio, Box, Typography } from '@mui/material';
import { Download as DownloadIcon, FolderArchive as ZipIcon, ListPlus as QueueIcon } from 'lucide-react';
import { Track } from '../../types';
import { useDownloadStore } from '../../stores/downloadStore';
import { useToast } from '../../hooks/useToast';
import { api } from '../../utils/api';
import { tokens } from '../../theme/muiTheme';

interface BatchDownloadDialogProps {
  open: boolean;
  tracks: Track[];
  onClose: () => void;
  onSuccess?: () => void;
}

export const BatchDownloadDialog: React.FC<BatchDownloadDialogProps> = ({
  open,
  tracks,
  onClose,
  onSuccess,
}) => {
  const [downloadType, setDownloadType] = useState<'individual' | 'zip'>('individual');
  const enqueueBatch = useDownloadStore((s) => s.enqueueBatch);
  const { toast } = useToast();

  const handleStartDownload = async () => {
    if (downloadType === 'individual') {
      enqueueBatch(tracks);
      toast(`Added ${tracks.length} tracks to downloads queue`, 'success');
      if (onSuccess) onSuccess();
      onClose();
    } else {
      // ZIP download: POST to server /api/download/batch
      try {
        toast('Preparing ZIP collection...', 'info');
        
        // Filter local files
        const localTracks = tracks.filter((t) => t.source === 'local' && t.filePath);
        if (localTracks.length === 0) {
          toast('ZIP packaging is only supported for local uploaded files', 'error');
          return;
        }

        const body = {
          tracks: localTracks.map((t) => ({
            filePath: t.filePath,
            title: t.title,
            artist: t.artist,
            album: t.album,
            originalName: `${t.artist} - ${t.title}.mp3`,
          })),
        };

        const res = await fetch(api.batchDownloadUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error('Failed to package ZIP');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'music_collection.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast('ZIP download started!', 'success');
        if (onSuccess) onSuccess();
        onClose();
      } catch (err) {
        console.error('ZIP batch download error:', err);
        toast('Failed to download ZIP collection', 'error');
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>Batch Download</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2, color: tokens.colors.textSecondary, fontSize: 13 }}>
          You have selected <strong>{tracks.length}</strong> track{tracks.length > 1 ? 's' : ''}. Choose how you would like to download them:
        </DialogContentText>
        
        <RadioGroup value={downloadType} onChange={(e) => setDownloadType(e.target.value as any)}>
          {/* Option 1: Queue Individually */}
          <Box sx={{
            border: `1px solid ${downloadType === 'individual' ? tokens.colors.primary : tokens.colors.surfaceBorder}`,
            borderRadius: `${tokens.radius.md}px`,
            p: 1.5,
            mb: 1.5,
            bgcolor: downloadType === 'individual' ? 'rgba(168,85,247,0.05)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }} onClick={() => setDownloadType('individual')}>
            <FormControlLabel
              value="individual"
              control={<Radio />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <QueueIcon size={16} color={tokens.colors.primary} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Queue Individually (Recommended)</Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, display: 'block' }}>
                      Downloads tracks concurrently in the background with progress.
                    </Typography>
                  </Box>
                </Box>
              }
            />
          </Box>

          {/* Option 2: ZIP Archive */}
          <Box sx={{
            border: `1px solid ${downloadType === 'zip' ? tokens.colors.primary : tokens.colors.surfaceBorder}`,
            borderRadius: `${tokens.radius.md}px`,
            p: 1.5,
            bgcolor: downloadType === 'zip' ? 'rgba(168,85,247,0.05)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }} onClick={() => setDownloadType('zip')}>
            <FormControlLabel
              value="zip"
              control={<Radio />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ZipIcon size={16} color={tokens.colors.accent.amber} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Package as ZIP Archive</Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.textTertiary, display: 'block' }}>
                      Downloads selected local uploads packaged inside a single ZIP file.
                    </Typography>
                  </Box>
                </Box>
              }
            />
          </Box>
        </RadioGroup>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ color: tokens.colors.textSecondary }}>Cancel</Button>
        <Button
          onClick={handleStartDownload}
          variant="contained"
          startIcon={<DownloadIcon size={15} />}
          sx={{ borderRadius: `${tokens.radius.lg}px` }}
        >
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default BatchDownloadDialog;
