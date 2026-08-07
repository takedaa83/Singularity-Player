/**
 * Head-Tracked 3D Spatial Audio Hook
 * Listens to device orientation gyroscope sensor events (alpha, beta, gamma)
 * to adjust Web Audio HRTF Panner position in 3D space dynamically as user rotates head.
 */

import { useEffect, useState } from 'react';
import { audioEngine } from './useAudioEngine';

export function useHeadTracking() {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      setIsSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const alpha = e.alpha || 0;
      const beta = e.beta || 0;
      const gamma = e.gamma || 0;

      setOrientation({ alpha, beta, gamma });

      // Convert angles to 3D Cartesian coordinates for Web Audio PannerNode
      const radAlpha = (alpha * Math.PI) / 180;
      const radBeta = (beta * Math.PI) / 180;

      const x = Math.sin(radAlpha) * 2;
      const y = Math.sin(radBeta) * 2;
      const z = Math.cos(radAlpha) * 2;

      // Update AudioEngine HRTF panner coordinates
      if ((audioEngine as any).pannerNode) {
        try {
          const panner = (audioEngine as any).pannerNode as PannerNode;
          const now = (audioEngine as any).audioContext?.currentTime || 0;
          panner.positionX.setTargetAtTime(x, now, 0.05);
          panner.positionY.setTargetAtTime(y, now, 0.05);
          panner.positionZ.setTargetAtTime(z, now, 0.05);
        } catch (err) {}
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [isEnabled]);

  const toggleHeadTracking = async () => {
    if (isEnabled) {
      setIsEnabled(false);
      return;
    }

    // iOS 13+ permission check
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm === 'granted') {
          setIsEnabled(true);
        } else {
          alert('Device Orientation permission denied.');
        }
      } catch (err) {
        console.warn('Orientation permission error:', err);
      }
    } else {
      setIsEnabled(true);
    }
  };

  return { isSupported, isEnabled, orientation, toggleHeadTracking };
}
