import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Chip,
  Button,
} from '@mui/material';
import {
  Terminal,
  Trash2,
  Copy,
  Download,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Activity,
  Zap,
  Play,
  RotateCw,
  ArrowDown,
  Server,
  Headphones,
  HardDrive,
  Radio,
  Cpu,
} from 'lucide-react';
import { tokens } from '../../theme/muiTheme';
import { loggerService, LogEntry, LogCategory, LogLevel } from '../../services/loggerService';
import { api, getApiBaseUrl } from '../../utils/api';
import { singularityEngine } from '../../services/singularityEngine';
import { useToast } from '../../hooks/useToast';

const CATEGORY_CHIPS: { label: string; value: LogCategory; icon: React.ElementType }[] = [
  { label: 'All Logs', value: 'all', icon: Terminal },
  { label: 'Audio & DSP', value: 'audio', icon: Headphones },
  { label: 'Network & API', value: 'network', icon: Radio },
  { label: 'Server Engine', value: 'server', icon: Server },
  { label: 'Desktop & Discord', value: 'desktop', icon: Cpu },
  { label: 'Database & Cache', value: 'database', icon: HardDrive },
];

export const SystemConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(() => loggerService.getLogs());
  const [selectedCategory, setSelectedCategory] = useState<LogCategory>('all');
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [copied, setCopied] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = loggerService.subscribe((updated) => {
      setLogs(updated);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filtered logs calculation
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }
      if (filterLevel !== 'all' && log.level !== filterLevel) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msg = (log.message || '').toLowerCase();
        const tag = (log.tag || '').toLowerCase();
        return msg.includes(q) || tag.includes(q);
      }
      return true;
    });
  }, [logs, selectedCategory, filterLevel, searchQuery]);

  // Diagnostics: Live ping server health
  const handlePingServer = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await api.health();
      const duration = Math.round(performance.now() - start);
      setPingMs(duration);
      loggerService.addSystemLog(
        'server',
        'success',
        `[Diagnostic] Ping /api/health returned 200 OK (${duration}ms) • yt-dlp: ${res.ytdlpVersion || 'Ready'}`
      );
      toast(`Server is healthy (${duration}ms)`, 'success');
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      setPingMs(null);
      loggerService.addSystemLog(
        'server',
        'error',
        `[Diagnostic] Ping /api/health failed after ${duration}ms: ${err.message}`
      );
      toast('Server ping failed: ' + err.message, 'error');
    } finally {
      setIsPinging(false);
    }
  };

  // Diagnostics: Test audio pipeline
  const handleTestAudio = () => {
    try {
      const diag = singularityEngine.getEngineDiagnostics();
      loggerService.addSystemLog(
        'audio',
        'info',
        `[Diagnostic Audio Engine] Context: ${diag.audioContextState} | Sample Rate: ${diag.sampleRate}Hz | Render FPS: ${diag.measuredFps} | LUFS: ${diag.estimatedLufs}`
      );
      toast('Audio Engine telemetry logged to console', 'info');
    } catch (err: any) {
      loggerService.addSystemLog('audio', 'error', `[Diagnostic Audio Engine] Error: ${err.message}`);
    }
  };

  // Copy logs
  const handleCopyLogs = () => {
    const formatted = filteredLogs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString().substring(11, 23);
        return `[${time}] [${l.level.toUpperCase()}] [${l.tag}] ${l.message}`;
      })
      .join('\n');

    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      toast('Console logs copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Export logs to .log file
  const handleExportLogs = () => {
    const header = `# Singularity Player Diagnostic System Log\n# Exported: ${new Date().toISOString()}\n# Base URL: ${getApiBaseUrl()}\n# Total Logs: ${filteredLogs.length}\n\n`;
    const body = filteredLogs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString();
        return `[${time}] [${l.level.toUpperCase()}] [${l.tag}] ${l.message}`;
      })
      .join('\n');

    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `singularity_diagnostics_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Diagnostic log file exported', 'success');
  };

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  return (
    <Box
      sx={{
        bgcolor: '#06070a',
        borderRadius: `${tokens.radius.xl}px`,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Bar: Telemetry & Status ── */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.5,
              borderRadius: '8px',
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            />
            <Typography sx={{ fontSize: '11px', fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>
              {isElectron ? 'ELECTRON DESKTOP NATIVE' : 'WEB CLIENT ONLINE'}
            </Typography>
          </Box>

          {pingMs !== null && (
            <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
              Latency: <span style={{ color: pingMs < 100 ? '#34d399' : '#f59e0b', fontWeight: 700 }}>{pingMs}ms</span>
            </Typography>
          )}

          <Typography sx={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', display: { xs: 'none', sm: 'block' } }}>
            {filteredLogs.length} events logged
          </Typography>
        </Box>

        {/* Quick Diagnostic Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handlePingServer}
            disabled={isPinging}
            startIcon={<Radio size={13} className={isPinging ? 'animate-spin' : ''} />}
            sx={{
              fontSize: '11px',
              py: 0.4,
              px: 1.2,
              borderRadius: '8px',
              borderColor: 'rgba(255,255,255,0.15)',
              color: '#cbd5e1',
              '&:hover': { borderColor: tokens.colors.primary, color: '#fff' },
            }}
          >
            Ping Server
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={handleTestAudio}
            startIcon={<Headphones size={13} />}
            sx={{
              fontSize: '11px',
              py: 0.4,
              px: 1.2,
              borderRadius: '8px',
              borderColor: 'rgba(255,255,255,0.15)',
              color: '#cbd5e1',
              '&:hover': { borderColor: tokens.colors.primary, color: '#fff' },
            }}
          >
            Test DSP Audio
          </Button>

          <Tooltip title="Copy Filtered Logs">
            <IconButton
              size="small"
              onClick={handleCopyLogs}
              sx={{ color: copied ? '#10b981' : '#94a3b8', '&:hover': { color: '#fff' } }}
            >
              <Copy size={15} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Export .log File">
            <IconButton
              size="small"
              onClick={handleExportLogs}
              sx={{ color: '#94a3b8', '&:hover': { color: '#fff' } }}
            >
              <Download size={15} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Clear Console">
            <IconButton
              size="small"
              onClick={() => loggerService.clear()}
              sx={{ color: '#94a3b8', '&:hover': { color: '#ef4444' } }}
            >
              <Trash2 size={15} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Filter Bar ── */}
      <Box
        sx={{
          px: 2.5,
          py: 1.2,
          bgcolor: 'rgba(0, 0, 0, 0.4)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Category Tabs */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {CATEGORY_CHIPS.map((tab) => {
            const isSelected = selectedCategory === tab.value;
            const Icon = tab.icon;
            return (
              <Chip
                key={tab.value}
                icon={<Icon size={12} />}
                label={tab.label}
                size="small"
                onClick={() => setSelectedCategory(tab.value)}
                sx={{
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  bgcolor: isSelected ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                  color: isSelected ? '#fff' : '#94a3b8',
                  border: isSelected ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                  },
                }}
              />
            );
          })}
        </Box>

        {/* Search & Auto-scroll */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={13} color="#64748b" />
                </InputAdornment>
              ),
              sx: {
                fontSize: '11px',
                height: 28,
                bgcolor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '6px',
                color: '#fff',
                width: { xs: 130, sm: 180 },
                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
              },
            }}
          />

          <Button
            size="small"
            onClick={() => setAutoScroll(!autoScroll)}
            startIcon={<ArrowDown size={12} />}
            sx={{
              fontSize: '10px',
              py: 0.3,
              px: 1,
              borderRadius: '6px',
              bgcolor: autoScroll ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: autoScroll ? '#60a5fa' : '#64748b',
              border: autoScroll ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
          </Button>
        </Box>
      </Box>

      {/* ── Console Terminal Viewport ── */}
      <Box
        ref={containerRef}
        sx={{
          height: 380,
          maxHeight: 500,
          overflowY: 'auto',
          p: 2,
          bgcolor: '#040507',
          fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
          fontSize: '11.5px',
          lineHeight: 1.6,
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '3px' },
        }}
      >
        {filteredLogs.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center', color: '#475569' }}>
            <Terminal size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
            <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
              {searchQuery ? 'No log entries match your search query.' : 'Console buffer is clear. Listening for events...'}
            </Typography>
          </Box>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            let badgeBg = 'rgba(255, 255, 255, 0.08)';
            let badgeColor = '#94a3b8';
            let textColor = '#e2e8f0';

            if (log.level === 'warn') {
              badgeBg = 'rgba(245, 158, 11, 0.15)';
              badgeColor = '#f59e0b';
              textColor = '#fde68a';
            } else if (log.level === 'error') {
              badgeBg = 'rgba(239, 68, 68, 0.18)';
              badgeColor = '#ef4444';
              textColor = '#fca5a5';
            } else if (log.level === 'success') {
              badgeBg = 'rgba(16, 185, 129, 0.15)';
              badgeColor = '#10b981';
              textColor = '#a7f3d0';
            }

            return (
              <Box
                key={log.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  py: 0.35,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.02)' },
                }}
              >
                {/* Timestamp */}
                <Typography
                  component="span"
                  sx={{
                    color: '#475569',
                    fontSize: '10.5px',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  {timeStr}
                </Typography>

                {/* Level Badge */}
                <Box
                  sx={{
                    px: 0.7,
                    py: 0.1,
                    borderRadius: '4px',
                    bgcolor: badgeBg,
                    color: badgeColor,
                    fontSize: '9.5px',
                    fontWeight: 700,
                    flexShrink: 0,
                    textTransform: 'uppercase',
                    userSelect: 'none',
                  }}
                >
                  {log.level}
                </Box>

                {/* Tag & Message */}
                <Box sx={{ flex: 1, wordBreak: 'break-word' }}>
                  {log.tag && log.tag !== 'APP' && log.tag !== 'SYSTEM' && (
                    <Typography
                      component="span"
                      sx={{
                        color: tokens.colors.primary,
                        fontWeight: 600,
                        mr: 1,
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                    >
                      [{log.tag}]
                    </Typography>
                  )}
                  <Typography
                    component="span"
                    sx={{
                      color: textColor,
                      fontSize: '11.5px',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {log.message}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
        <div ref={consoleEndRef} />
      </Box>
    </Box>
  );
};
export default SystemConsole;
