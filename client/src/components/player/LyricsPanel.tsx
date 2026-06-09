import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { 
  Mic2, 
  Save, 
  Edit3, 
  X, 
  Loader2, 
  Music, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  Play, 
  Pause, 
  Check, 
  Settings,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { useAudioEngine, timeStore } from '../../hooks/useAudioEngine';
import { tokens } from '../../theme/muiTheme';
import { api } from '../../utils/api';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';

interface LyricsPanelProps {
  onClose: () => void;
}

interface WordInfo {
  word: string;
  start: number; // absolute time in milliseconds
  end: number;   // absolute time in milliseconds
}

interface LrcLine {
  time: number; // seconds
  text: string;
  words?: WordInfo[];
}

interface SyncLine {
  text: string;
  time: number | null;
}

function extractColorsFromImage(url: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, 10, 10);
        const imgData = ctx.getImageData(0, 0, 10, 10).data;
        
        const colorCounts: { [key: string]: number } = {};
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i+1];
          const b = imgData[i+2];
          const a = imgData[i+3];
          if (a < 200) continue;
          
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (max + min) / 510;
          if (lum < 0.15 || lum > 0.85) continue;
          
          const roundR = Math.round(r / 20) * 20;
          const roundG = Math.round(g / 20) * 20;
          const roundB = Math.round(b / 20) * 20;
          const key = `${roundR},${roundG},${roundB}`;
          colorCounts[key] = (colorCounts[key] || 0) + 1;
        }
        
        const uniqueKeys = Object.keys(colorCounts);
        const sortedColors = uniqueKeys.map(key => {
          const [r, g, b] = key.split(',').map(Number);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          return { r, g, b, count: colorCounts[key], sat };
        });
        
        sortedColors.sort((a, b) => (b.sat * b.count) - (a.sat * a.count));
        
        const extracted: string[] = [];
        for (const col of sortedColors) {
          const isTooClose = extracted.some(existing => {
            const [exR, exG, exB] = existing.match(/\d+/g)!.map(Number);
            const dist = Math.sqrt(
              Math.pow(col.r - exR, 2) +
              Math.pow(col.g - exG, 2) +
              Math.pow(col.b - exB, 2)
            );
            return dist < 60;
          });
          if (!isTooClose) {
            extracted.push(`rgb(${col.r}, ${col.g}, ${col.b})`);
          }
          if (extracted.length >= 4) break;
        }
        
        const defaults = ['rgb(156, 39, 176)', 'rgb(0, 188, 212)', 'rgb(233, 30, 99)'];
        while (extracted.length < 3) {
          extracted.push(defaults[extracted.length]);
        }
        resolve(extracted);
      } catch (e) {
        console.error('Canvas color extraction error:', e);
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
  });
}

function parseLRC(lrc: string, estimateWordSync: boolean): LrcLine[] {
  // Try to parse as JSON first
  try {
    const trimmed = lrc.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const lines: LrcLine[] = [];
      const jsonLines = Array.isArray(parsed) ? parsed : (parsed.lines || []);
      
      for (const item of jsonLines) {
        const text = item.line || item.text || '';
        const startTimeMs = item.startTime !== undefined ? item.startTime : (item.start || item.time * 1000 || 0);
        
        const words: WordInfo[] = (item.words || []).map((w: any) => ({
          word: w.text || w.word || '',
          start: w.start !== undefined ? w.start : (w.startTime || 0),
          end: w.end !== undefined ? w.end : (w.endTime || 0)
        }));
        
        lines.push({
          time: startTimeMs / 1000,
          text,
          words: words.length > 0 ? words : undefined
        });
      }
      if (lines.length > 0) {
        return lines.sort((a, b) => a.time - b.time);
      }
    }
  } catch (e) {
    // Fallback to standard LRC parser
  }

  const lines: LrcLine[] = [];
  // Matches [MM:SS.xx], [MM:SS.xxx], [MM:SS], [M:SS], [H:MM:SS] etc. with optional spaces
  const lineRegex = /^\[\s*(\d+)\s*:\s*(\d+)\s*(?:[.:]\s*(\d+))?\s*\](.*)/;
  const rawLines = lrc.split('\n');
  const tempParsed: { lineTime: number; content: string }[] = [];

  for (const raw of rawLines) {
    const trimmedRaw = raw.trim();
    if (!trimmedRaw) continue;

    const match = trimmedRaw.match(lineRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msVal = match[3] ? match[3].padEnd(3, '0').substring(0, 3) : '000';
      const ms = parseInt(msVal, 10);
      const lineTime = (minutes * 60 + seconds) * 1000 + ms;
      const content = match[4].trim();
      if (content) {
        tempParsed.push({ lineTime, content });
      }
    }
  }

  tempParsed.sort((a, b) => a.lineTime - b.lineTime);

  for (let i = 0; i < tempParsed.length; i++) {
    const curr = tempParsed[i];
    const next = tempParsed[i + 1];
    const nextLineTime = next ? next.lineTime : curr.lineTime + 8000;
    // Matches any word tag like <MM:SS.xx>, <SS.xx>, <M:SS.xx> with optional spaces
    const wordTagRegex = /<\s*(?:(\d+)\s*:\s*)?(\d+)\s*(?:[.:]\s*(\d+))?\s*>/g;
    
    if (curr.content.includes('<')) {
      const words: WordInfo[] = [];
      const tags: { time: number; index: number; text: string }[] = [];
      let match;

      wordTagRegex.lastIndex = 0;
      while ((match = wordTagRegex.exec(curr.content)) !== null) {
        const tagMin = match[1] ? parseInt(match[1], 10) : 0;
        const tagSec = parseInt(match[2], 10);
        const tagMsVal = match[3] ? match[3].padEnd(3, '0').substring(0, 3) : '000';
        const tagMs = parseInt(tagMsVal, 10);
        const tagTime = (tagMin * 60 + tagSec) * 1000 + tagMs;
        tags.push({ time: tagTime, index: match.index, text: match[0] });
      }

      let lastIndex = 0;
      let lastTime = curr.lineTime;

      for (let j = 0; j < tags.length; j++) {
        const tag = tags[j];
        const wordText = curr.content.substring(lastIndex, tag.index).trim();
        if (wordText) {
          const subWords = wordText.split(/\s+/).filter(w => w.length > 0);
          if (subWords.length > 1) {
            const subDuration = tag.time - lastTime;
            const subWordWeights = subWords.map(w => 150 + w.length * 50);
            const totalSubWeight = subWordWeights.reduce((sum, w) => sum + w, 0) || 1;
            
            let runningSubTime = lastTime;
            for (let k = 0; k < subWords.length; k++) {
              const sw = subWords[k];
              const swWeight = subWordWeights[k];
              const swDuration = (swWeight / totalSubWeight) * subDuration;
              words.push({
                word: sw,
                start: runningSubTime,
                end: runningSubTime + swDuration
              });
              runningSubTime += swDuration;
            }
          } else {
            words.push({
              word: wordText,
              start: lastTime,
              end: tag.time
            });
          }
        }
        lastTime = tag.time;
        lastIndex = tag.index + tag.text.length;
      }

      const finalWordText = curr.content.substring(lastIndex).trim();
      if (finalWordText) {
        const maxFinalWordDuration = Math.min(nextLineTime - lastTime, Math.max(350, finalWordText.length * 70));
        const subWords = finalWordText.split(/\s+/).filter(w => w.length > 0);
        if (subWords.length > 1) {
          const subWordWeights = subWords.map(w => 150 + w.length * 50);
          const totalSubWeight = subWordWeights.reduce((sum, w) => sum + w, 0) || 1;
          
          let runningSubTime = lastTime;
          for (let k = 0; k < subWords.length; k++) {
            const sw = subWords[k];
            const swWeight = subWordWeights[k];
            const swDuration = (swWeight / totalSubWeight) * maxFinalWordDuration;
            words.push({
              word: sw,
              start: runningSubTime,
              end: runningSubTime + swDuration
            });
            runningSubTime += swDuration;
          }
        } else {
          words.push({
            word: finalWordText,
            start: lastTime,
            end: lastTime + maxFinalWordDuration
          });
        }
      }

      for (let j = 0; j < words.length; j++) {
        const w = words[j];
        const nextW = words[j + 1];
        if (w.end <= w.start) {
          w.end = nextW ? nextW.start : nextLineTime;
        }
      }

      const cleanText = curr.content.replace(wordTagRegex, ' ').replace(/\s+/g, ' ').trim();
      lines.push({
        time: curr.lineTime / 1000,
        text: cleanText,
        words: words.length > 0 ? words : undefined
      });
    } else {
      if (estimateWordSync) {
        const wordsArray = curr.content.split(/\s+/).filter(w => w.length > 0);
        const totalChars = curr.content.replace(/\s+/g, '').length || 1;
        const lineDuration = nextLineTime - curr.lineTime;
        
        // Calculate dynamic vocal speed per character and word based on characters per second
        const rawCharsPerSec = totalChars / (lineDuration / 1000 || 1);
        let msPerChar = 35;
        let msPerWord = 220;

        if (rawCharsPerSec > 12) {
          // Super fast (e.g. rapid rap/singing)
          msPerChar = 18;
          msPerWord = 120;
        } else if (rawCharsPerSec > 8) {
          // Fast (e.g. upbeat pop/rock)
          msPerChar = 25;
          msPerWord = 160;
        } else if (rawCharsPerSec < 4) {
          // Very slow / drawn out vocals
          msPerChar = 50;
          msPerWord = 300;
        }

        const vocalDuration = wordsArray.length * msPerWord + totalChars * msPerChar;
        const minSingingFloor = Math.min(lineDuration, wordsArray.length * 150);
        const estimatedSingingDuration = Math.min(
          lineDuration,
          Math.max(minSingingFloor, vocalDuration)
        );
        
        // Adjust timing weights depending on characters-per-second density
        let baseWeight = 180;
        let charWeight = 40;
        
        if (rawCharsPerSec > 12) {
          baseWeight = 240;
          charWeight = 10;
        } else if (rawCharsPerSec > 8) {
          baseWeight = 200;
          charWeight = 25;
        } else if (rawCharsPerSec < 4) {
          baseWeight = 100;
          charWeight = 60;
        }
        
        const wordWeights = wordsArray.map(w => baseWeight + w.length * charWeight);
        const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0) || 1;
        
        let runningTime = curr.lineTime;
        const words: WordInfo[] = [];

        for (let j = 0; j < wordsArray.length; j++) {
          const word = wordsArray[j];
          const weight = wordWeights[j];
          const wordDuration = (weight / totalWeight) * estimatedSingingDuration;
          const wordEnd = runningTime + wordDuration;
          
          words.push({
            word,
            start: runningTime,
            end: wordEnd
          });
          runningTime = wordEnd;
        }

        lines.push({
          time: curr.lineTime / 1000,
          text: curr.content,
          words
        });
      } else {
        lines.push({
          time: curr.lineTime / 1000,
          text: curr.content,
          words: undefined
        });
      }
    }
  }

  return lines;
}

function formatLrcTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 100);
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]`;
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playbackSpeed = usePlayerStore(state => state.playbackSpeed);
  const setPlaying = usePlayerStore(state => state.setPlaying);
  const { saveTrack } = useLibraryDB();
  const { seek } = useAudioEngine();

  const duration = currentTrack?.duration || 0;

  const [rawLrcText, setRawLrcText] = useState('');
  const [syncOffset, setSyncOffset] = useState(() => {
    const val = localStorage.getItem('lyrics_sync_offset');
    return val ? parseInt(val, 10) : 80; // default to 80ms
  });
  const [estimateWordSync, setEstimateWordSync] = useState(() => {
    return localStorage.getItem('lyrics_estimate_word_sync') === 'true'; // default to false (line-by-line is 100% accurate for standard LRC)
  });

  useEffect(() => {
    localStorage.setItem('lyrics_sync_offset', syncOffset.toString());
  }, [syncOffset]);

  useEffect(() => {
    localStorage.setItem('lyrics_estimate_word_sync', estimateWordSync.toString());
  }, [estimateWordSync]);

  const syncedLines = useMemo(() => {
    return parseLRC(rawLrcText, estimateWordSync);
  }, [rawLrcText, estimateWordSync]);

  const hasNativeWordTags = useMemo(() => {
    return rawLrcText.includes('<') && /<(?:(\d+):)?(\d+)(?:\s*[.:]\s*(\d+))?\s*>/.test(rawLrcText);
  }, [rawLrcText]);

  const [plainLyrics, setPlainLyrics] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLyrics, setHasLyrics] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(26); // px

  // Real-time album cover ambient colors state
  const [ambientColors, setAmbientColors] = useState<string[]>([
    'rgb(156, 39, 176)', // default purple
    'rgb(0, 188, 212)',   // default cyan
    'rgb(233, 30, 99)'    // default pink
  ]);

  // Dynamic ambient color extractor
  useEffect(() => {
    if (currentTrack?.coverArtUrl) {
      const fullUrl = currentTrack.coverArtUrl.startsWith('http')
        ? currentTrack.coverArtUrl
        : `${api.baseUrl}${currentTrack.coverArtUrl}`;
      
      const proxyUrl = `${api.baseUrl}/api/proxy-image?url=${encodeURIComponent(fullUrl)}`;
      
      extractColorsFromImage(proxyUrl).then(colors => {
        if (colors && colors.length >= 3) {
          setAmbientColors(colors);
        }
      });
    }
  }, [currentTrack?.coverArtUrl]);

  // LRC Sync Creator State
  const [isSyncMode, setIsSyncMode] = useState(false);
  const [syncLines, setSyncLines] = useState<SyncLine[]>([]);
  const [syncIndex, setSyncIndex] = useState(0);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const fullLyricsContainerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const syncContainerRef = useRef<HTMLDivElement>(null);
  
  const activeLineRef = useRef<HTMLDivElement>(null);
  const activeFullLineRef = useRef<HTMLDivElement>(null);
  const syncActiveLineRef = useRef<HTMLDivElement>(null);
  
  const lastTrackIdRef = useRef<string | null>(null);

  // Throttled active line index state (updated from RAF loop only on change)
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const activeLineIndexRef = useRef(-1);

  // Time tracking refs for RAF loop
  const lastTimeRef = useRef(0);
  const lastPerfRef = useRef(performance.now());

  // Center active line using GSAP smooth scroll in side panel
  useEffect(() => {
    if (!isFullscreen && !isSyncMode && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const activeLine = container.querySelector('.lyrics-line.active') as HTMLElement;
      
      if (activeLine) {
        const containerHeight = container.clientHeight;
        const lineTop = activeLine.offsetTop;
        const lineHeight = activeLine.clientHeight;
        const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2;
        
        gsap.to(container, {
          scrollTop: Math.max(0, scrollTarget),
          duration: 0.65,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      }
    }
  }, [activeLineIndex, isFullscreen, isSyncMode]);

  // Center active line using GSAP smooth scroll in fullscreen mode
  useEffect(() => {
    if (isFullscreen && !isSyncMode && fullLyricsContainerRef.current) {
      const container = fullLyricsContainerRef.current;
      const activeLine = container.querySelector('.lyrics-line.active-line') as HTMLElement;
      
      if (activeLine) {
        const containerHeight = container.clientHeight;
        const lineTop = activeLine.offsetTop;
        const lineHeight = activeLine.clientHeight;
        
        // Centering calculation
        const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2;
        
        gsap.to(container, {
          scrollTop: Math.max(0, scrollTarget),
          duration: 0.9,
          ease: 'power4.out', // Custom exponential easeOut curve for weighted fluid scrolls
          overwrite: 'auto'
        });
      }
    }
  }, [activeLineIndex, isFullscreen, isSyncMode]);

  // Auto-scroll to current sync line in creator mode
  useEffect(() => {
    if (isSyncMode && syncActiveLineRef.current && syncContainerRef.current) {
      const container = syncContainerRef.current;
      const activeLine = syncActiveLineRef.current;
      const containerHeight = container.clientHeight;
      const lineTop = activeLine.offsetTop;
      const lineHeight = activeLine.clientHeight;
      const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [syncIndex, isSyncMode]);

  // Word highlighting and active line calculation loop driven by requestAnimationFrame
  useEffect(() => {
    let rafId: number;
    let lastTimeVal = timeStore.getCurrentTime();
    let lastPerfVal = performance.now();

    const tick = () => {
      // Skip expensive DOM work when tab is hidden — saves significant CPU in background
      if (document.hidden) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rawTime = timeStore.getCurrentTime();
      const now = performance.now();
      
      if (rawTime !== lastTimeVal) {
        lastTimeVal = rawTime;
        lastPerfVal = now;
      }
      
      const elapsed = isPlaying ? (now - lastPerfVal) / 1000 : 0;
      const smoothTime = rawTime + elapsed * playbackSpeed;
      // Add visual anticipation offset from user settings (aligns visual wipe with physical hardware latency)
      const timeMs = smoothTime * 1000 + syncOffset;

      // 1. Update active line index
      let newActiveIdx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (syncedLines[i].time * 1000 <= timeMs) {
          newActiveIdx = i;
        } else {
          break;
        }
      }

      if (newActiveIdx !== activeLineIndexRef.current) {
        activeLineIndexRef.current = newActiveIdx;
        setActiveLineIndex(newActiveIdx);

        // Bulk DOM updates for all lyric lines (handles seeking and instant snapping)
        const allLines = document.querySelectorAll('.lyrics-line[data-line-index]');
        allLines.forEach(el => {
          const lineIdx = parseInt(el.getAttribute('data-line-index') || '-1', 10);
          if (lineIdx < newActiveIdx) {
            el.classList.add('completed');
            el.classList.remove('active', 'active-line');
            
            const words = el.querySelectorAll('.karaoke-word');
            words.forEach(w => {
              w.classList.add('completed');
              w.classList.remove('active');
              (w as HTMLElement).style.setProperty('--word-progress', '100%');
            });
          } else if (lineIdx > newActiveIdx) {
            el.classList.remove('completed', 'active', 'active-line');
            
            const words = el.querySelectorAll('.karaoke-word');
            words.forEach(w => {
              w.classList.remove('completed', 'active');
              (w as HTMLElement).style.setProperty('--word-progress', '0%');
            });
          } else if (lineIdx === newActiveIdx) {
            el.classList.add('active', 'active-line');
            el.classList.remove('completed');
          }
        });
      }

      // 2. Animate the active line's words only (frame-perfect progressive highlights without O(N) DOM search overhead)
      const activeWords = document.querySelectorAll('.lyrics-line.active-line .karaoke-word');
      activeWords.forEach(wordEl => {
        const start = parseFloat(wordEl.getAttribute('data-start') || '0');
        const end = parseFloat(wordEl.getAttribute('data-end') || '0');
        const htmlEl = wordEl as HTMLElement;
        
        if (timeMs >= start && timeMs <= end) {
          const progress = Math.min(100, Math.max(0, ((timeMs - start) / (end - start)) * 100));
          htmlEl.style.setProperty('--word-progress', `${progress}%`);
          if (!wordEl.classList.contains('active')) {
            wordEl.classList.add('active');
            wordEl.classList.remove('completed');
          }
        } else if (timeMs > end) {
          htmlEl.style.setProperty('--word-progress', '100%');
          if (!wordEl.classList.contains('completed')) {
            wordEl.classList.add('completed');
            wordEl.classList.remove('active');
          }
        } else {
          htmlEl.style.setProperty('--word-progress', '0%');
          if (wordEl.classList.contains('active') || wordEl.classList.contains('completed')) {
            wordEl.classList.remove('active', 'completed');
          }
        }
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, syncedLines, playbackSpeed]);

  // Fetch lyrics when track changes
  const fetchLyrics = useCallback(async () => {
    if (!currentTrack) return;
    if (lastTrackIdRef.current === currentTrack.id) return;
    lastTrackIdRef.current = currentTrack.id;

    setRawLrcText('');
    setPlainLyrics('');
    setHasLyrics(false);
    setFetchError(false);
    setIsEditing(false);
    setIsSyncMode(false);
    setLoading(true);
    activeLineIndexRef.current = -1;
    setActiveLineIndex(-1);

    const manualLyrics = (currentTrack as any).lyrics;
    if (manualLyrics) {
      if (manualLyrics.includes('[00:')) {
        setRawLrcText(manualLyrics);
      }
      setPlainLyrics(manualLyrics.replace(/\[\d+:\d+\.\d+\]/g, ''));
      setHasLyrics(true);
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        track: currentTrack.title,
        artist: currentTrack.artist,
      });
      if (currentTrack.album && currentTrack.album !== 'Single' && currentTrack.album !== 'YouTube') {
        params.set('album', currentTrack.album);
      }
      if (currentTrack.duration > 0) {
        params.set('duration', currentTrack.duration.toString());
      }

      const res = await fetch(`${api.baseUrl}/api/lyrics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let loadedSynced = false;
        
        if (data.syncedLyrics) {
          setRawLrcText(data.syncedLyrics);
          setPlainLyrics(data.plainLyrics || data.syncedLyrics.replace(/\[\d+:\d+\.\d+\]/g, ''));
          setHasLyrics(true);
          loadedSynced = true;
        }
        
        if (!loadedSynced && data.plainLyrics) {
          setPlainLyrics(data.plainLyrics);
          setHasLyrics(true);
        }
      } else {
        setFetchError(true);
      }
    } catch (e) {
      console.error('Lyrics fetch error:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    fetchLyrics();
  }, [fetchLyrics]);

  const handleRetry = () => {
    lastTrackIdRef.current = null;
    fetchLyrics();
  };

  const handleStartEdit = () => {
    setEditText(plainLyrics);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, lyrics: editText };
    await saveTrack(updatedTrack);
    
    // Notify server to save in permanent cache
    try {
      await fetch(`${api.baseUrl}/api/lyrics/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: currentTrack.title,
          artist: currentTrack.artist,
          plainLyrics: editText,
          albumName: currentTrack.album,
          duration: currentTrack.duration
        })
      });
    } catch (e) {
      console.error('Server save error:', e);
    }

    usePlayerStore.setState({ currentTrack: updatedTrack });
    setPlainLyrics(editText);
    
    if (editText.includes('[00:')) {
      setRawLrcText(editText);
    } else {
      setRawLrcText('');
    }

    setHasLyrics(!!editText);
    setIsEditing(false);
  };

  const handleLineClick = (time: number) => {
    seek(time);
  };

  // --- LRC Sync Creator Logic ---

  const startLyricsSync = () => {
    // Split lyrics by line and clean up
    const lines = plainLyrics
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const syncItems = lines.map(line => ({ text: line, time: null as number | null }));
    setSyncLines(syncItems);
    setSyncIndex(0);
    setIsSyncMode(true);
    setIsFullscreen(true); // Always sync in full screen for immersive feedback
  };

  const syncCurrentLine = () => {
    if (syncIndex >= syncLines.length) return;
    
    const updated = [...syncLines];
    updated[syncIndex].time = timeStore.getCurrentTime();
    setSyncLines(updated);
    setSyncIndex(prev => prev + 1);
  };

  const undoLastSync = () => {
    if (syncIndex === 0) return;
    const prevIdx = syncIndex - 1;
    const updated = [...syncLines];
    updated[prevIdx].time = null;
    setSyncLines(updated);
    setSyncIndex(prevIdx);
  };

  const skipCurrentLine = () => {
    if (syncIndex >= syncLines.length) return;
    setSyncIndex(prev => prev + 1);
  };

  const resetSync = () => {
    const resetLines = syncLines.map(l => ({ ...l, time: null }));
    setSyncLines(resetLines);
    setSyncIndex(0);
  };

  const saveSyncedLyrics = async () => {
    if (!currentTrack) return;

    // Filter out lines that don't have a timestamp
    const timestampedLines = syncLines.filter(l => l.time !== null);
    if (timestampedLines.length === 0) {
      alert('Sync at least one line before saving.');
      return;
    }

    // Compile into standard LRC format
    const lrcString = syncLines
      .map(l => (l.time !== null ? `${formatLrcTime(l.time)}${l.text}` : l.text))
      .join('\n');

    const updatedTrack = { ...currentTrack, lyrics: lrcString };
    await saveTrack(updatedTrack);

    // Save permanently on server disk cache
    try {
      await fetch(`${api.baseUrl}/api/lyrics/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: currentTrack.title,
          artist: currentTrack.artist,
          syncedLyrics: lrcString,
          plainLyrics: plainLyrics,
          albumName: currentTrack.album,
          duration: currentTrack.duration
        })
      });
    } catch (e) {
      console.error('Server save synced error:', e);
    }

    usePlayerStore.setState({ currentTrack: updatedTrack });
    setRawLrcText(lrcString);
    setIsSyncMode(false);
    setIsFullscreen(false);
  };

  // Listen to keyboard Space/Enter to sync lines in sync mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSyncMode) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        syncCurrentLine();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastSync();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSyncMode, syncIndex, syncLines]);

  return (
    <>
      {/* Side-Panel View Mode */}
      {!isFullscreen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-80 h-full glass-heavy flex flex-col py-6 px-4 text-white shrink-0 z-40 border-l border-white/10"
        >
          <div className="flex flex-col gap-5 h-full overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center px-2 shrink-0">
              <div className="flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-white" />
                <h3 className="text-sm font-semibold tracking-wide">Lyrics</h3>
                {syncedLines.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                    Synced
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconButton onClick={() => setIsFullscreen(true)} size="small" sx={{ color: 'neutral.400' }} title="Full Screen View">
                  <Maximize2 size={14} />
                </IconButton>
                <IconButton onClick={onClose} size="small" sx={{ color: 'neutral.400' }}>
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            {currentTrack ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden pt-2">
                {/* Song Meta */}
                <div className="px-2 shrink-0">
                  <h4 className="text-xs font-semibold truncate">{currentTrack.title}</h4>
                  <p className="text-[10px] text-neutral-400 truncate mt-0.5">{currentTrack.artist}</p>
                </div>

                {/* Loading State */}
                {loading && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                    <span className="text-xs text-neutral-500">Searching for lyrics...</span>
                  </div>
                )}

                {/* Editor Mode */}
                {isEditing && !loading && (
                  <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-fade-in">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="Paste or write lyrics here..."
                      className="w-full flex-1 p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-700 text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none font-sans leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-medium text-xs transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Synced Lyrics Display */}
                {!loading && !isEditing && syncedLines.length > 0 && (
                  <div
                    ref={lyricsContainerRef}
                    className="flex-1 overflow-y-auto px-2 scroll-smooth relative no-scrollbar"
                  >
                    <div className="h-32" />
                    {syncedLines.map((line, idx) => {
                      const isActive = idx === activeLineIndex;
                      return (
                        <div
                          key={idx}
                          ref={isActive ? activeLineRef : undefined}
                          onClick={() => handleLineClick(line.time)}
                          data-line-index={idx}
                          className={`lyrics-line py-2.5 px-2 cursor-pointer rounded-lg transition-all duration-300 relative ${
                            isActive
                              ? 'active active-line text-white text-base font-bold bg-white/5 shadow-sm'
                              : 'text-neutral-400 hover:text-white text-sm font-medium opacity-60'
                          }`}
                          style={{ fontSize: isActive ? `${fontSize}px` : `${fontSize - 2}px` }}
                        >
                          {line.words && line.words.length > 0 ? (
                            <span className="inline-block transition-all duration-300">
                              {line.words.map((wordInfo, wIdx) => (
                                <React.Fragment key={wIdx}>
                                  <span
                                    className="karaoke-word"
                                    data-start={wordInfo.start}
                                    data-end={wordInfo.end}
                                  >
                                    {wordInfo.word}
                                  </span>
                                  {wIdx < line.words!.length - 1 && ' '}
                                </React.Fragment>
                              ))}
                            </span>
                          ) : (
                            line.text
                          )}
                        </div>
                      );
                    })}
                    <div className="h-40" />
                  </div>
                )}

                {/* Plain Lyrics Display (no sync) */}
                {!loading && !isEditing && syncedLines.length === 0 && hasLyrics && plainLyrics && (
                  <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-2 text-[13px] leading-[1.8] text-neutral-300 font-sans whitespace-pre-wrap">
                      {plainLyrics}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={startLyricsSync}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-semibold text-xs transition-all shadow-md"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Sync Lyrics (LRC Creator)
                      </button>
                      <button
                        onClick={handleStartEdit}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700 font-semibold text-xs transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Lyrics Text
                      </button>
                    </div>
                  </div>
                )}

                {/* No Lyrics Found State */}
                {!loading && !isEditing && !hasLyrics && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-4 animate-fade-in">
                    <div className="w-14 h-14 rounded-full bg-neutral-800/60 border border-neutral-700 flex items-center justify-center">
                      <Music className="w-7 h-7 text-neutral-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-400 mb-1">No lyrics found</p>
                      <p className="text-[10px] text-neutral-600 leading-relaxed">
                        We couldn't find lyrics for this track. You can add them manually or try again.
                      </p>
                    </div>
                    <div className="flex gap-2 w-full">
                      {fetchError && (
                        <button
                          onClick={handleRetry}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-medium transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                      <button
                        onClick={handleStartEdit}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-medium transition-all"
                      >
                        <Edit3 className="w-3 h-3" />
                        Add Manually
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center py-20 text-xs text-neutral-500 italic animate-fade-in">
                Select a track to view lyrics
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Full-Screen Immersive Karaoke / Sync Creator Mode */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
          >
            {/* Immersive blurred cover art and floating fluid blobs backdrop */}
            {currentTrack?.coverArtUrl && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                {/* Base cover art blur */}
                <div
                  className="absolute inset-0 bg-cover bg-center animate-rotate-ambient"
                  style={{
                    backgroundImage: `url(${currentTrack.coverArtUrl})`,
                    filter: 'blur(110px) saturate(2.2) brightness(0.22)',
                  }}
                />
                {/* Floating liquid primary blob */}
                <div
                  className="absolute w-[80vw] h-[80vw] rounded-full mix-blend-screen opacity-[0.35] filter blur-[120px] animate-float-blob-1"
                  style={{
                    background: `radial-gradient(circle, ${ambientColors[0]} 0%, transparent 70%)`,
                    top: '-20%',
                    left: '-20%',
                  }}
                />
                {/* Floating liquid cyan blob */}
                <div
                  className="absolute w-[70vw] h-[70vw] rounded-full mix-blend-screen opacity-[0.3] filter blur-[100px] animate-float-blob-2"
                  style={{
                    background: `radial-gradient(circle, ${ambientColors[1]} 0%, transparent 70%)`,
                    bottom: '-10%',
                    right: '-10%',
                  }}
                />
                {/* Floating liquid pink blob */}
                <div
                  className="absolute w-[65vw] h-[65vw] rounded-full mix-blend-screen opacity-[0.25] filter blur-[110px] animate-float-blob-3"
                  style={{
                    background: `radial-gradient(circle, ${ambientColors[2]} 0%, transparent 70%)`,
                    top: '30%',
                    left: '40%',
                  }}
                />
              </div>
            )}

            {/* Header / controls bar */}
            <div className="relative z-10 flex justify-between items-center px-8 py-6 border-b border-white/5 backdrop-blur-md bg-black/30">
              <div className="flex items-center gap-4">
                {currentTrack?.coverArtUrl && (
                  <img
                    src={currentTrack.coverArtUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover shadow-lg animate-[spin_20s_linear_infinite]"
                    style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                  />
                )}
                <div>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{currentTrack?.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'neutral.400' }}>{currentTrack?.artist}</Typography>
                </div>
              </div>

              {/* Central mode indicators */}
              {isSyncMode && (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                  <span>Lyrics Sync Creator Mode</span>
                </div>
              )}

              {/* Central Settings Controls */}
              {!isSyncMode && (
                <div className="flex items-center gap-6">
                  {/* Font Size Controls */}
                  <div className="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                    <Tooltip title="Decrease Text Size">
                      <IconButton onClick={() => setFontSize(prev => Math.max(16, prev - 2))} size="small" sx={{ color: 'white', p: 0.5 }}>
                        <ZoomOut size={15} />
                      </IconButton>
                    </Tooltip>
                    <Typography variant="caption" sx={{ color: 'neutral.300', fontWeight: 600, minWidth: 36, textAlign: 'center', fontSize: 11 }}>
                      {fontSize}px
                    </Typography>
                    <Tooltip title="Increase Text Size">
                      <IconButton onClick={() => setFontSize(prev => Math.min(40, prev + 2))} size="small" sx={{ color: 'white', p: 0.5 }}>
                        <ZoomIn size={15} />
                      </IconButton>
                    </Tooltip>
                  </div>

                  {/* Sync Offset Controls */}
                  <div className="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                    <Tooltip title="Shift Highlights Earlier">
                      <button 
                        onClick={() => setSyncOffset(prev => Math.max(-400, prev - 10))} 
                        className="text-white hover:text-neutral-300 font-bold px-1.5 py-0.5 rounded hover:bg-white/10 text-xs transition-colors"
                      >
                        -10ms
                      </button>
                    </Tooltip>
                    <Typography variant="caption" sx={{ color: 'neutral.300', fontWeight: 600, minWidth: 84, textAlign: 'center', fontSize: 11 }}>
                      Offset: {syncOffset >= 0 ? `+${syncOffset}` : syncOffset}ms
                    </Typography>
                    <Tooltip title="Shift Highlights Later">
                      <button 
                        onClick={() => setSyncOffset(prev => Math.min(400, prev + 10))} 
                        className="text-white hover:text-neutral-300 font-bold px-1.5 py-0.5 rounded hover:bg-white/10 text-xs transition-colors"
                      >
                        +10ms
                      </button>
                    </Tooltip>
                  </div>

                  {/* Word Sync Toggle (only show if song has no native word tags) */}
                  {!hasNativeWordTags && (
                    <button
                      onClick={() => setEstimateWordSync(prev => !prev)}
                      className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
                        estimateWordSync
                          ? 'bg-white text-black border-white hover:bg-neutral-200'
                          : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {estimateWordSync ? 'Word Sync: Estimated' : 'Word Sync: Line Only'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <IconButton onClick={() => { setIsFullscreen(false); setIsSyncMode(false); }} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                  <Minimize2 size={18} />
                </IconButton>
                <IconButton onClick={() => { setIsFullscreen(false); setIsSyncMode(false); onClose(); }} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                  <X size={18} />
                </IconButton>
              </div>
            </div>

            {/* Immersive Lyrics Scrolling View */}
            {!isSyncMode && (
              <div
                ref={fullLyricsContainerRef}
                className="relative z-10 flex-1 overflow-y-auto px-6 md:px-24 py-10 mask-fade-gradient bg-transparent no-scrollbar"
              >
                <div
                  ref={scrollWrapperRef}
                  className="w-full"
                >
                  <div style={{ height: '35vh' }} />
                  {syncedLines.length > 0 ? (
                    syncedLines.map((line, idx) => {
                      const isActive = idx === activeLineIndex;
                      return (
                        <motion.div
                          key={idx}
                          ref={isActive ? activeFullLineRef : undefined}
                          onClick={() => handleLineClick(line.time)}
                          data-line-index={idx}
                          className={`lyrics-line py-4 px-8 cursor-pointer transition-all duration-500 text-center select-none my-6 flex items-center justify-center origin-center ${
                            isActive ? 'active active-line' : ''
                          }`}
                          style={{
                            fontSize: isActive ? `${fontSize + 22}px` : `${fontSize + 8}px`,
                            lineHeight: 1.4,
                            opacity: isActive ? 1.0 : 0.40,
                            filter: isActive ? 'blur(0px) drop-shadow(0 0 12px rgba(255,255,255,0.45))' : 'blur(1.5px)',
                            transform: isActive ? 'scale(1.05)' : 'scale(0.93)',
                            color: 'white',
                            fontWeight: isActive ? 900 : 700,
                            letterSpacing: isActive ? '0.02em' : 'normal'
                          }}
                        >
                          {line.words && line.words.length > 0 ? (
                            <span className="inline-block transition-all duration-300">
                              {line.words.map((wordInfo, wIdx) => (
                                <React.Fragment key={wIdx}>
                                  <span
                                    className="karaoke-word"
                                    data-start={wordInfo.start}
                                    data-end={wordInfo.end}
                                  >
                                    {wordInfo.word}
                                  </span>
                                  {wIdx < line.words!.length - 1 && ' '}
                                </React.Fragment>
                              ))}
                            </span>
                          ) : (
                            line.text
                          )}
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="text-center text-neutral-400 font-semibold mt-20">
                      {loading ? 'Fetching lyrics...' : plainLyrics || 'No synced lyrics available for this track.'}
                    </div>
                  )}
                  <div style={{ height: '35vh' }} />
                </div>
              </div>
            )}

            {/* LRC Sync Creator Active Panel */}
            {isSyncMode && (
              <div className="relative z-10 flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left side: Timeline list of lyrics */}
                <div 
                  ref={syncContainerRef}
                  className="flex-1 overflow-y-auto px-6 md:px-12 py-10 scroll-smooth border-r border-white/5"
                >
                  <div className="h-48" />
                  {syncLines.map((line, idx) => {
                    const isSynced = line.time !== null;
                    const isCurrent = idx === syncIndex;
                    return (
                      <div
                        key={idx}
                        ref={isCurrent ? syncActiveLineRef : undefined}
                        className={`py-3.5 px-6 my-2 rounded-xl transition-all duration-300 flex justify-between items-center ${
                          isCurrent
                            ? 'bg-red-500/20 text-white font-extrabold border border-red-500/30 scale-102'
                            : isSynced
                              ? 'text-neutral-400 font-medium opacity-50 bg-emerald-500/5'
                              : 'text-neutral-500 font-normal opacity-30'
                        }`}
                      >
                        <span className="text-sm md:text-base">{line.text}</span>
                        {isSynced && (
                          <span className="text-xs font-mono bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {formatLrcTime(line.time!).replace('[', '').replace(']', '')}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider animate-pulse">
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="h-64" />
                </div>

                {/* Right side: Control buttons */}
                <div className="w-full md:w-80 p-6 flex flex-col justify-center gap-4 bg-black/40 backdrop-blur-md shrink-0">
                  <div className="text-center mb-6">
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
                      Interactive Sync
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'neutral-400', display: 'block', mt: 1 }}>
                      Press <strong>Space</strong> or <strong>Enter</strong> to sync the active line when it is sung.
                    </Typography>
                  </div>

                  {/* Playback indicator */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono">
                    <span className="text-neutral-400">Audio Track:</span>
                    <button 
                      onClick={() => setPlaying(!isPlaying)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white text-black font-semibold hover:bg-neutral-200 transition-all text-[11px]"
                    >
                      {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                  </div>

                  <button
                    onClick={syncCurrentLine}
                    className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm transition-all shadow-lg shadow-red-600/20 active:scale-97"
                  >
                    Sync Current Line (Space)
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={undoLastSync}
                      disabled={syncIndex === 0}
                      className="flex-1 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Undo (Ctrl+Z)
                    </button>
                    <button
                      onClick={skipCurrentLine}
                      disabled={syncIndex >= syncLines.length}
                      className="flex-1 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-semibold transition-colors disabled:opacity-30"
                    >
                      Skip Line
                    </button>
                  </div>

                  <hr className="border-white/5 my-2" />

                  <button
                    onClick={saveSyncedLyrics}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg active:scale-97"
                  >
                    Save & Apply Synced LRC
                  </button>
                  
                  <button
                    onClick={resetSync}
                    className="w-full py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white text-xs font-semibold transition-colors"
                  >
                    Reset Timestamps
                  </button>

                  <button
                    onClick={() => { setIsSyncMode(false); setIsFullscreen(false); }}
                    className="w-full py-2.5 rounded-xl bg-neutral-900 border border-red-900/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors"
                  >
                    Exit Creator Mode
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LyricsPanel;
