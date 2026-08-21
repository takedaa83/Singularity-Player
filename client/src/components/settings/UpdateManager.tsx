import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  RotateCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  GitBranch,
  GitCommit,
  ArrowUpCircle,
  Clock,
  FileText,
  Download,
} from 'lucide-react';
import { tokens } from '../../theme/muiTheme';
import { updaterService, UpdateStatus } from '../../services/updaterService';
import { useToast } from '../../hooks/useToast';

export const UpdateManager: React.FC = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyStep, setApplyStep] = useState<string>('');
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

  useEffect(() => {
    const unsub = updaterService.subscribe((s) => {
      setStatus(s);
    });

    // Auto-check on load if not checked yet
    if (!updaterService.getStatus()) {
      handleCheck(false);
    }

    return unsub;
  }, []);

  const handleCheck = async (force = true) => {
    setIsChecking(true);
    try {
      const res = await updaterService.checkForUpdates(force);
      if (res && force) {
        if (res.updateAvailable) {
          showToast(`New update available: ${res.latestVersion || res.latestCommit}`, 'info');
        } else {
          showToast('Singularity Player is up to date!', 'success');
        }
      }
    } catch {
      showToast('Failed to check for updates', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (isApplying) return;
    setIsApplying(true);

    // Native Desktop App updating
    if (isElectron && (window as any).electronAPI?.downloadAndInstallUpdate) {
      setApplyStep('Downloading update from GitHub release...');
      setDownloadPercent(0);

      const unsubProgress = (window as any).electronAPI.onUpdateProgress((p: any) => {
        setDownloadPercent(p.percent);
        setApplyStep(`Downloading update... ${p.percent}%`);
      });

      try {
        const downloadUrl =
          status?.releaseDownloadUrl ||
          'https://github.com/takedaa83/Singularity-Player/releases/latest/download/Singularity.Player.Setup.2.0.2.exe';

        await (window as any).electronAPI.downloadAndInstallUpdate(downloadUrl);
        setApplyStep('Download complete! Closing app and applying update...');
        showToast('Restarting Singularity Player...', 'info');

        setTimeout(() => {
          (window as any).electronAPI.restartAndInstall();
        }, 1200);
      } catch (err: any) {
        showToast(err.message || 'Failed to download desktop update', 'error');
        setIsApplying(false);
        setApplyStep('');
        setDownloadPercent(null);
      } finally {
        unsubProgress?.();
      }
      return;
    }

    // Web / Git pull mode
    setApplyStep('Fetching latest updates from repository...');
    try {
      setTimeout(() => setApplyStep('Compiling optimized standalone bundle...'), 2000);
      const res = await updaterService.applyUpdate();
      setApplyStep('Update complete! Reloading application...');
      showToast(res.message, 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      showToast(err.message || 'Failed to apply update', 'error');
      setIsApplying(false);
      setApplyStep('');
    }
  };

  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, rgba(250, 45, 85, 0.05) 0%, rgba(139, 92, 246, 0.05) 50%, rgba(6, 182, 212, 0.03) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '18px',
        p: { xs: 2.5, sm: 3 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background ambient decorative light */}
      <Box
        sx={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(30px)',
        }}
      />

      {/* Header Row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #fa2d55, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(250, 45, 85, 0.35)',
            }}
          >
            <Sparkles size={20} color="#fff" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
              Software Updates & Version Control
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '0.8rem' }}>
              Real-time synchronization with official GitHub release repository
            </Typography>
          </Box>
        </Box>

        {/* Live Status Chip */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isChecking ? (
            <Chip
              icon={<CircularProgress size={14} sx={{ color: '#8b5cf6' }} />}
              label="Checking GitHub..."
              size="small"
              sx={{
                background: 'rgba(139, 92, 246, 0.12)',
                color: '#c4b5fd',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />
          ) : status?.updateAvailable ? (
            <Chip
              icon={<ArrowUpCircle size={14} color="#fa2d55" />}
              label={`Update Available (${status.latestVersion || status.latestCommit})`}
              size="small"
              sx={{
                background: 'rgba(250, 45, 85, 0.15)',
                color: '#ff6b8b',
                border: '1px solid rgba(250, 45, 85, 0.35)',
                fontWeight: 700,
                fontSize: '0.75rem',
                animation: 'pulse 2s infinite',
              }}
            />
          ) : (
            <Chip
              icon={<CheckCircle2 size={14} color="#10b981" />}
              label="Up to Date"
              size="small"
              sx={{
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />
          )}
        </Box>
      </Box>

      {/* Info Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 1.5,
          p: 2,
          borderRadius: '12px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          mb: 2.5,
        }}
      >
        <Box>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Installed Version
          </Typography>
          <Typography sx={{ color: '#fff', fontSize: '0.92rem', fontWeight: 700, mt: 0.3 }}>
            v{status?.currentVersion || '2.0.2'}
            {status?.currentCommit && (
              <Typography component="span" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.78rem', ml: 0.8, fontFamily: 'monospace' }}>
                ({status.currentCommit})
              </Typography>
            )}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Latest Remote
          </Typography>
          <Typography sx={{ color: status?.updateAvailable ? '#ff6b8b' : '#34d399', fontSize: '0.92rem', fontWeight: 700, mt: 0.3 }}>
            v{status?.latestVersion || '2.0.2'}
            {status?.latestCommit && (
              <Typography component="span" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.78rem', ml: 0.8, fontFamily: 'monospace' }}>
                ({status.latestCommit})
              </Typography>
            )}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Deployment Environment
          </Typography>
          <Typography sx={{ color: '#c4b5fd', fontSize: '0.92rem', fontWeight: 600, mt: 0.3 }}>
            {isElectron ? 'Desktop Standalone (Windows x64)' : (status?.isGitRepo ? 'Self-Hosted Git Workspace' : 'Self-Hosted Production Node')}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Last Telemetry Check
          </Typography>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.85rem', mt: 0.3 }}>
            {status?.checkedAt ? new Date(status.checkedAt).toLocaleTimeString() : 'Just now'}
          </Typography>
        </Box>
      </Box>

      {/* Latest Commit Message preview if available */}
      {status?.latestCommitMessage && status.updateAvailable && (
        <Box
          sx={{
            p: 1.5,
            px: 2,
            mb: 2.5,
            borderRadius: '10px',
            background: 'rgba(250, 45, 85, 0.08)',
            border: '1px solid rgba(250, 45, 85, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <GitCommit size={16} color="#fa2d55" style={{ flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.82rem', color: '#ffb3c1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong>New Commit:</strong> {status.latestCommitMessage}
          </Typography>
        </Box>
      )}

      {/* Progress Bar when applying update */}
      {isApplying && (
        <Box sx={{ mb: 2.5, p: 2, borderRadius: '10px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={16} sx={{ color: '#a855f7' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#e9d5ff' }}>
                {applyStep}
              </Typography>
            </Box>
            {downloadPercent !== null && (
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff6b8b' }}>
                {downloadPercent}%
              </Typography>
            )}
          </Box>
          <Box sx={{ width: '100%', height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <Box
              sx={{
                width: downloadPercent !== null ? `${downloadPercent}%` : '60%',
                height: '100%',
                background: 'linear-gradient(90deg, #fa2d55, #8b5cf6, #06b6d4)',
                borderRadius: 3,
                transition: 'width 0.2s ease',
                ...(downloadPercent === null && {
                  animation: 'loader-slide 1.5s infinite linear',
                }),
              }}
            />
          </Box>
        </Box>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          onClick={() => handleCheck(true)}
          disabled={isChecking || isApplying}
          startIcon={<RotateCw size={16} className={isChecking ? 'animate-spin' : ''} />}
          sx={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '10px',
            px: 2.2,
            py: 0.8,
            '&:hover': {
              background: 'rgba(255, 255, 255, 0.15)',
              borderColor: 'rgba(255, 255, 255, 0.25)',
            },
          }}
        >
          {isChecking ? 'Checking...' : 'Check for Updates'}
        </Button>

        {status?.updateAvailable && (
          <Button
            variant="contained"
            onClick={handleApplyUpdate}
            disabled={isApplying}
            startIcon={<ArrowUpCircle size={16} />}
            sx={{
              background: 'linear-gradient(135deg, #fa2d55, #8b5cf6)',
              color: '#fff',
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: '10px',
              px: 2.6,
              py: 0.8,
              boxShadow: '0 4px 16px rgba(250, 45, 85, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #ff4065, #9d68ff)',
                boxShadow: '0 6px 20px rgba(250, 45, 85, 0.55)',
              },
            }}
          >
            {isApplying
              ? (isElectron ? 'Updating & Restarting...' : 'Updating App...')
              : (isElectron ? 'Update & Restart App' : 'Update to Latest Version')}
          </Button>
        )}

        {status?.releaseNotes && (
          <Button
            variant="outlined"
            onClick={() => setShowChangelog(true)}
            startIcon={<FileText size={16} />}
            sx={{
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: 'rgba(255, 255, 255, 0.8)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '10px',
              px: 2,
              py: 0.8,
              '&:hover': {
                borderColor: '#8b5cf6',
                color: '#fff',
                background: 'rgba(139, 92, 246, 0.08)',
              },
            }}
          >
            View Changelog
          </Button>
        )}

        <Button
          variant="text"
          component="a"
          href={status?.repoUrl || 'https://github.com/takedaa83/Singularity-Player'}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<ExternalLink size={14} />}
          sx={{
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'none',
            fontSize: '0.82rem',
            '&:hover': { color: '#fff' },
          }}
        >
          GitHub Repository
        </Button>
      </Box>

      {/* Changelog Dialog */}
      <Dialog
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            background: '#0e0d16',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            color: '#fff',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Sparkles size={20} color="#fa2d55" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Release Notes (v{status?.latestVersion})
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography
            component="pre"
            sx={{
              fontFamily: 'inherit',
              fontSize: '0.88rem',
              color: 'rgba(255, 255, 255, 0.85)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {status?.releaseNotes || 'No detailed release notes provided for this release.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Button
            onClick={() => setShowChangelog(false)}
            sx={{ color: '#c4b5fd', textTransform: 'none', fontWeight: 600 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
