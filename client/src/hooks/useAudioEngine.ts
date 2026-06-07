import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useToast } from './useToast';
import { api } from '../utils/api';

// ─── External time store (avoids React re-renders at 60fps) ──────────
type TimeListener = () => void;
const timeListeners = new Set<TimeListener>();
let _currentTime = 0;
let _duration = 0;
let _snapshot = { currentTime: 0, duration: 0 };

export const timeStore = {
  getSnapshot: () => _snapshot,
  getCurrentTime: () => _currentTime,
  getDuration: () => _duration,
  subscribe: (listener: TimeListener) => {
    timeListeners.add(listener);
    return () => { timeListeners.delete(listener); };
  },
  _emit: () => {
    _snapshot = { currentTime: _currentTime, duration: _duration };
    for (const l of timeListeners) l();
  },
};

let lastEmitTime = 0;
const EMIT_INTERVAL = 33; // ms (~30fps)

function setTimeValues(current: number, dur: number) {
  _currentTime = current;
  _duration = dur;
  const now = performance.now();
  if (now - lastEmitTime > EMIT_INTERVAL) {
    lastEmitTime = now;
    timeStore._emit();
  }
}

// ─── EQ Frequencies ──────────────────────────────────────────────────
const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// ─── Global Audio Engine Singleton Variables ──────────────────────────
let audio1: HTMLAudioElement | null = null;
let audio2: HTMLAudioElement | null = null;
let activePlayer: 1 | 2 = 1;

let audioContext: AudioContext | null = null;
let gainNode1: GainNode | null = null;
let gainNode2: GainNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let pannerNode: PannerNode | null = null;
let convolverNode: ConvolverNode | null = null;
let reverbGainNode: GainNode | null = null;
let dryGainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let mainGainNode: GainNode | null = null;

let isCrossfading = false;
let rafId: number | null = null;
let sourceNodesCreated = false;
let prefetchedTrackId: string | null = null;
let crossfadeTimeout: ReturnType<typeof setTimeout> | null = null;
let playbackSpeed = 1.0;

// Caching and robustness enhancements
const impulseCache = new Map<string, AudioBuffer>();
let currentCrossfadeId = 0;
let activeListenersCount = 0;
let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

const ensureAudioElements = () => {
  if (!audio1) {
    audio1 = new Audio();
    audio1.preload = 'auto';
    audio1.crossOrigin = 'anonymous';
  }
  if (!audio2) {
    audio2 = new Audio();
    audio2.preload = 'auto';
    audio2.crossOrigin = 'anonymous';
  }
};

const createImpulseResponse = (ctx: AudioContext, duration: number, decay: number): AudioBuffer => {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const pct = i / length;
    const env = Math.pow(1 - pct, decay);
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }
  return impulse;
};

const getCachedImpulseResponse = (ctx: AudioContext, roomSize: 'small' | 'medium' | 'large'): AudioBuffer => {
  if (impulseCache.has(roomSize)) {
    return impulseCache.get(roomSize)!;
  }
  let duration = 0.5;
  let decay = 2.0;
  if (roomSize === 'small') {
    duration = 0.5;
    decay = 2.0;
  } else if (roomSize === 'medium') {
    duration = 1.2;
    decay = 1.5;
  } else if (roomSize === 'large') {
    duration = 2.5;
    decay = 1.0;
  }
  const buffer = createImpulseResponse(ctx, duration, decay);
  impulseCache.set(roomSize, buffer);
  return buffer;
};

const initAudioGraph = () => {
  ensureAudioElements();
  if (audioContext) return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  audioContext = ctx;

  if (!sourceNodesCreated) {
    const source1 = ctx.createMediaElementSource(audio1!);
    const source2 = ctx.createMediaElementSource(audio2!);

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    gainNode1 = gain1;
    gainNode2 = gain2;

    source1.connect(gain1);
    source2.connect(gain2);

    const filters: BiquadFilterNode[] = [];
    EQ_FREQUENCIES.forEach((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      if (idx === 0) filter.type = 'lowshelf';
      else if (idx === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
      else filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      filters.push(filter);
    });

    gain1.connect(filters[0]);
    gain2.connect(filters[0]);

    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }

    const eqOutput = filters[filters.length - 1];

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    pannerNode = panner;

    const convolver = ctx.createConvolver();
    convolverNode = convolver;

    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0;
    reverbGainNode = reverbGain;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    dryGainNode = dryGain;

    convolver.connect(reverbGain);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserNode = analyser;

    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.8;
    mainGainNode = mainGain;

    analyser.connect(mainGain);
    mainGain.connect(ctx.destination);

    eqFilters = filters;
    sourceNodesCreated = true;
  }

  // Sync initial parameters from player store
  const storeState = usePlayerStore.getState();
  
  if (gainNode1 && gainNode2) {
    gainNode1.gain.setValueAtTime(activePlayer === 1 ? 1.0 : 0.0, ctx.currentTime);
    gainNode2.gain.setValueAtTime(activePlayer === 2 ? 1.0 : 0.0, ctx.currentTime);
  }

  if (mainGainNode) {
    mainGainNode.gain.setValueAtTime(storeState.volume, ctx.currentTime);
  }

  if (eqFilters.length > 0) {
    eqFilters.forEach((filter, idx) => {
      if (storeState.equalizerBands[idx] !== undefined) {
        filter.gain.setValueAtTime(storeState.equalizerBands[idx], ctx.currentTime);
      }
    });
  }

  if (pannerNode && convolverNode && reverbGainNode) {
    if (!storeState.spatialAudioEnabled) {
      pannerNode.positionX.setValueAtTime(0, ctx.currentTime);
      pannerNode.positionY.setValueAtTime(0, ctx.currentTime);
      pannerNode.positionZ.setValueAtTime(1, ctx.currentTime);
      reverbGainNode.gain.setValueAtTime(0, ctx.currentTime);
    } else {
      const elevationRad = (storeState.spatialAudioConfig.elevation * Math.PI) / 180;
      const xPos = (storeState.spatialAudioConfig.stereoWidth - 100) / 100;
      pannerNode.positionX.setValueAtTime(xPos * 2, ctx.currentTime);
      pannerNode.positionY.setValueAtTime(Math.sin(elevationRad) * 2, ctx.currentTime);
      pannerNode.positionZ.setValueAtTime(Math.cos(elevationRad) * 2, ctx.currentTime);

      const roomSize = storeState.spatialAudioConfig.roomSize;
      if (roomSize === 'none') {
        reverbGainNode.gain.setValueAtTime(0, ctx.currentTime);
      } else {
        let wetVolume = 0.15;
        if (roomSize === 'small') wetVolume = 0.12;
        else if (roomSize === 'medium') wetVolume = 0.2;
        else if (roomSize === 'large') wetVolume = 0.3;

        const buffer = getCachedImpulseResponse(ctx, roomSize);
        convolverNode.buffer = buffer;
        reverbGainNode.gain.setValueAtTime(wetVolume, ctx.currentTime);
      }
    }
  }

  // Update dynamic connections based on spatial state
  updateAudioConnections();
};

const updateAudioConnections = () => {
  if (eqFilters.length === 0 || !analyserNode) return;
  
  const eqOutput = eqFilters[eqFilters.length - 1];
  
  // Disconnect eqOutput and all spatial nodes to reset routing
  try { eqOutput.disconnect(); } catch (e) {}
  try { pannerNode?.disconnect(); } catch (e) {}
  try { dryGainNode?.disconnect(); } catch (e) {}
  try { reverbGainNode?.disconnect(); } catch (e) {}

  const storeState = usePlayerStore.getState();
  
  if (!storeState.spatialAudioEnabled) {
    // Direct bypass: EQ -> Analyser
    eqOutput.connect(analyserNode);
  } else {
    // Spatial routing: EQ -> Dry/Convolver -> Panner -> Analyser
    if (dryGainNode && convolverNode && reverbGainNode && pannerNode) {
      eqOutput.connect(dryGainNode);
      eqOutput.connect(convolverNode);
      
      dryGainNode.connect(pannerNode);
      reverbGainNode.connect(pannerNode);
      
      pannerNode.connect(analyserNode);
    } else {
      // Fallback
      eqOutput.connect(analyserNode);
    }
  }
};

const prefetchNextTrack = () => {
  const { queue, activeQueueIndex, shuffle, repeat } = usePlayerStore.getState();

  let nextTrackObj;
  if (repeat === 'one') {
    return;
  } else {
    const nextIndex = activeQueueIndex + 1;
    if (nextIndex >= queue.length) return;
    nextTrackObj = queue[nextIndex];
  }

  if (!nextTrackObj || prefetchedTrackId === nextTrackObj.id) return;

  ensureAudioElements();
  const inactivePlayer = activePlayer === 1 ? audio2 : audio1;
  if (!inactivePlayer) return;

  const targetSrc = nextTrackObj.streamUrl.startsWith('http')
    ? nextTrackObj.streamUrl
    : `${api.baseUrl}${nextTrackObj.streamUrl}`;

  inactivePlayer.src = targetSrc;
  inactivePlayer.preload = 'auto';
  inactivePlayer.load();
  prefetchedTrackId = nextTrackObj.id;
};

const cancelActiveCrossfade = () => {
  currentCrossfadeId++;
  if (crossfadeTimeout) {
    clearTimeout(crossfadeTimeout);
    crossfadeTimeout = null;
  }
  isCrossfading = false;

  // Pause and clear the inactive player to prevent ghost audio and release decoder resources
  const inactivePlayer = activePlayer === 1 ? audio2 : audio1;
  if (inactivePlayer) {
    try {
      inactivePlayer.pause();
      inactivePlayer.src = '';
    } catch (e) {
      console.warn('Error clearing inactive player during crossfade cancel:', e);
    }
  }

  // Restore default gain values instantly
  if (audioContext && gainNode1 && gainNode2) {
    const now = audioContext.currentTime;
    gainNode1.gain.cancelScheduledValues(now);
    gainNode2.gain.cancelScheduledValues(now);
    gainNode1.gain.setValueAtTime(activePlayer === 1 ? 1.0 : 0.0, now);
    gainNode2.gain.setValueAtTime(activePlayer === 2 ? 1.0 : 0.0, now);
  }
};

export const closeAudioEngine = async () => {
  stopProgressTimer();
  cancelActiveCrossfade();
  
  if (audioContext) {
    try {
      await audioContext.close();
    } catch (e) {
      console.warn('Error closing AudioContext:', e);
    }
    audioContext = null;
  }
  
  if (audio1) {
    audio1.pause();
    audio1.src = '';
    audio1 = null;
  }
  if (audio2) {
    audio2.pause();
    audio2.src = '';
    audio2 = null;
  }
  
  gainNode1 = null;
  gainNode2 = null;
  eqFilters = [];
  pannerNode = null;
  convolverNode = null;
  reverbGainNode = null;
  dryGainNode = null;
  analyserNode = null;
  mainGainNode = null;
  sourceNodesCreated = false;
  prefetchedTrackId = null;
  impulseCache.clear();
};

const triggerCrossfade = async () => {
  const { queue, activeQueueIndex } = usePlayerStore.getState();
  const nextIndex = activeQueueIndex + 1;
  if (nextIndex >= queue.length) return;

  const nextTrackObj = queue[nextIndex];
  isCrossfading = true;
  currentCrossfadeId++;
  const activeCfId = currentCrossfadeId;

  ensureAudioElements();
  const fadeOutPlayer = activePlayer === 1 ? audio1 : audio2;
  const fadeInPlayer = activePlayer === 1 ? audio2 : audio1;
  const fadeOutGain = activePlayer === 1 ? gainNode1 : gainNode2;
  const fadeInGain = activePlayer === 1 ? gainNode2 : gainNode1;

  if (!fadeOutPlayer || !fadeInPlayer || !fadeOutGain || !fadeInGain || !audioContext) {
    isCrossfading = false;
    return;
  }

  const targetSrc = nextTrackObj.streamUrl.startsWith('http')
    ? nextTrackObj.streamUrl
    : `${api.baseUrl}${nextTrackObj.streamUrl}`;

  fadeInPlayer.src = targetSrc;
  fadeInPlayer.playbackRate = playbackSpeed;
  fadeInPlayer.load();

  const now = audioContext.currentTime;
  const cfDur = usePlayerStore.getState().crossfadeDuration;

  fadeOutGain.gain.setValueAtTime(1.0, now);
  fadeInGain.gain.setValueAtTime(0.0, now);
  fadeOutGain.gain.linearRampToValueAtTime(0.0, now + cfDur);
  fadeInGain.gain.linearRampToValueAtTime(1.0, now + cfDur);

  try {
    await fadeInPlayer.play();
  } catch (e) {
    console.error('Failed to play crossfaded track:', e);
  }

  if (activeCfId !== currentCrossfadeId) return;

  activePlayer = activePlayer === 1 ? 2 : 1;

  if (crossfadeTimeout) clearTimeout(crossfadeTimeout);

  crossfadeTimeout = setTimeout(() => {
    if (activeCfId !== currentCrossfadeId) return;

    fadeOutPlayer.pause();
    fadeOutPlayer.src = '';

    usePlayerStore.setState({
      currentTrack: nextTrackObj,
      activeQueueIndex: nextIndex,
    });

    isCrossfading = false;
    crossfadeTimeout = null;
  }, cfDur * 1000);
};

const tick = () => {
  const player = activePlayer === 1 ? audio1 : audio2;
  if (!player) {
    rafId = requestAnimationFrame(tick);
    return;
  }

  const current = player.currentTime;
  const total = player.duration || 0;
  setTimeValues(current, total);

  // Crossfade check
  const cfDur = usePlayerStore.getState().crossfadeDuration;
  if (
    total > 0 &&
    cfDur > 0 &&
    current >= total - cfDur &&
    !isCrossfading
  ) {
    triggerCrossfade();
  }

  // Prefetch at 60%
  if (total > 0 && current >= total * 0.6 && !prefetchedTrackId) {
    prefetchNextTrack();
  }

  // Song end
  if (player.ended && !isCrossfading) {
    usePlayerStore.getState().nextTrack();
  }

  rafId = requestAnimationFrame(tick);
};

const startProgressTimer = () => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
};

const stopProgressTimer = () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

// ─── Hook ─────────────────────────────────────────────────────────────
export const useAudioEngine = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const playbackSpeedStore = usePlayerStore((s) => s.playbackSpeed);
  const equalizerBands = usePlayerStore((s) => s.equalizerBands);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const spatialAudioEnabled = usePlayerStore((s) => s.spatialAudioEnabled);
  const spatialAudioConfig = usePlayerStore((s) => s.spatialAudioConfig);
  const { toast } = useToast();

  playbackSpeed = playbackSpeedStore;

  // HMR Cleanup & Lifecycle reference tracking
  useEffect(() => {
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }
    activeListenersCount++;
    return () => {
      activeListenersCount--;
      if (activeListenersCount === 0) {
        cleanupTimeout = setTimeout(() => {
          if (activeListenersCount === 0) {
            closeAudioEngine();
          }
        }, 100);
      }
    };
  }, []);

  // Sync volume with smooth linear ramping to prevent clicks/pops
  useEffect(() => {
    if (mainGainNode && audioContext) {
      const now = audioContext.currentTime;
      mainGainNode.gain.cancelScheduledValues(now);
      mainGainNode.gain.setValueAtTime(mainGainNode.gain.value, now);
      mainGainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
    }
  }, [volume]);

  // Sync EQ Bands
  useEffect(() => {
    if (eqFilters.length > 0) {
      eqFilters.forEach((filter, idx) => {
        if (equalizerBands[idx] !== undefined) {
          filter.gain.setValueAtTime(equalizerBands[idx], audioContext?.currentTime || 0);
        }
      });
    }
  }, [equalizerBands]);

  // Sync Spatial Audio Parameters
  useEffect(() => {
    if (!audioContext) return;
    const ctx = audioContext;
    const panner = pannerNode;
    const convolver = convolverNode;
    const reverbGain = reverbGainNode;

    if (!panner || !convolver || !reverbGain) return;

    // Apply routing connections dynamically based on current state
    updateAudioConnections();

    if (!spatialAudioEnabled) {
      panner.positionX.setValueAtTime(0, ctx.currentTime);
      panner.positionY.setValueAtTime(0, ctx.currentTime);
      panner.positionZ.setValueAtTime(1, ctx.currentTime);
      reverbGain.gain.setValueAtTime(0, ctx.currentTime);
      return;
    }

    const elevationRad = (spatialAudioConfig.elevation * Math.PI) / 180;
    const xPos = (spatialAudioConfig.stereoWidth - 100) / 100;

    panner.positionX.setValueAtTime(xPos * 2, ctx.currentTime);
    panner.positionY.setValueAtTime(Math.sin(elevationRad) * 2, ctx.currentTime);
    panner.positionZ.setValueAtTime(Math.cos(elevationRad) * 2, ctx.currentTime);

    const roomSize = spatialAudioConfig.roomSize;
    if (roomSize === 'none') {
      reverbGain.gain.setValueAtTime(0, ctx.currentTime);
    } else {
      let wetVolume = 0.15;

      if (roomSize === 'small') {
        wetVolume = 0.12;
      } else if (roomSize === 'medium') {
        wetVolume = 0.2;
      } else if (roomSize === 'large') {
        wetVolume = 0.3;
      }

      const buffer = getCachedImpulseResponse(ctx, roomSize);
      convolver.buffer = buffer;
      reverbGain.gain.setValueAtTime(wetVolume, ctx.currentTime);
    }
  }, [spatialAudioEnabled, spatialAudioConfig]);

  // Sync Playback Speed
  useEffect(() => {
    ensureAudioElements();
    if (audio1) audio1.playbackRate = playbackSpeedStore;
    if (audio2) audio2.playbackRate = playbackSpeedStore;
  }, [playbackSpeedStore]);

  // Handle Play/Pause and Song Changes
  useEffect(() => {
    ensureAudioElements();
    const activePlayerInstance = activePlayer === 1 ? audio1 : audio2;
    if (!activePlayerInstance || !currentTrack) return;

    const currentSrc = activePlayerInstance.src;
    const targetSrc = currentTrack.streamUrl.startsWith('http')
      ? currentTrack.streamUrl
      : `${api.baseUrl}${currentTrack.streamUrl}`;

    // Reset prefetch status on every track change
    prefetchedTrackId = null;

    if (currentSrc !== targetSrc) {
      if (isCrossfading) {
        cancelActiveCrossfade();
      }
      activePlayerInstance.src = targetSrc;
      activePlayerInstance.load();
    }

    if (isPlaying) {
      initAudioGraph();
      if (audioContext?.state === 'suspended') {
        audioContext.resume();
      }
      activePlayerInstance.play().catch((e) => {
        console.warn('Playback failed or interrupted:', e);
        if (e.name !== 'AbortError') {
          setPlaying(false);
          toast('Playback failed. Please check your network or try another track.', 'error');
        }
      });
      startProgressTimer();
    } else {
      activePlayerInstance.pause();
      stopProgressTimer();
    }

    const onDurationChange = () => {
      setTimeValues(activePlayerInstance.currentTime, activePlayerInstance.duration || currentTrack.duration || 0);
    };
    const onLoadedMetadata = () => {
      setTimeValues(activePlayerInstance.currentTime, activePlayerInstance.duration || currentTrack.duration || 0);
    };

    activePlayerInstance.addEventListener('durationchange', onDurationChange);
    activePlayerInstance.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      activePlayerInstance.removeEventListener('durationchange', onDurationChange);
      activePlayerInstance.removeEventListener('loadedmetadata', onLoadedMetadata);
      stopProgressTimer();
    };
  }, [currentTrack, isPlaying, setPlaying, toast]);

  // Unlock audio graph on user interaction (desktop + mobile gestures)
  useEffect(() => {
    const unlock = () => {
      initAudioGraph();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('pointerdown', unlock);

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  const seek = useCallback((time: number) => {
    ensureAudioElements();
    const activePlayerInstance = activePlayer === 1 ? audio1 : audio2;
    if (activePlayerInstance) {
      activePlayerInstance.currentTime = time;
      setTimeValues(time, activePlayerInstance.duration || 0);
    }
  }, []);

  const getAnalyser = useCallback((): AnalyserNode | null => {
    return analyserNode;
  }, []);

  return { seek, getAnalyser };
};
