import React from 'react';
import { Box, Typography, Button, IconButton, Tooltip, Alert, AlertTitle, Grid, Card } from '@mui/material';
import { Trash2, FolderArchive, Play, Download, Trash, AlertTriangle, Disc } from 'lucide-react';
import { useBatchStore } from '../../stores/batchStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { useToast } from '../../hooks/useToast';
import { api } from '../../utils/api';
import { tokens } from '../../theme/muiTheme';
import { EmptyState } from '../ui/EmptyState';
import { ViewHeader } from '../ui/ViewHeader';

export const BatchDownloadsPage: React.FC = () => {
  const { tracks, removeTrack, clearBatch } = useBatchStore();
  const enqueueBatch = useDownloadStore((s) => s.enqueueBatch);
  const { toast } = useToast();

  const localTracks = tracks.filter((t) => t.source === 'local' && t.filePath);
  const youtubeTracks = tracks.filter((t) => t.source === 'youtube');
  const hasLocal = localTracks.length > 0;
  const hasYoutube = youtubeTracks.length > 0;

  const handleDownloadQueue = () => {
    if (tracks.length === 0) return;
    enqueueBatch(tracks);
    toast(`Added ${tracks.length} tracks to downloads queue`, 'success');
    clearBatch();
  };

  const handleDownloadZip = async () => {
    if (localTracks.length === 0) {
      toast('No local uploaded tracks selected for ZIP compilation', 'error');
      return;
    }

    try {
      toast('Preparing ZIP collection...', 'info');

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
      a.download = 'singularity_player_collection.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast('ZIP download started!', 'success');
    } catch (err) {
      console.error('ZIP batch download error:', err);
      toast('Failed to download ZIP collection', 'error');
    }
  };

  return (
    <Box sx={{ color: tokens.colors.textPrimary, pb: 6 }}>
      <ViewHeader
        icon={FolderArchive}
        title="Batch Packager"
        subtitle="Collect and download multiple tracks at once"
        iconColor={tokens.colors.primary}
        actions={
          tracks.length > 0 ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Trash size={14} />}
                onClick={clearBatch}
                sx={{
                  color: tokens.colors.textSecondary,
                  borderColor: tokens.colors.surfaceBorder,
                  '&:hover': {
                    borderColor: tokens.colors.error,
                    color: tokens.colors.error,
                    backgroundColor: `${tokens.colors.error}10`,
                  },
                }}
              >
                Clear Selection
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<Download size={14} />}
                onClick={handleDownloadQueue}
                sx={{
                  backgroundColor: tokens.colors.primary,
                  '&:hover': { backgroundColor: tokens.colors.primaryDark },
                }}
              >
                Queue Downloads ({tracks.length})
              </Button>
              {hasLocal && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FolderArchive size={14} />}
                  onClick={handleDownloadZip}
                  sx={{
                    backgroundColor: tokens.colors.accent.cyan,
                    color: tokens.colors.background,
                    '&:hover': {
                      backgroundColor: tokens.colors.accent.cyan,
                      opacity: 0.9,
                    },
                  }}
                >
                  Download ZIP ({localTracks.length})
                </Button>
              )}
            </Box>
          ) : undefined
        }
      />

      {tracks.length === 0 ? (
        <EmptyState
          icon={FolderArchive}
          title="No Songs Selected"
          description="Right-click on any track and select 'Add to Batch Packager', or use Multi-Select inside your Library to accumulate songs for batch downloading."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'col', gap: 3 }}>
          {hasYoutube && (
            <Alert
              severity="warning"
              icon={<AlertTriangle size={20} />}
              sx={{
                mb: 3,
                width: '100%',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                color: tokens.colors.accent.amber,
                border: `1px solid ${tokens.colors.accent.amber}30`,
                borderRadius: `${tokens.radius.lg}px`,
                '.MuiAlert-icon': {
                  color: tokens.colors.accent.amber,
                },
              }}
            >
              <AlertTitle sx={{ fontWeight: 600 }}>YouTube Tracks Detected</AlertTitle>
              ZIP compilation is only supported for local uploaded tracks. YouTube tracks cannot be bundled into the ZIP file, but you can download them using the <strong>Queue Downloads</strong> button to save them to your device individually.
            </Alert>
          )}

          <Grid container spacing={2}>
            {tracks.map((track) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={track.id}>
                <Card
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 2,
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: tokens.colors.surfaceVariant,
                    border: `1px solid ${tokens.colors.surfaceBorder}`,
                    transition: tokens.transitions.fast,
                    '&:hover': {
                      borderColor: tokens.colors.primary,
                      backgroundColor: tokens.colors.surfaceElevated,
                    },
                  }}
                >
                  {/* Album Art / Cover */}
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: `${tokens.radius.md}px`,
                      flexShrink: 0,
                      overflow: 'hidden',
                      backgroundColor: tokens.colors.surface,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {track.coverArtUrl ? (
                      <img
                        src={track.coverArtUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Disc size={20} color={tokens.colors.textTertiary} />
                    )}
                  </Box>

                  {/* Track Details */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: tokens.colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {track.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: tokens.colors.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                      }}
                    >
                      {track.artist}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                      <Box
                        component="span"
                        sx={{
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          px: 1,
                          py: 0.25,
                          borderRadius: `${tokens.radius.xs}px`,
                          backgroundColor: `${
                            track.source === 'youtube' ? tokens.colors.source.youtube : tokens.colors.source.local
                          }18`,
                          color: track.source === 'youtube' ? tokens.colors.source.youtube : tokens.colors.source.local,
                        }}
                      >
                        {track.source}
                      </Box>
                      {track.album && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: tokens.colors.textTertiary,
                            fontSize: 10,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 100,
                          }}
                        >
                          • {track.album}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Actions */}
                  <IconButton
                    size="small"
                    onClick={() => removeTrack(track.id)}
                    sx={{
                      color: tokens.colors.textTertiary,
                      '&:hover': {
                        color: tokens.colors.error,
                        backgroundColor: `${tokens.colors.error}10`,
                      },
                    }}
                    aria-label="Remove from batch"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default BatchDownloadsPage;
