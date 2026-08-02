import { usePlayerStore } from '../stores/playerStore';
import { timeStore } from '../hooks/useAudioEngine';

let pipVideoElement: HTMLVideoElement | null = null;
let pipCanvasElement: HTMLCanvasElement | null = null;
let pipAnimFrameId: number | null = null;

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

      // Background Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Accent Glowing Ring
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 - 30, 150, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.fill();

      // Track Title & Artist
      ctx.textAlign = 'center';

      if (currentTrack) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        const title = currentTrack.title.length > 25 ? currentTrack.title.substring(0, 22) + '...' : currentTrack.title;
        ctx.fillText(title, width / 2, height - 120);

        ctx.fillStyle = '#a1a1aa';
        ctx.font = '20px sans-serif';
        const artist = currentTrack.artist.length > 30 ? currentTrack.artist.substring(0, 27) + '...' : currentTrack.artist;
        ctx.fillText(artist, width / 2, height - 85);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Singularity Player', width / 2, height - 100);
      }

      // Progress Bar
      const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
      const barX = 40;
      const barY = height - 50;
      const barWidth = width - 80;
      const barHeight = 8;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 4);
      ctx.fill();

      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, 4);
      ctx.fill();

      // Status indicator
      ctx.fillStyle = isPlaying ? '#34d399' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(width / 2, height - 20, 6, 0, Math.PI * 2);
      ctx.fill();

      pipAnimFrameId = requestAnimationFrame(renderPiPCanvas);
    };

    renderPiPCanvas();

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
