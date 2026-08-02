import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { audioEngine } from '../../hooks/useAudioEngine';
import { X, Sparkles, Disc, Activity } from 'lucide-react';

interface Visualizer3DProps {
  onClose?: () => void;
}

export const Visualizer3D: React.FC<Visualizer3DProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeVisualizer = usePlayerStore((s) => s.activeVisualizer);
  const setActiveVisualizer = usePlayerStore((s) => s.setActiveVisualizer);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const [fps, setFps] = useState(60);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Audio frequency buffers
    const frequencyData = new Uint8Array(128);
    const timeData = new Uint8Array(128);

    // Particle system for tunnel & blob
    const particles = Array.from({ length: 120 }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * 1000 + 1,
      size: Math.random() * 3 + 1,
      color: `hsl(${Math.random() * 360}, 100%, 75%)`,
    }));

    let rotationAngle = 0;

    const render = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      const analyser = audioEngine.getAnalyser();
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeData);
      } else {
        frequencyData.fill(0);
        timeData.fill(128);
      }

      // Calculate bass/treble energy
      let bass = 0;
      for (let i = 0; i < 16; i++) bass += frequencyData[i];
      bass /= 16;
      const bassScale = 1 + (bass / 255) * 0.8;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Deep dark futuristic background
      const bgGlow = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, Math.max(width, height) / 1.2);
      bgGlow.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      bgGlow.addColorStop(0.5, 'rgba(10, 15, 30, 0.98)');
      bgGlow.addColorStop(1, 'rgba(3, 7, 18, 1)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      rotationAngle += 0.008;

      if (activeVisualizer === '3d_tunnel') {
        // Render 3D Perspective Cyberpunk Tunnel
        ctx.save();
        ctx.translate(centerX, centerY);

        const rings = 24;
        for (let i = 0; i < rings; i++) {
          const depth = ((i * 40 + rotationAngle * 200) % 800) + 1;
          const scale = 400 / depth;
          const radius = 300 * scale * bassScale;
          const alpha = 1 - depth / 800;

          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.lineWidth = 2 * scale;
          ctx.strokeStyle = `hsla(${(i * 15 + rotationAngle * 100) % 360}, 100%, 65%, ${alpha})`;
          ctx.shadowBlur = 15;
          ctx.shadowColor = `hsl(${(i * 15 + rotationAngle * 100) % 360}, 100%, 50%)`;
          ctx.stroke();
        }

        // Starfield particles in 3D depth
        particles.forEach((p) => {
          p.z -= 4 + (bass / 255) * 10;
          if (p.z <= 1) p.z = 1000;

          const pScale = 400 / p.z;
          const px = p.x * pScale;
          const py = p.y * pScale;
          const pRadius = p.size * pScale;

          if (px > -centerX && px < centerX && py > -centerY && py < centerY) {
            ctx.beginPath();
            ctx.arc(px, py, Math.max(0.5, pRadius), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 1 - p.z / 1000;
            ctx.fill();
          }
        });

        ctx.restore();
      } else if (activeVisualizer === '3d_blob') {
        // Render Liquid Mercury Blob
        ctx.save();
        ctx.translate(centerX, centerY);

        const baseRadius = Math.min(width, height) * 0.18 * bassScale;
        const points = 64;

        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const freqVal = frequencyData[i % frequencyData.length] / 255;
          const waveVal = (timeData[i % timeData.length] - 128) / 128;

          const distortion = Math.sin(angle * 6 + rotationAngle * 4) * 25 * freqVal + waveVal * 30;
          const r = baseRadius + distortion;

          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const blobGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, baseRadius * 1.5);
        blobGrad.addColorStop(0, '#a855f7');
        blobGrad.addColorStop(0.5, '#ec4899');
        blobGrad.addColorStop(1, '#3b82f6');

        ctx.fillStyle = blobGrad;
        ctx.shadowBlur = 40 * bassScale;
        ctx.shadowColor = '#a855f7';
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();

        ctx.restore();
      } else if (activeVisualizer === '3d_spectrum') {
        // Render 3D Isometric Audio Bars
        ctx.save();
        ctx.translate(centerX, centerY + 100);

        const numBars = 48;
        const barWidth = (width * 0.6) / numBars;

        for (let i = 0; i < numBars; i++) {
          const val = frequencyData[i * 2] || 0;
          const barHeight = (val / 255) * (height * 0.4) + 10;
          const x = (i - numBars / 2) * (barWidth + 4);

          // 3D Isometric Offset
          const offset3D = 12;

          // Back shadow 3D face
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(x + offset3D, -barHeight - offset3D, barWidth, barHeight);

          // Top gradient face
          const barGrad = ctx.createLinearGradient(x, 0, x, -barHeight);
          barGrad.addColorStop(0, '#3b82f6');
          barGrad.addColorStop(0.5, '#a855f7');
          barGrad.addColorStop(1, '#ec4899');

          ctx.fillStyle = barGrad;
          ctx.shadowBlur = val > 150 ? 20 : 0;
          ctx.shadowColor = '#ec4899';
          ctx.fillRect(x, -barHeight, barWidth, barHeight);

          // Glossy highlight top edge
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, -barHeight, barWidth, 3);
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [activeVisualizer, isPlaying]);

  if (activeVisualizer === 'off') return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col justify-between overflow-hidden backdrop-blur-3xl animate-in fade-in duration-300">
      {/* 3D Canvas Element */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      {/* Top Header Bar */}
      <div className="relative z-10 p-6 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg tracking-wide flex items-center space-x-2">
              <span>3D Audio Engine</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {fps} FPS
              </span>
            </h2>
            <p className="text-xs text-slate-400">Real-time WebGL Frequency Visualization</p>
          </div>
        </div>

        {/* Visualizer Mode Selector */}
        <div className="flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveVisualizer('3d_tunnel')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
              activeVisualizer === '3d_tunnel' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            <span>Cyber Tunnel</span>
          </button>
          <button
            onClick={() => setActiveVisualizer('3d_blob')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
              activeVisualizer === '3d_blob' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Liquid Blob</span>
          </button>
          <button
            onClick={() => setActiveVisualizer('3d_spectrum')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
              activeVisualizer === '3d_spectrum' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>3D Spectrum</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={() => {
            setActiveVisualizer('off');
            if (onClose) onClose();
          }}
          className="w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-all border border-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Track Info Overlay */}
      {currentTrack && (
        <div className="relative z-10 p-6 flex items-center space-x-4 bg-gradient-to-t from-slate-950/90 to-transparent">
          {currentTrack.coverArtUrl ? (
            <img src={currentTrack.coverArtUrl} alt={currentTrack.title} className="w-14 h-14 rounded-xl object-cover border border-slate-700 shadow-xl" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-purple-600/30 flex items-center justify-center text-purple-300 font-bold text-xl border border-purple-500/30">
              🎵
            </div>
          )}
          <div>
            <h3 className="text-white font-bold text-base line-clamp-1">{currentTrack.title}</h3>
            <p className="text-slate-400 text-sm line-clamp-1">{currentTrack.artist}</p>
          </div>
        </div>
      )}
    </div>
  );
};
