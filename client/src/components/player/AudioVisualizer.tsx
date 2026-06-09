import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';

interface AudioVisualizerProps {
  getAnalyser: () => AnalyserNode | null;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ getAnalyser }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerStyle = usePlayerStore(state => state.visualizerStyle);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isVisible = true;
    let isTabVisible = !document.hidden;

    // Handle high DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 1. Observe if the canvas element is visible on the screen
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible && isTabVisible) {
        if (!animationRef.current) {
          render();
        }
      } else {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      }
    }, { threshold: 0.01 });

    observer.observe(canvas);

    // 2. Observe if the browser tab itself is active/visible
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isVisible && isTabVisible) {
        if (!animationRef.current) {
          render();
        }
      } else {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = () => {
      if (!isVisible || !isTabVisible) {
        animationRef.current = null;
        return;
      }

      const analyser = getAnalyser();
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear with very slight transparency to create trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, width, height);

      if (!analyser || !isPlaying) {
        // If not playing, draw a simple flat line or placeholder
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        if (visualizerStyle === 'circular') {
          ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.25, 0, 2 * Math.PI);
        } else {
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
        }
        ctx.stroke();

        animationRef.current = requestAnimationFrame(render);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      if (visualizerStyle === 'wave') {
        // Oscilloscope waveform visualizer
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 3;
        // Create glowing purple/pink gradient
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#aaaaaa');
        grad.addColorStop(1, '#ffffff');
        
        ctx.strokeStyle = grad;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

      } else if (visualizerStyle === 'circular') {
        // Circular frequency visualizer
        analyser.getByteFrequencyData(dataArray);

        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.22;
        const numBars = Math.min(bufferLength, 120);

        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';

        for (let i = 0; i < numBars; i++) {
          const value = dataArray[i];
          const percent = value / 255;
          const barHeight = percent * 60;

          const angle = (i / numBars) * Math.PI * 2;
          const startX = centerX + Math.cos(angle) * baseRadius;
          const startY = centerY + Math.sin(angle) * baseRadius;
          const endX = centerX + Math.cos(angle) * (baseRadius + barHeight);
          const endY = centerY + Math.sin(angle) * (baseRadius + barHeight);

          // Color gradient radially
          const brightness = 40 + percent * 60;
          ctx.strokeStyle = `rgba(${brightness}%, ${brightness}%, ${brightness}%, 0.8)`;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Draw inner pulse circle based on low frequency amplitude
        const bassVal = dataArray[2] || 0; // index 2 is low frequency
        const pulseRadius = baseRadius + (bassVal / 255) * 12;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();

      } else {
        // Default: 'bars' frequency columns downsampled to 128 bars
        analyser.getByteFrequencyData(dataArray);

        const displayBars = 128;
        const step = Math.max(1, Math.floor(bufferLength / displayBars));
        const barWidth = (width / displayBars) * 2.2;
        let barHeight;
        let x = 0;

        // Create sleek gradients
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
        gradient.addColorStop(1, '#ffffff');

        for (let i = 0; i < displayBars; i++) {
          let sum = 0;
          const startIdx = i * step;
          for (let j = 0; j < step; j++) {
            sum += dataArray[startIdx + j] || 0;
          }
          const val = sum / step;

          barHeight = (val / 255) * height * 0.85;

          ctx.fillStyle = gradient;
          
          // Draw rounded bars
          const rx = x;
          const ry = height - barHeight;
          const rw = Math.max(1.5, barWidth - 2);
          const rh = barHeight;

          if (rh > 0) {
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, [4, 4, 0, 0]) : ctx.rect(rx, ry, rw, rh);
            ctx.fill();
          }

          x += barWidth;
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [visualizerStyle, getAnalyser, isPlaying]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-black border border-neutral-800">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
export default AudioVisualizer;
