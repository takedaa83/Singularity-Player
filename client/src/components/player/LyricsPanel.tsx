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
  Sparkles,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Star,
  MoreHorizontal,
  SkipForward,
  SkipBack,
  MessageSquare
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

interface WordCache {
  el: HTMLElement;
  start: number;
  end: number;
  effectiveEnd: number;
  state: 'pending' | 'active' | 'completed';
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
        
        const defaults = ['rgb(30, 30, 35)', 'rgb(15, 15, 20)', 'rgb(5, 5, 5)'];
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

function segmentText(text: string): string[] {
  const isCJK = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7a3]/.test(text);
  if (isCJK) {
    const matches = text.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7a3]|[a-zA-Z0-9']+/g);
    return matches ? matches.filter(w => w.trim().length > 0) : [];
  }
  return text.split(/\s+/).filter(w => w.length > 0);
}

function computeVocalPresence(
  dataArray: Uint8Array,
  sampleRate: number,
  fftSize: number
): number {
  const binWidth = sampleRate / fftSize; // Hz per bin
  
  const fundLow  = Math.max(1, Math.round(200 / binWidth));
  const fundHigh = Math.min(dataArray.length - 1, Math.round(800 / binWidth));
  const formLow  = fundHigh;
  const formHigh = Math.min(dataArray.length - 1, Math.round(3000 / binWidth));

  let fundSq = 0, formSq = 0;
  for (let i = fundLow;  i <= fundHigh; i++) { const v = dataArray[i] / 255; fundSq += v * v; }
  for (let i = formLow;  i <= formHigh; i++) { const v = dataArray[i] / 255; formSq += v * v; }

  const fundRms = Math.sqrt(fundSq / Math.max(1, fundHigh - fundLow + 1));
  const formRms = Math.sqrt(formSq / Math.max(1, formHigh - formLow + 1));

  return Math.min(1, fundRms * 0.35 + formRms * 0.75);
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
          const subWords = segmentText(wordText);
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
        const subWords = segmentText(finalWordText);
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
        const wordsArray = segmentText(curr.content);
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
        
        const wordWeights = wordsArray.map(w => {
          const vowelCount = (w.match(/[aeiouáéíóúàèìòùâêîôûäëïöü]/gi) || []).length;
          const consonantClusters = (w.match(/[^aeiouáéíóúàèìòùâêîôûäëïöü\s]{2,}/gi) || []).length;
          return baseWeight + vowelCount * 70 + w.length * charWeight - consonantClusters * 15;
        });
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

async function fetchiTunesCover(title: string, artist: string): Promise<string | null> {
  try {
    const cleanTitle = title.replace(/\(feat\..*?\)/i, '').replace(/\(ft\..*?\)/i, '').replace(/feat\..*/i, '').replace(/ft\..*/i, '').trim();
    const cleanArtist = artist.replace(/feat\..*/i, '').replace(/ft\..*/i, '').trim();
    const query = `${cleanArtist} ${cleanTitle}`;
    
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.results && json.results.length > 0) {
      const artworkUrl = json.results[0].artworkUrl100;
      if (artworkUrl) {
        return artworkUrl.replace('100x100bb.jpg', '800x800bb.jpg');
      }
    }
  } catch (e) {
    console.error('iTunes high quality cover search failed:', e);
  }
  return null;
}

interface LyricsPlayerControlsProps {
  currentTrack: any;
  isPlaying: boolean;
  setPlaying: (p: boolean) => void;
  favorites: string[];
  handleFavToggle: () => void;
  handleStartEdit: () => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  prevTrack: () => void;
  nextTrack: (f?: boolean) => void;
  repeat: 'off' | 'all' | 'one';
  handleRepeatClick: () => void;
  volume: number;
  setVolume: (v: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  wordHighlightEnabled: boolean;
  setWordHighlightEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  seek: (t: number) => void;
}

const LyricsPlayerControls: React.FC<LyricsPlayerControlsProps> = ({
  currentTrack,
  isPlaying,
  setPlaying,
  favorites,
  handleFavToggle,
  handleStartEdit,
  shuffle,
  toggleShuffle,
  prevTrack,
  nextTrack,
  repeat,
  handleRepeatClick,
  volume,
  setVolume,
  isMuted,
  toggleMute,
  wordHighlightEnabled,
  setWordHighlightEnabled,
  seek
}) => {
  const { currentTime, duration: liveDuration } = usePlaybackTime();
  const duration = currentTrack?.duration || liveDuration || 0;
  const remainingTime = duration - currentTime;
  const isFav = currentTrack ? favorites.includes(currentTrack.id) : false;

  const formatRemainingTime = (time: number) => {
    if (isNaN(time) || time < 0) return '-0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `-${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCurrentTime = (time: number) => {
    if (isNaN(time) || time < 0) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-[360px] flex flex-col gap-6">
      {/* Album Cover Art */}
      {currentTrack?.coverArtUrl ? (
        <img
          src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) || ''}
          alt={currentTrack.title}
          onError={(e) => {
            const target = e.currentTarget;
            if (currentTrack.videoId && target.src !== `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`) {
              target.src = `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
            }
          }}
          className="w-full aspect-square rounded-2xl object-cover shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/10"
        />
      ) : (
        <div className="w-full aspect-square rounded-2xl bg-neutral-900 border border-white/10 flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <Music className="w-20 h-20 text-neutral-700" />
        </div>
      )}

      {/* Metadata Row */}
      <div className="flex justify-between items-center mt-2 w-full">
        <div className="flex flex-col min-w-0 pr-4">
          <h2 className="text-xl font-bold tracking-tight truncate text-white">
            {currentTrack?.title}
          </h2>
          <p className="text-sm text-neutral-400 truncate mt-1">
            {currentTrack?.artist} {currentTrack?.album ? `— ${currentTrack.album}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFavToggle}
            className={`p-2 rounded-full transition-all active:scale-90 ${
              isFav ? 'text-primary' : 'text-neutral-400 hover:text-white'
            }`}
            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star className="w-5 h-5" fill={isFav ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleStartEdit}
            className="p-2 rounded-full text-neutral-400 hover:text-white transition-all active:scale-90"
            title="Edit Lyrics"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress Slider */}
      <div className="flex flex-col gap-2 w-full">
        <div className="relative group flex items-center h-4 w-full">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full h-1 rounded-full cursor-pointer appearance-none focus:outline-none"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${
                duration > 0 ? (currentTime / duration) * 100 : 0
              }%, rgba(255,255,255,0.15) ${
                duration > 0 ? (currentTime / duration) * 100 : 0
              }%, rgba(255,255,255,0.15) 100%)`
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400 font-mono select-none px-0.5">
          <span>{formatCurrentTime(currentTime)}</span>
          <span>{formatRemainingTime(remainingTime)}</span>
        </div>
      </div>

      {/* Playback Control Deck */}
      <div className="flex items-center justify-between px-2 w-full">
        <button
          onClick={toggleShuffle}
          className={`p-2 transition-colors active:scale-90 ${
            shuffle ? 'text-primary' : 'text-neutral-400 hover:text-white'
          }`}
          aria-label="Toggle Shuffle"
        >
          <Shuffle className="w-5 h-5" />
        </button>

        <button
          onClick={prevTrack}
          className="p-2 text-neutral-400 hover:text-white active:scale-80 transition-all"
          aria-label="Previous Track"
        >
          <SkipBack className="w-6 h-6 fill-current" />
        </button>

        <button
          onClick={() => setPlaying(!isPlaying)}
          className="p-4 rounded-full bg-white text-black active:scale-90 transition-all shadow-lg flex items-center justify-center hover:bg-neutral-100"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-black text-black" />
          ) : (
            <Play className="w-6 h-6 fill-black text-black ml-0.5" />
          )}
        </button>

        <button
          onClick={() => nextTrack(true)}
          className="p-2 text-neutral-400 hover:text-white active:scale-80 transition-all"
          aria-label="Next Track"
        >
          <SkipForward className="w-6 h-6 fill-current" />
        </button>

        <button
          onClick={handleRepeatClick}
          className={`p-2 transition-colors active:scale-90 ${
            repeat !== 'off' ? 'text-primary' : 'text-neutral-400 hover:text-white'
          }`}
          aria-label={`Toggle Repeat, currently ${repeat}`}
        >
          {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
        </button>
      </div>

      {/* Volume Slider */}
      <div className="flex items-center gap-3 px-1 w-full mt-2">
        <button
          onClick={toggleMute}
          className="text-neutral-400 hover:text-white transition-colors"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded-full cursor-pointer appearance-none"
          style={{
            background: `linear-gradient(to right, #fff 0%, #fff ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%, rgba(255,255,255,0.15) 100%)`
          }}
        />
      </div>

      {/* Highlight Mode Toggle Switcher */}
      <div className="flex justify-center mt-6 w-full">
        <button
          onClick={() => setWordHighlightEnabled(prev => !prev)}
          className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 text-xs font-semibold tracking-wide transition-all active:scale-95 shadow-md"
          title="Toggle between word-by-word and line-by-line highlights"
        >
          {wordHighlightEnabled ? 'Highlighting: Word-by-Word' : 'Highlighting: Line-by-Line'}
        </button>
      </div>
    </div>
  );
};

export const LyricsPanel: React.FC<LyricsPanelProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playbackSpeed = usePlayerStore(state => state.playbackSpeed);
  const setPlaying = usePlayerStore(state => state.setPlaying);
  const volume = usePlayerStore(state => state.volume);
  const shuffle = usePlayerStore(state => state.shuffle);
  const repeat = usePlayerStore(state => state.repeat);
  const isMuted = usePlayerStore(state => state.isMuted);
  const favorites = usePlayerStore(state => state.favorites);
  const isBuffering = usePlayerStore(state => state.isBuffering);

  const nextTrack = usePlayerStore(state => state.nextTrack);
  const prevTrack = usePlayerStore(state => state.prevTrack);
  const toggleShuffle = usePlayerStore(state => state.toggleShuffle);
  const setRepeat = usePlayerStore(state => state.setRepeat);
  const setVolume = usePlayerStore(state => state.setVolume);
  const toggleMute = usePlayerStore(state => state.toggleMute);

  const { saveTrack, toggleFavorite } = useLibraryDB();
  const { seek, getAnalyser } = useAudioEngine();

  const [rawLrcText, setRawLrcText] = useState('');
  const [syncOffset, setSyncOffset] = useState(() => {
    const stored = localStorage.getItem('lyrics_sync_offset');
    if (stored) return parseInt(stored, 10);
    const measured = usePlayerStore.getState().measuredAudioLatency;
    return measured > 0 ? measured : 80;
  });
  const [estimateWordSync, setEstimateWordSync] = useState(() => {
    return localStorage.getItem('lyrics_estimate_word_sync') === 'true'; // default to false (line-by-line is 100% accurate for standard LRC)
  });

  const measuredAudioLatency = usePlayerStore(state => state.measuredAudioLatency);

  useEffect(() => {
    localStorage.setItem('lyrics_sync_offset', syncOffset.toString());
  }, [syncOffset]);

  useEffect(() => {
    const stored = localStorage.getItem('lyrics_sync_offset');
    if (!stored && measuredAudioLatency > 0) {
      setSyncOffset(measuredAudioLatency);
    }
  }, [measuredAudioLatency]);

  useEffect(() => {
    localStorage.setItem('lyrics_estimate_word_sync', estimateWordSync.toString());
  }, [estimateWordSync]);

  const [wordHighlightEnabled, setWordHighlightEnabled] = useState(() => {
    return localStorage.getItem('lyrics_word_highlight_enabled') !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('lyrics_word_highlight_enabled', wordHighlightEnabled.toString());
  }, [wordHighlightEnabled]);

  const syncedLines = useMemo(() => {
    return parseLRC(rawLrcText, wordHighlightEnabled);
  }, [rawLrcText, wordHighlightEnabled]);

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

  // Body class to hide player bar when fullscreen lyrics are open
  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add('fullscreen-lyrics-active');
    } else {
      document.body.classList.remove('fullscreen-lyrics-active');
    }
    return () => {
      document.body.classList.remove('fullscreen-lyrics-active');
    };
  }, [isFullscreen]);

  // Fetch iTunes high quality cover art
  useEffect(() => {
    if (!currentTrack) return;
    
    if (currentTrack.coverArtUrl && currentTrack.coverArtUrl.includes('800x800bb.jpg')) {
      return;
    }
    
    fetchiTunesCover(currentTrack.title, currentTrack.artist).then((url) => {
      if (url) {
        usePlayerStore.setState((state) => {
          if (state.currentTrack && state.currentTrack.id === currentTrack.id) {
            return {
              currentTrack: {
                ...state.currentTrack,
                coverArtUrl: url
              }
            };
          }
          return {};
        });
      }
    });
  }, [currentTrack?.id]);

  // Real-time album cover ambient colors state
  const [ambientColors, setAmbientColors] = useState<string[]>([
    'rgb(30, 30, 35)',
    'rgb(15, 15, 20)',
    'rgb(5, 5, 5)'
  ]);

  // Dynamic ambient color extractor
  useEffect(() => {
    if (currentTrack?.coverArtUrl) {
      const fullUrl = api.coverUrl(currentTrack.coverArtUrl)!;
      const proxyUrl = `${api.baseUrl}/api/proxy-image?url=${encodeURIComponent(fullUrl)}`;
      
      extractColorsFromImage(proxyUrl).then(colors => {
        if (colors && colors.length >= 3) {
          setAmbientColors(colors);
        }
      });
    }
  }, [currentTrack?.coverArtUrl]);

  const handleFavToggle = async () => {
    if (currentTrack) {
      await toggleFavorite(currentTrack.id);
    }
  };

  const handleRepeatClick = () => {
    if (repeat === 'off') setRepeat('all');
    else if (repeat === 'all') setRepeat('one');
    else setRepeat('off');
  };

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
  
  const wordCacheRef = useRef<WordCache[]>([]);
  const analyserBufferRef = useRef<Uint8Array | null>(null);
  
  const lastTrackIdRef = useRef<string | null>(null);

  // Animated ambient pulsing background refs
  const ambientContainerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const blob3Ref = useRef<HTMLDivElement>(null);
  const smoothedBassRef = useRef(0);
  const wordEnergyRef = useRef(0);

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
          duration: 0.35,
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
          duration: 0.75,
          ease: 'power3.out',
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

    const tick = () => {
      // Skip expensive DOM work when tab is hidden — saves significant CPU in background
      if (document.hidden) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rawTime = timeStore.getCurrentTime();
      const stampedAt = timeStore.getStampedAt();
      const msSinceRead = performance.now() - stampedAt;

      // Interpolate forward from the exact moment currentTime was sampled
      const timeMs =
        rawTime * 1000
        + (isPlaying && !isBuffering ? msSinceRead * playbackSpeed : 0)
        + syncOffset;

      // ── Audio analysis & vocal presence detection ──
      const analyser = getAnalyser();
      let vocalPresence = 0;
      let dataArray: Uint8Array | null = null;
      if (analyser && isPlaying) {
        if (!analyserBufferRef.current || analyserBufferRef.current.length !== analyser.frequencyBinCount) {
          analyserBufferRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        dataArray = analyserBufferRef.current;
        analyser.getByteFrequencyData(dataArray as any);
        
        vocalPresence = computeVocalPresence(
          dataArray,
          48000,
          analyser.fftSize
        );
      }
      
      wordEnergyRef.current = wordEnergyRef.current * 0.5 + vocalPresence * 0.5;
      const energy = wordEnergyRef.current;
      const HOLD_THRESHOLD = 0.16;

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
              (w as HTMLElement).style.setProperty('--word-energy', '0');
            });
          } else if (lineIdx > newActiveIdx) {
            el.classList.remove('completed', 'active', 'active-line');
            
            const words = el.querySelectorAll('.karaoke-word');
            words.forEach(w => {
              w.classList.remove('completed', 'active');
              (w as HTMLElement).style.setProperty('--word-progress', '0%');
              (w as HTMLElement).style.setProperty('--word-energy', '0');
            });
          } else if (lineIdx === newActiveIdx) {
            el.classList.add('active', 'active-line');
            el.classList.remove('completed');
          }
        });

        // Pre-cache word timing data from React state instead of querySelector
        const newActiveLine = syncedLines[newActiveIdx];
        const lineEl = document.querySelector(`.lyrics-line.active-line`) || document.querySelector(`[data-line-index="${newActiveIdx}"]`);
        if (lineEl && newActiveLine?.words) {
          const wordEls = Array.from(lineEl.querySelectorAll('.karaoke-word')) as HTMLElement[];
          wordCacheRef.current = newActiveLine.words.map((w, i) => ({
            el: wordEls[i],
            start: w.start,
            end: w.end,
            effectiveEnd: w.end,
            state: 'pending' as const,
          }));
        } else {
          wordCacheRef.current = [];
        }
      }

      // 2. Animate the active line's words only (frame-perfect progressive highlights without O(N) DOM search overhead)
      if (wordCacheRef.current.length === 0 && newActiveIdx !== -1) {
        const newActiveLine = syncedLines[newActiveIdx];
        const lineEl = document.querySelector(`.lyrics-line.active-line`) || document.querySelector(`[data-line-index="${newActiveIdx}"]`);
        if (lineEl && newActiveLine?.words) {
          const wordEls = Array.from(lineEl.querySelectorAll('.karaoke-word')) as HTMLElement[];
          wordCacheRef.current = newActiveLine.words.map((w, i) => ({
            el: wordEls[i],
            start: w.start,
            end: w.end,
            effectiveEnd: w.end,
            state: 'pending' as const,
          }));
        }
      }

      // ── Per-word loop ──
      for (const word of wordCacheRef.current) {
        // ── Not reached yet ──
        if (timeMs < word.start) {
          word.effectiveEnd = word.end; // reset on seek-back
          if (word.state !== 'pending') {
            word.el.style.setProperty('--word-progress', '0%');
            word.el.style.setProperty('--word-energy', '0');
            word.el.classList.remove('active', 'completed');
            word.state = 'pending';
          }
          continue;
        }

        // ── Active ──
        if (word.state !== 'completed' && timeMs <= word.effectiveEnd) {
          const nominalDuration = word.end - word.start;

          // Dynamic end extension: while energy is above threshold and we're past
          // 55% of the nominal word, keep the effective end ~200ms ahead.
          // Cap at 1.8× the original word duration to prevent runaway holds.
          if (energy > HOLD_THRESHOLD && timeMs > word.start + nominalDuration * 0.55) {
            const maxEnd = word.end + nominalDuration * 1.8;
            word.effectiveEnd = Math.min(maxEnd, timeMs + 200);
          }
          // If energy dropped while we're past the LRC end, snap to complete in 80ms
          if (timeMs > word.end && energy <= HOLD_THRESHOLD) {
            word.effectiveEnd = Math.min(word.effectiveEnd, timeMs + 80);
          }

          const effectiveDuration = Math.max(1, word.effectiveEnd - word.start);
          const t = Math.min(1, (timeMs - word.start) / effectiveDuration); // [0, 1]

          // ── Energy-shaped progress curve ──
          let progress: number;
          if (energy > HOLD_THRESHOLD) {
            const exponent = Math.max(0.25, 1.0 - energy * 1.2);
            const holdCurve = 1 - Math.pow(1 - t, exponent);
            const blend = Math.min(1, (energy - HOLD_THRESHOLD) * 5);
            const smoothStep = t * t * (3 - 2 * t);
            progress = smoothStep * (1 - blend) + holdCurve * blend;
          } else {
            progress = t * t * (3 - 2 * t);
          }

          progress = Math.max(0, Math.min(1, progress));

          word.el.style.setProperty('--word-progress', `${(progress * 100).toFixed(1)}%`);
          word.el.style.setProperty('--word-energy', `${energy.toFixed(3)}`);

          if (word.state !== 'active') {
            word.el.classList.add('active');
            word.el.classList.remove('completed');
            word.state = 'active';
          }

        // ── Complete ──
        } else if (timeMs > word.effectiveEnd && word.state !== 'completed') {
          word.el.style.setProperty('--word-progress', '100%');
          word.el.style.setProperty('--word-energy', '0');
          word.el.classList.replace('active', 'completed') || word.el.classList.add('completed');
          word.state = 'completed';
        }
      }

      // 3. Ambient pulsing background animation (uses the already fetched dataArray)
      try {
        if (dataArray && isPlaying && isFullscreen) {
          // Sub-bass and Bass bins (Bins 1 to 10 covers ~23Hz to ~234Hz with 2048 fftSize/48kHz sampleRate)
          let sumBass = 0;
          for (let i = 1; i <= 10; i++) {
            sumBass += dataArray[i] || 0;
          }
          const averageBass = sumBass / 10;
          const bassPercent = averageBass / 255.0;

          // Smooth using linear interpolation (exponential decay) for clean/soothing easing
          smoothedBassRef.current = smoothedBassRef.current * 0.72 + bassPercent * 0.28;

          // Apply scale to container and opacity changes to backdrop
          const scaleVal = 1.0 + smoothedBassRef.current * 0.04;
          const opacityVal = 0.65 - smoothedBassRef.current * 0.15;

          if (ambientContainerRef.current) {
            ambientContainerRef.current.style.transform = `scale(${scaleVal})`;
          }
          if (backdropRef.current) {
            backdropRef.current.style.background = `rgba(0, 0, 0, ${opacityVal})`;
          }

          // Individual blob scaling for deep organic multi-layered parallax beat reaction
          const scale1 = 1.0 + smoothedBassRef.current * 0.18;
          const scale2 = 1.0 + smoothedBassRef.current * 0.12;
          const scale3 = 1.0 + smoothedBassRef.current * 0.22;

          if (blob1Ref.current) {
            blob1Ref.current.style.transform = `scale(${scale1}) translate3d(0,0,0)`;
          }
          if (blob2Ref.current) {
            blob2Ref.current.style.transform = `scale(${scale2}) translate3d(0,0,0)`;
          }
          if (blob3Ref.current) {
            blob3Ref.current.style.transform = `scale(${scale3}) translate3d(0,0,0)`;
          }
        } else {
          // Reset when not playing/full screen to standard values
          smoothedBassRef.current = smoothedBassRef.current * 0.72;
          const scaleVal = 1.0 + smoothedBassRef.current * 0.04;
          const opacityVal = 0.65 - smoothedBassRef.current * 0.15;

          if (ambientContainerRef.current) {
            ambientContainerRef.current.style.transform = `scale(${scaleVal})`;
          }
          if (backdropRef.current) {
            backdropRef.current.style.background = `rgba(0, 0, 0, ${opacityVal})`;
          }

          if (blob1Ref.current) {
            blob1Ref.current.style.transform = `scale(1) translate3d(0,0,0)`;
          }
          if (blob2Ref.current) {
            blob2Ref.current.style.transform = `scale(1) translate3d(0,0,0)`;
          }
          if (blob3Ref.current) {
            blob3Ref.current.style.transform = `scale(1) translate3d(0,0,0)`;
          }
        }
      } catch (err) {
        console.error('Ambient pulsing animation tick failed:', err);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, syncedLines, playbackSpeed, isFullscreen, syncOffset, isBuffering]);

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
    console.log('[LyricsPanel] Clicked line at time:', time);
    if (typeof time === 'number' && !isNaN(time)) {
      seek(time);
    }
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
                              ? 'active active-line text-white font-bold bg-white/5 shadow-sm'
                              : 'text-neutral-400 hover:text-white font-medium opacity-60'
                          }`}
                          style={{ 
                            fontSize: `${fontSize - 2}px`,
                            transform: isActive ? 'scale(1.05) translate3d(0, 0, 0)' : 'scale(1.0) translate3d(0, 0, 0)',
                            transformOrigin: 'left center',
                            filter: isActive ? 'blur(0px)' : 'blur(0.3px)'
                          }}
                        >
                          {line.words && line.words.length > 0 && wordHighlightEnabled ? (
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
      <AnimatePresence>        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
          >
            {/* Smooth dynamic radial gradient backdrop centered behind the album art */}
            <div 
              className="absolute inset-0 transition-all duration-1000 ease-in-out z-0 pointer-events-none"
              style={{
                background: ambientColors && ambientColors.length >= 2 
                  ? `radial-gradient(circle at 25% 50%, ${ambientColors[0]} 0%, ${ambientColors[1]} 55%, ${ambientColors[2] || '#000'} 100%)`
                  : 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
                filter: 'brightness(0.35) saturate(1.8)',
                opacity: 1.0,
              }}
            />

            {/* Dreamy Animated Floating Blobs for Soothing Ambient Pulsing */}
            <div 
              ref={ambientContainerRef}
              className="absolute inset-0 overflow-hidden pointer-events-none z-0"
              style={{ transformOrigin: 'center center' }}
            >
              {/* Blob 1 Wrapper */}
              <div 
                className="absolute w-[500px] h-[500px] animate-float-blob-1"
                style={{ left: '10%', top: '15%' }}
              >
                <div 
                  ref={blob1Ref}
                  className="w-full h-full rounded-full filter blur-[90px] opacity-[0.38]"
                  style={{
                    background: ambientColors && ambientColors.length > 0 ? ambientColors[0] : 'rgba(168, 85, 247, 0.4)',
                    transition: 'background 1.5s ease-in-out, transform 0.15s cubic-bezier(0.1, 0.8, 0.2, 1)',
                    transformOrigin: 'center center',
                  }}
                />
              </div>
              {/* Blob 2 Wrapper */}
              <div 
                className="absolute w-[550px] h-[550px] animate-float-blob-2"
                style={{ right: '12%', bottom: '10%' }}
              >
                <div 
                  ref={blob2Ref}
                  className="w-full h-full rounded-full filter blur-[110px] opacity-[0.32]"
                  style={{
                    background: ambientColors && ambientColors.length > 1 ? ambientColors[1] : 'rgba(236, 72, 153, 0.3)',
                    transition: 'background 1.5s ease-in-out, transform 0.15s cubic-bezier(0.1, 0.8, 0.2, 1)',
                    transformOrigin: 'center center',
                  }}
                />
              </div>
              {/* Blob 3 Wrapper */}
              <div 
                className="absolute w-[450px] h-[450px] animate-float-blob-3"
                style={{ left: '38%', top: '45%' }}
              >
                <div 
                  ref={blob3Ref}
                  className="w-full h-full rounded-full filter blur-[80px] opacity-[0.26]"
                  style={{
                    background: ambientColors && ambientColors.length > 2 ? ambientColors[2] : 'rgba(59, 130, 246, 0.25)',
                    transition: 'background 1.5s ease-in-out, transform 0.15s cubic-bezier(0.1, 0.8, 0.2, 1)',
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            </div>

            {/* Dynamic Backdrop Blur & Dim Overlay that pulses to the beat */}
            <div 
              ref={backdropRef}
              className="absolute inset-0 backdrop-blur-[110px] pointer-events-none z-0"
              style={{
                background: 'rgba(0, 0, 0, 0.65)',
              }}
            />

            {/* Close Button top-left */}
            <button
              onClick={() => { setIsFullscreen(false); setIsSyncMode(false); }}
              className="absolute top-6 left-6 z-30 p-3 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-neutral-400 hover:text-white"
              title="Close Fullscreen"
            >
              <X size={20} />
            </button>

            {/* Immersive Lyrics Scrolling View (Standard Split Screen) */}
            {!isSyncMode && (
              <div className="relative z-10 flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden">
                {/* Left Side: Large Album Cover & Playback Controls */}
                <div className="w-full md:w-[45%] flex flex-col justify-center items-center px-8 md:px-16 py-8 md:py-16 select-none h-full bg-transparent">
                  <LyricsPlayerControls
                    currentTrack={currentTrack}
                    isPlaying={isPlaying}
                    setPlaying={setPlaying}
                    favorites={favorites}
                    handleFavToggle={handleFavToggle}
                    handleStartEdit={handleStartEdit}
                    shuffle={shuffle}
                    toggleShuffle={toggleShuffle}
                    prevTrack={prevTrack}
                    nextTrack={nextTrack}
                    repeat={repeat}
                    handleRepeatClick={handleRepeatClick}
                    volume={volume}
                    setVolume={setVolume}
                    isMuted={isMuted}
                    toggleMute={toggleMute}
                    wordHighlightEnabled={wordHighlightEnabled}
                    setWordHighlightEnabled={setWordHighlightEnabled}
                    seek={seek}
                  />
                </div>

                {/* Right Side: Interactive Scrolling Lyrics */}
                <div className="w-full md:w-[55%] flex flex-col relative overflow-hidden h-full">
                  <div
                    ref={fullLyricsContainerRef}
                    className="flex-1 overflow-y-auto px-6 md:px-16 py-20 mask-fade-gradient bg-transparent no-scrollbar scroll-smooth"
                  >
                    <div ref={scrollWrapperRef} className="w-full text-left">
                      <div style={{ height: '35vh' }} />
                      {syncedLines.length > 0 ? (
                        syncedLines.map((line, idx) => {
                          const isActive = idx === activeLineIndex;
                          return (
                            <div
                              key={idx}
                              ref={isActive ? activeFullLineRef : undefined}
                              onClick={() => handleLineClick(line.time)}
                              data-line-index={idx}
                              className={`lyrics-line py-4 px-2 cursor-pointer transition-all duration-500 text-left select-none my-6 flex items-start justify-start origin-left ${
                                isActive ? 'active active-line' : ''
                              }`}
                              style={{
                                fontSize: `${fontSize + 6}px`,
                                lineHeight: 1.5,
                                opacity: isActive ? 1.0 : 0.30,
                                transform: isActive ? 'scale(1.12) translate3d(0, 0, 0)' : 'scale(0.92) translate3d(0, 0, 0)',
                                filter: isActive ? 'blur(0px)' : 'blur(1.2px)',
                                color: 'white',
                                fontWeight: isActive ? 800 : 700,
                                letterSpacing: '-0.02em'
                              }}
                            >
                              {line.words && line.words.length > 0 && wordHighlightEnabled ? (
                                <span className="inline-block transition-all duration-300">
                                  {line.words.map((wordInfo, wIdx) => (
                                    <React.Fragment key={wIdx}>
                                      <span
                                        className="karaoke-word inline-block"
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
                        })
                      ) : (
                        <div className="text-left text-neutral-400 font-semibold mt-20 text-lg px-2">
                          {loading ? 'Fetching lyrics...' : plainLyrics || 'No synced lyrics available for this track.'}
                        </div>
                      )}
                      <div style={{ height: '35vh' }} />
                    </div>
                  </div>
                </div>

                {/* Speech Bubble Icon in bottom-right for Sync Creator Toggling */}
                <button
                  onClick={startLyricsSync}
                  className="absolute bottom-6 right-8 z-30 p-3.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-neutral-400 hover:text-white"
                  title="Lyrics Sync Creator"
                >
                  <MessageSquare size={20} />
                </button>
              </div>
            )}

            {/* LRC Sync Creator Mode Layout */}
            {isSyncMode && (
              <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden">
                {/* Clean Custom Header specifically for Sync Creator Mode */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-white/5 backdrop-blur-md bg-black/30">
                  <div className="flex items-center gap-4">
                    {currentTrack?.coverArtUrl && (
                      <img
                        src={api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId) || ''}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover shadow-lg animate-[spin_20s_linear_infinite]"
                        style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (currentTrack.videoId && target.src !== `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`) {
                            target.src = `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
                          }
                        }}
                      />
                    )}
                    <div>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{currentTrack?.title}</Typography>
                      <Typography variant="caption" sx={{ color: 'neutral.400' }}>{currentTrack?.artist}</Typography>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                    <span>Lyrics Sync Creator Mode</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <IconButton onClick={() => { setIsFullscreen(false); setIsSyncMode(false); }} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                      <Minimize2 size={18} />
                    </IconButton>
                    <IconButton onClick={() => { setIsFullscreen(false); setIsSyncMode(false); onClose(); }} sx={{ color: 'white', bgcolor: 'white/10', '&:hover': { bgcolor: 'white/20' } }}>
                      <X size={18} />
                    </IconButton>
                  </div>
                </div>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
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
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LyricsPanel;
