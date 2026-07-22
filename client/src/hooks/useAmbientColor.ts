import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { api } from '../utils/api';

// ─── Ambient Color Engine ──────────────────────────────────────────────
// Extracts dominant colors from the currently-playing track's album art
// and sets CSS custom properties on the document root for global use.
// Uses the same canvas-sampling technique as LyricsPanel.tsx.

interface AmbientColors {
  primary: string;
  secondary: string;
}

const DEFAULT_AMBIENT: AmbientColors = {
  primary: 'rgba(120, 80, 200, 0.15)',
  secondary: 'rgba(200, 80, 120, 0.10)',
};

function extractColorsFromImage(url: string): Promise<AmbientColors> {
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
          resolve(DEFAULT_AMBIENT);
          return;
        }
        ctx.drawImage(img, 0, 0, 10, 10);
        const imgData = ctx.getImageData(0, 0, 10, 10).data;

        // Count color occurrences, filtering out very dark/light pixels
        const colorCounts: { [key: string]: { r: number; g: number; b: number; count: number; sat: number } } = {};
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];
          if (a < 200) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (max + min) / 510;
          if (lum < 0.1 || lum > 0.9) continue;

          const roundR = Math.round(r / 25) * 25;
          const roundG = Math.round(g / 25) * 25;
          const roundB = Math.round(b / 25) * 25;
          const key = `${roundR},${roundG},${roundB}`;

          if (!colorCounts[key]) {
            colorCounts[key] = { r: roundR, g: roundG, b: roundB, count: 0, sat };
          }
          colorCounts[key].count++;
        }

        // Sort by saturation × count to prefer vivid, frequent colors
        const sorted = Object.values(colorCounts).sort(
          (a, b) => (b.sat * b.count) - (a.sat * a.count)
        );

        // Pick primary and a sufficiently distinct secondary
        const primary = sorted[0];
        let secondary = sorted[1];

        if (primary && secondary) {
          // Ensure secondary is visually distinct
          const dist = Math.sqrt(
            Math.pow(primary.r - secondary.r, 2) +
            Math.pow(primary.g - secondary.g, 2) +
            Math.pow(primary.b - secondary.b, 2)
          );
          if (dist < 50 && sorted.length > 2) {
            secondary = sorted[2];
          }
        }

        resolve({
          primary: primary
            ? `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.15)`
            : DEFAULT_AMBIENT.primary,
          secondary: secondary
            ? `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.10)`
            : DEFAULT_AMBIENT.secondary,
        });
      } catch (e) {
        console.warn('Ambient color extraction failed:', e);
        resolve(DEFAULT_AMBIENT);
      }
    };

    img.onerror = () => resolve(DEFAULT_AMBIENT);
  });
}

export function useAmbientColor() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lastTrackIdRef = useRef<string | null>(null);
  const root = document.documentElement;

  const applyColors = useCallback((colors: AmbientColors) => {
    root.style.setProperty('--ambient-primary', colors.primary);
    root.style.setProperty('--ambient-secondary', colors.secondary);
    // Parse r, g, b values for raw RGB use
    const match = colors.primary.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match;
      root.style.setProperty('--ambient-rgb', `${r}, ${g}, ${b}`);
      root.style.setProperty('--ambient-primary-solid', `rgb(${r}, ${g}, ${b})`);
    } else {
      root.style.setProperty('--ambient-rgb', '120, 80, 200');
      root.style.setProperty('--ambient-primary-solid', 'rgb(120, 80, 200)');
    }
  }, [root]);

  useEffect(() => {
    if (!currentTrack || currentTrack.id === lastTrackIdRef.current) return;
    lastTrackIdRef.current = currentTrack.id;

    const coverUrl = api.coverUrl(currentTrack.coverArtUrl, currentTrack.videoId);
    if (!coverUrl) {
      applyColors(DEFAULT_AMBIENT);
      return;
    }

    // Use the server proxy for cross-origin images to avoid CORS canvas tainting
    const proxyUrl = coverUrl.startsWith('http') && !coverUrl.startsWith(api.baseUrl)
      ? `${api.baseUrl}/api/proxy-image?url=${encodeURIComponent(coverUrl)}`
      : coverUrl;

    extractColorsFromImage(proxyUrl).then(applyColors);
  }, [currentTrack, applyColors]);

  // Initialize with defaults on mount
  useEffect(() => {
    applyColors(DEFAULT_AMBIENT);
  }, [applyColors]);
}
