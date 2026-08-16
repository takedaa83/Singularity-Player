import { usePlayerStore } from '../stores/playerStore';
import { timeStore, audioEngine } from '../hooks/useAudioEngine';
import { api } from './api';

let pipVideoElement: HTMLVideoElement | null = null;
let pipCanvasElement: HTMLCanvasElement | null = null;
let pipAnimFrameId: number | null = null;
let cachedCoverImg: HTMLImageElement | null = null;
let cachedCoverUrl: string | null = null;

function parseCurrentLrcLine(lrc: string, currentTime: number): string {
  if (!lrc) return '';
  const lines = lrc.split('\n');
  let currentText = '';

  for (const line of lines) {
    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      const time = min * 60 + sec;
      if (currentTime >= time) {
        currentText = match[3].trim();
      } else {
        break;
      }
    }
  }
  return currentText;
}

export async function togglePictureInPictureMiniPlayer(): Promise<boolean> {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    cleanupPiP();
    return false;
  }

  try {
    if (!pipCanvasElement) {
      pipCanvasElement = document.createElement('canvas');
      pipCanvasElement.width = 512;
      pipCanvasElement.height = 512;
    }

    const ctx = pipCanvasElement.getContext('2d');
    if (!ctx) return false;

    if (!pipVideoElement) {
      pipVideoElement = document.createElement('video');
      pipVideoElement.autoplay = true;
      pipVideoElement.muted = true;
      pipVideoElement.style.display = 'none';
      document.body.appendChild(pipVideoElement);
    }

    const stream = pipCanvasElement.captureStream(30);
    pipVideoElement.srcObject = stream;

    await pipVideoElement.play().catch(() => {});

    // Render loop for PiP canvas window
    const renderPiPCanvas = () => {
      if (!ctx || !pipCanvasElement) return;

      const width = pipCanvasElement.width;
      const height = pipCanvasElement.height;
      const { currentTrack, isPlaying } = usePlayerStore.getState();
      const { currentTime, duration } = timeStore.getSnapshot();

      // Load cover art if changed
      const rawCover = currentTrack ? api.coverUrl(currentTrack.coverArtUrl || (currentTrack as any).coverUrl, currentTrack.videoId) : null;
      if (rawCover && rawCover !== cachedCoverUrl) {
        cachedCoverUrl = rawCover;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = rawCover;
        img.onload = () => { cachedCoverImg = img; };
      } else if (!rawCover) {
        cachedCoverUrl = null;
        cachedCoverImg = null;
      }

      // Background Gradient Mesh
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0a0a0f');
      grad.addColorStop(0.5, '#13111c');
      grad.addColorStop(1, '#050508');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle Ambient Glow
      ctx.beginPath();
      ctx.arc(width / 2, 170, 140, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fill();

      // Render Squircle Album Art
      const artSize = 190;
      const artX = (width - artSize) / 2;
      const artY = 55;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artX, artY, artSize, artSize, 24);
      ctx.clip();

      if (cachedCoverImg && cachedCoverImg.complete) {
        ctx.drawImage(cachedCoverImg, artX, artY, artSize, artSize);
      } else {
        ctx.fillStyle = '#262626';
        ctx.fillRect(artX, artY, artSize, artSize);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 50px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎵', width / 2, artY + artSize / 2);
      }
      ctx.restore();

      // Artwork border ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(artX, artY, artSize, artSize, 24);
      ctx.stroke();

      // Track Title & Artist
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      if (currentTrack) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const title = currentTrack.title.length > 24 ? currentTrack.title.substring(0, 22) + '...' : currentTrack.title;
        ctx.fillText(title, width / 2, 285);

        ctx.fillStyle = '#a1a1aa';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const artist = currentTrack.artist.length > 30 ? currentTrack.artist.substring(0, 28) + '...' : currentTrack.artist;
        ctx.fillText(artist, width / 2, 312);

        // Live Synchronized Karaoke Lyric Line
        const currentLyric = currentTrack.syncedLyrics ? parseCurrentLrcLine(currentTrack.syncedLyrics, currentTime) : '';
        if (currentLyric) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 16px sans-serif';
          const truncatedLyric = currentLyric.length > 40 ? currentLyric.substring(0, 38) + '...' : currentLyric;
          ctx.fillText(`“ ${truncatedLyric} ”`, width / 2, 350);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('Singularity Player', width / 2, 295);
      }

      // Dancing Audio Spectrum Visualizer Bars
      const analyser = audioEngine.getAnalyser();
      if (analyser && isPlaying) {
        const freqData = new Uint8Array(32);
        analyser.getByteFrequencyData(freqData as any);

        const barCount = 28;
        const totalBarWidth = width - 120;
        const barW = totalBarWidth / barCount - 3;
        const startX = 60;
        const baseBarY = 430;

        for (let i = 0; i < barCount; i++) {
          const val = freqData[i] || 0;
          const barH = Math.max(4, (val / 255) * 35);
          const bx = startX + i * (barW + 3);
          const by = baseBarY - barH;

          ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + (val / 255) * 0.6})`;
          ctx.beginPath();
          ctx.roundRect(bx, by, barW, barH, 2);
          ctx.fill();
        }
      }

      // Progress Bar
      const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
      const barX = 50;
      const barY = height - 55;
      const barWidth = width - 100;
      const barHeight = 6;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 3);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, 3);
      ctx.fill();

      // Status indicator
      ctx.fillStyle = isPlaying ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(width / 2, height - 22, 5, 0, Math.PI * 2);
      ctx.fill();

      pipAnimFrameId = requestAnimationFrame(renderPiPCanvas);
    };

    renderPiPCanvas();

    if (pipVideoElement.readyState < 1) {
      await new Promise<void>((resolve) => {
        if (!pipVideoElement) return resolve();
        const onLoaded = () => {
          pipVideoElement?.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        pipVideoElement.addEventListener('loadedmetadata', onLoaded);
        setTimeout(resolve, 300);
      });
    }

    await pipVideoElement.requestPictureInPicture();

    pipVideoElement.addEventListener('leavepictureinpicture', () => {
      cleanupPiP();
    }, { once: true });

    return true;
  } catch (err) {
    console.warn('[PiP MiniPlayer Error]:', err);
    cleanupPiP();
    return false;
  }
}

function cleanupPiP() {
  if (pipAnimFrameId !== null) {
    cancelAnimationFrame(pipAnimFrameId);
    pipAnimFrameId = null;
  }
  if (pipVideoElement) {
    pipVideoElement.srcObject = null;
  }
}
