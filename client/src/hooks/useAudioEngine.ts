import { useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useToastStore } from './useToast';
import { api } from '../utils/api';
import { Track, SpatialAudioConfig } from '../types';

// ─── External time store (avoids React re-renders at 60fps) ──────────
type TimeListener = () => void;
const timeListeners = new Set<TimeListener>();
let _currentTime = 0;
let _currentTimeStampedAt = 0; // performance.now() when _currentTime was last set
let _duration = 0;
let _snapshot = { currentTime: 0, duration: 0 };

export const timeStore = {
  getSnapshot: () => _snapshot,
  getCurrentTime: () => _currentTime,
  getStampedAt: () => _currentTimeStampedAt, // expose it
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
  _currentTimeStampedAt = performance.now();
  _duration = dur;
  const now = performance.now();
  if (now - lastEmitTime > EMIT_INTERVAL) {
    lastEmitTime = now;
    timeStore._emit();
  }
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export class AudioEngine {
  private audio1: HTMLAudioElement;
  private audio2: HTMLAudioElement;
  private activePlayer: 1 | 2 = 1;

  private audioContext: AudioContext | null = null;
  private gainNode1: GainNode | null = null;
  private gainNode2: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private pannerNode: PannerNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private reverbGainNode: GainNode | null = null;
  private dryGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mainGainNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;

  private isCrossfading = false;
  private rafId: number | null = null;
  private sourceNodesCreated = false;
  private prefetchedTrackId: string | null = null;
  private crossfadeTimeout: ReturnType<typeof setTimeout> | null = null;
  private playbackSpeed = 1.0;

  private impulseCache = new Map<string, AudioBuffer>();
  private currentCrossfadeId = 0;

  private activeFadeOutPlayer: HTMLAudioElement | null = null;
  private activeFadeOutEndedListener: (() => void) | null = null;

  // Cached store state properties
  private cachedCrossfadeDuration = 0;
  private cachedIsPlaying = false;
  private cachedEqualizerBands: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  private cachedFadeOutCurve: Float32Array | null = null;
  private cachedFadeInCurve: Float32Array | null = null;

  // Store previous values to detect changes
  private prevTrack: Track | null = null;
  private prevIsPlaying = false;
  private prevVolume = 0.7;
  private prevEqualizerBands: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private prevSpatialAudioEnabled = false;
  private prevSpatialAudioConfig: SpatialAudioConfig = { stereoWidth: 100, roomSize: 'none', elevation: 0 };
  private prevPlaybackSpeed = 1.0;
  private prevStreamingQuality = 'high';

  constructor() {
    this.audio1 = new Audio();
    this.audio2 = new Audio();

    this.audio1.preload = 'auto';
    this.audio1.crossOrigin = 'anonymous';
    this.audio2.preload = 'auto';
    this.audio2.crossOrigin = 'anonymous';

    // Set up event listeners once
    this.setupAudioEventListeners(this.audio1);
    this.setupAudioEventListeners(this.audio2);

    // Sync initial state from store
    const initialState = usePlayerStore.getState();
    this.prevTrack = initialState.currentTrack;
    this.prevIsPlaying = initialState.isPlaying;
    this.prevVolume = initialState.volume;
    this.prevEqualizerBands = [...initialState.equalizerBands];
    this.prevSpatialAudioEnabled = initialState.spatialAudioEnabled;
    this.prevSpatialAudioConfig = { ...initialState.spatialAudioConfig };
    this.prevPlaybackSpeed = initialState.playbackSpeed;
    this.prevStreamingQuality = initialState.streamingQuality;

    this.cachedCrossfadeDuration = initialState.crossfadeDuration;
    this.cachedIsPlaying = initialState.isPlaying;
    this.cachedEqualizerBands = [...initialState.equalizerBands];
    this.playbackSpeed = initialState.playbackSpeed;

    // Subscribe to store updates
    usePlayerStore.subscribe((state) => this.handleStoreUpdate(state));

    // Interaction unlock
    this.setupUnlockListeners();
  }

  private setupAudioEventListeners(audio: HTMLAudioElement) {
    audio.addEventListener('durationchange', () => {
      if (this.isActivePlayer(audio)) {
        setTimeValues(audio.currentTime, audio.duration || this.getCurrentTrackDuration());
      }
    });
    audio.addEventListener('loadedmetadata', () => {
      if (this.isActivePlayer(audio)) {
        setTimeValues(audio.currentTime, audio.duration || this.getCurrentTrackDuration());
      }
    });
    audio.addEventListener('waiting', () => {
      if (this.isActivePlayer(audio)) {
        usePlayerStore.getState().setBuffering(true);
      }
    });
    audio.addEventListener('playing', () => {
      if (this.isActivePlayer(audio)) {
        usePlayerStore.getState().setBuffering(false);
      }
    });
    audio.addEventListener('canplay', () => {
      if (this.isActivePlayer(audio)) {
        usePlayerStore.getState().setBuffering(false);
      }
    });
    audio.addEventListener('seeked', () => {
      if (this.isActivePlayer(audio)) {
        usePlayerStore.getState().setBuffering(false);
      }
    });
    audio.addEventListener('stalled', () => {
      if (this.isActivePlayer(audio)) {
        console.warn('[Audio Engine] Playback stalled...');
        usePlayerStore.getState().setBuffering(true);
      }
    });
    audio.addEventListener('ended', () => {
      if (this.isActivePlayer(audio)) {
        if (!this.isCrossfading && usePlayerStore.getState().isPlaying) {
          usePlayerStore.getState().nextTrack();
        }
      }
    });
    audio.addEventListener('error', () => {
      if (this.isActivePlayer(audio)) {
        this.handlePlaybackError(audio);
      }
    });
  }

  private isActivePlayer(audio: HTMLAudioElement): boolean {
    const activeAudio = this.activePlayer === 1 ? this.audio1 : this.audio2;
    return audio === activeAudio;
  }

  private getCurrentTrackDuration(): number {
    const track = usePlayerStore.getState().currentTrack;
    return track ? track.duration : 0;
  }

  private getPreAmpGain(): number {
    const maxBoost = Math.max(0, ...this.cachedEqualizerBands);
    return Math.pow(10, -maxBoost / 20);
  }

  private getLoudnessMultiplier(track: Track | null): number {
    if (!track || track.replayGain == null) return 1.0;
    return Math.pow(10, track.replayGain / 20);
  }

  private syncPreAmpGain() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const preAmp = this.getPreAmpGain();
    const currentTrack = usePlayerStore.getState().currentTrack;

    if (this.isCrossfading) return;

    const currentMultiplier = this.getLoudnessMultiplier(currentTrack);
    const targetGain = preAmp * currentMultiplier;

    if (this.gainNode1) {
      this.gainNode1.gain.cancelScheduledValues(now);
      this.gainNode1.gain.setValueAtTime(this.activePlayer === 1 ? targetGain : 0.0, now);
    }
    if (this.gainNode2) {
      this.gainNode2.gain.cancelScheduledValues(now);
      this.gainNode2.gain.setValueAtTime(this.activePlayer === 2 ? targetGain : 0.0, now);
    }
  }

  private handleStoreUpdate(state: any) {
    const volumeChanged = state.volume !== this.prevVolume;
    const eqBandsChanged = state.equalizerBands.some(
      (val: number, idx: number) => val !== this.prevEqualizerBands[idx]
    );
    const spatialChanged = 
      state.spatialAudioEnabled !== this.prevSpatialAudioEnabled ||
      state.spatialAudioConfig.stereoWidth !== this.prevSpatialAudioConfig.stereoWidth ||
      state.spatialAudioConfig.roomSize !== this.prevSpatialAudioConfig.roomSize ||
      state.spatialAudioConfig.elevation !== this.prevSpatialAudioConfig.elevation;
    const speedChanged = state.playbackSpeed !== this.prevPlaybackSpeed;
    const trackChanged = state.currentTrack?.id !== this.prevTrack?.id;
    const isPlayingChanged = state.isPlaying !== this.prevIsPlaying;
    const qualityChanged = state.streamingQuality !== this.prevStreamingQuality;

    this.cachedCrossfadeDuration = state.crossfadeDuration;
    this.cachedIsPlaying = state.isPlaying;
    this.cachedEqualizerBands = [...state.equalizerBands];

    if (volumeChanged) {
      this.prevVolume = state.volume;
      if (this.mainGainNode && this.audioContext) {
        const now = this.audioContext.currentTime;
        this.mainGainNode.gain.cancelScheduledValues(now);
        this.mainGainNode.gain.setValueAtTime(this.mainGainNode.gain.value, now);
        this.mainGainNode.gain.linearRampToValueAtTime(state.volume, now + 0.05);
      }
    }

    if (eqBandsChanged) {
      this.prevEqualizerBands = [...state.equalizerBands];
      this.invalidateCrossfadeCurves();
      if (this.eqFilters.length > 0) {
        const now = this.audioContext?.currentTime || 0;
        this.eqFilters.forEach((filter, idx) => {
          if (state.equalizerBands[idx] !== undefined) {
            filter.gain.setValueAtTime(state.equalizerBands[idx], now);
          }
        });
      }
      this.syncPreAmpGain();
    }

    if (spatialChanged) {
      this.prevSpatialAudioEnabled = state.spatialAudioEnabled;
      this.prevSpatialAudioConfig = { ...state.spatialAudioConfig };
      this.applySpatialParams(state.spatialAudioEnabled, state.spatialAudioConfig);
    }

    if (speedChanged) {
      this.prevPlaybackSpeed = state.playbackSpeed;
      this.playbackSpeed = state.playbackSpeed;
      this.audio1.playbackRate = state.playbackSpeed;
      this.audio2.playbackRate = state.playbackSpeed;
    }

    if (trackChanged || isPlayingChanged || qualityChanged) {
      this.prevTrack = state.currentTrack;
      this.prevIsPlaying = state.isPlaying;
      this.prevStreamingQuality = state.streamingQuality;
      this.handlePlaybackStateChange(state.currentTrack, state.isPlaying, state.streamingQuality);
    }
  }

  private handlePlaybackStateChange(currentTrack: Track | null, isPlaying: boolean, streamingQuality: string) {
    const activePlayerInstance = this.activePlayer === 1 ? this.audio1 : this.audio2;

    if (!currentTrack) {
      activePlayerInstance.pause();
      activePlayerInstance.src = '';
      this.stopProgressTimer();
      usePlayerStore.getState().setBuffering(false);
      this.updateMediaSession(null, false);
      return;
    }

    const currentSrc = activePlayerInstance.src;
    const targetSrc = this.getStreamUrlWithParams(currentTrack.streamUrl, streamingQuality);

    this.prefetchedTrackId = null;

    const decodeUrl = (url: string) => {
      try {
        return decodeURIComponent(url);
      } catch (e) {
        return url;
      }
    };

    if (decodeUrl(currentSrc) !== decodeUrl(targetSrc)) {
      if (this.isCrossfading) {
        this.cancelActiveCrossfade();
      }
      activePlayerInstance.src = targetSrc;
      activePlayerInstance.load();
    }

    if (isPlaying) {
      this.initAudioGraph();
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }
      
      this.updateMediaSession(currentTrack, true);
      this.syncPreAmpGain();

      activePlayerInstance.play().catch((e) => {
        console.warn('Playback failed or interrupted:', e);
        if (e.name !== 'AbortError') {
          usePlayerStore.getState().setPlaying(false);
          usePlayerStore.getState().setBuffering(false);
          this.showToast('Playback failed. Please check your network or try another track.', 'error');
        }
      });
      this.startProgressTimer();
    } else {
      activePlayerInstance.pause();
      this.stopProgressTimer();
      usePlayerStore.getState().setBuffering(false);
      this.updateMediaSession(currentTrack, false);
    }
  }

  private getStreamUrlWithParams(trackUrl: string, quality: string) {
    const base = trackUrl.startsWith('http') ? trackUrl : `${api.baseUrl}${trackUrl}`;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}quality=${quality}`;
  }

  private setupUnlockListeners() {
    const unlock = () => {
      this.initAudioGraph();
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  public initAudioGraph() {
    if (this.audioContext) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass({ sampleRate: 48000 });
    this.audioContext = ctx;

    const measuredLatency = Math.round(
      ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000
    );
    usePlayerStore.setState({ measuredAudioLatency: measuredLatency });

    if (!this.sourceNodesCreated) {
      const source1 = ctx.createMediaElementSource(this.audio1);
      const source2 = ctx.createMediaElementSource(this.audio2);

      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      this.gainNode1 = gain1;
      this.gainNode2 = gain2;

      source1.connect(gain1);
      source2.connect(gain2);

      const filters: BiquadFilterNode[] = [];
      EQ_FREQUENCIES.forEach((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        if (idx === 0) filter.type = 'lowshelf';
        else if (idx === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = idx === 0 || idx === EQ_FREQUENCIES.length - 1 ? 0.7 : 1.4;
        filter.gain.value = 0;
        filters.push(filter);
      });

      gain1.connect(filters[0]);
      gain2.connect(filters[0]);

      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }

      this.eqFilters = filters;

      this.pannerNode = ctx.createPanner();
      this.pannerNode.panningModel = 'HRTF';
      this.pannerNode.distanceModel = 'inverse';

      this.convolverNode = ctx.createConvolver();

      this.reverbGainNode = ctx.createGain();
      this.reverbGainNode.gain.value = 0;

      this.dryGainNode = ctx.createGain();
      this.dryGainNode.gain.value = 1;

      this.convolverNode.connect(this.reverbGainNode);

      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.mainGainNode = ctx.createGain();
      this.mainGainNode.gain.value = 1.0;

      this.limiterNode = ctx.createDynamicsCompressor();
      this.limiterNode.threshold.setValueAtTime(-3.0, ctx.currentTime);
      this.limiterNode.knee.setValueAtTime(6.0, ctx.currentTime);
      this.limiterNode.ratio.setValueAtTime(4.0, ctx.currentTime);
      this.limiterNode.attack.setValueAtTime(0.001, ctx.currentTime);
      this.limiterNode.release.setValueAtTime(0.15, ctx.currentTime);

      this.analyserNode.connect(this.mainGainNode);
      this.mainGainNode.connect(this.limiterNode);
      this.limiterNode.connect(ctx.destination);

      this.sourceNodesCreated = true;
    }

    const storeState = usePlayerStore.getState();
    const preAmp = this.getPreAmpGain();
    const currentMultiplier = this.getLoudnessMultiplier(storeState.currentTrack);
    const targetGain = preAmp * currentMultiplier;

    if (this.gainNode1 && this.gainNode2) {
      this.gainNode1.gain.setValueAtTime(this.activePlayer === 1 ? targetGain : 0.0, ctx.currentTime);
      this.gainNode2.gain.setValueAtTime(this.activePlayer === 2 ? targetGain : 0.0, ctx.currentTime);
    }

    if (this.mainGainNode) {
      this.mainGainNode.gain.setValueAtTime(storeState.volume, ctx.currentTime);
    }

    if (this.eqFilters.length > 0) {
      this.eqFilters.forEach((filter, idx) => {
        if (storeState.equalizerBands[idx] !== undefined) {
          filter.gain.setValueAtTime(storeState.equalizerBands[idx], ctx.currentTime);
        }
      });
    }

    this.applySpatialParams(storeState.spatialAudioEnabled, storeState.spatialAudioConfig);
  }

  private updateAudioConnections() {
    if (this.eqFilters.length === 0 || !this.analyserNode) return;
    
    const eqOutput = this.eqFilters[this.eqFilters.length - 1];
    
    if (this.analyserNode) {
      try { eqOutput.disconnect(this.analyserNode); } catch (e) {}
    }
    if (this.dryGainNode) {
      try { eqOutput.disconnect(this.dryGainNode); } catch (e) {}
      try { this.dryGainNode.disconnect(this.pannerNode!); } catch (e) {}
    }
    if (this.convolverNode) {
      try { eqOutput.disconnect(this.convolverNode); } catch (e) {}
      try { this.convolverNode.disconnect(this.reverbGainNode!); } catch (e) {}
    }
    if (this.reverbGainNode) {
      try { this.reverbGainNode.disconnect(this.pannerNode!); } catch (e) {}
    }
    if (this.pannerNode) {
      try { this.pannerNode.disconnect(this.analyserNode); } catch (e) {}
    }

    const storeState = usePlayerStore.getState();
    
    if (!storeState.spatialAudioEnabled) {
      eqOutput.connect(this.analyserNode);
    } else {
      const roomSize = storeState.spatialAudioConfig.roomSize;
      if (this.dryGainNode && this.convolverNode && this.reverbGainNode && this.pannerNode) {
        eqOutput.connect(this.dryGainNode);
        this.dryGainNode.connect(this.pannerNode);
        
        if (roomSize !== 'none') {
          eqOutput.connect(this.convolverNode);
          this.convolverNode.connect(this.reverbGainNode);
          this.reverbGainNode.connect(this.pannerNode);
        }
        
        this.pannerNode.connect(this.analyserNode);
      } else {
        eqOutput.connect(this.analyserNode);
      }
    }
  }

  private applySpatialParams(enabled: boolean, config: SpatialAudioConfig) {
    if (!this.audioContext || !this.pannerNode || !this.convolverNode || !this.reverbGainNode) return;
    const ctx = this.audioContext;
    
    this.updateAudioConnections();

    if (!enabled) {
      this.pannerNode.positionX.setValueAtTime(0, ctx.currentTime);
      this.pannerNode.positionY.setValueAtTime(0, ctx.currentTime);
      this.pannerNode.positionZ.setValueAtTime(1, ctx.currentTime);
      this.reverbGainNode.gain.setValueAtTime(0, ctx.currentTime);
      return;
    }

    const elevationRad = (config.elevation * Math.PI) / 180;
    const xPos = (config.stereoWidth - 100) / 100;

    this.pannerNode.positionX.setValueAtTime(xPos * 2, ctx.currentTime);
    this.pannerNode.positionY.setValueAtTime(Math.sin(elevationRad) * 2, ctx.currentTime);
    this.pannerNode.positionZ.setValueAtTime(Math.cos(elevationRad) * 2, ctx.currentTime);

    const roomSize = config.roomSize;
    if (roomSize === 'none') {
      this.reverbGainNode.gain.setValueAtTime(0, ctx.currentTime);
    } else {
      let wetVolume = 0.15;
      if (roomSize === 'small') wetVolume = 0.12;
      else if (roomSize === 'medium') wetVolume = 0.2;
      else if (roomSize === 'large') wetVolume = 0.3;

      const buffer = this.getCachedImpulseResponse(ctx, roomSize);
      
      if (this.convolverNode.buffer !== buffer) {
        this.swapConvolverBuffer(buffer, wetVolume);
      } else {
        this.reverbGainNode.gain.setValueAtTime(wetVolume, ctx.currentTime);
      }
    }
  }

  private swapConvolverBuffer(buffer: AudioBuffer, targetWetGain: number) {
    if (!this.audioContext || !this.convolverNode || !this.reverbGainNode) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    this.reverbGainNode.gain.linearRampToValueAtTime(0, now + 0.05);
    
    ctx.suspend().then(() => {
      if (this.convolverNode) {
        this.convolverNode.buffer = buffer;
      }
      ctx.resume().then(() => {
        if (this.reverbGainNode) {
          this.reverbGainNode.gain.linearRampToValueAtTime(targetWetGain, ctx.currentTime + 0.05);
        }
      });
    });
  }

  private prefetchNextTrack() {
    const { queue, activeQueueIndex, repeat, streamingQuality } = usePlayerStore.getState();

    if (repeat === 'one') return;

    const nextIndex = activeQueueIndex + 1;
    if (nextIndex >= queue.length) return;
    const nextTrackObj = queue[nextIndex];

    if (!nextTrackObj || this.prefetchedTrackId === nextTrackObj.id) return;

    const inactivePlayer = this.activePlayer === 1 ? this.audio2 : this.audio1;
    const targetSrc = this.getStreamUrlWithParams(nextTrackObj.streamUrl, streamingQuality);

    inactivePlayer.src = targetSrc;
    inactivePlayer.preload = 'auto';
    inactivePlayer.load();
    this.prefetchedTrackId = nextTrackObj.id;
  }

  private cancelActiveCrossfade() {
    this.currentCrossfadeId++;
    if (this.crossfadeTimeout) {
      clearTimeout(this.crossfadeTimeout);
      this.crossfadeTimeout = null;
    }
    this.isCrossfading = false;

    if (this.activeFadeOutPlayer && this.activeFadeOutEndedListener) {
      this.activeFadeOutPlayer.removeEventListener('ended', this.activeFadeOutEndedListener);
      this.activeFadeOutPlayer = null;
      this.activeFadeOutEndedListener = null;
    }

    const inactivePlayer = this.activePlayer === 1 ? this.audio2 : this.audio1;
    try {
      inactivePlayer.pause();
      inactivePlayer.src = '';
    } catch (e) {
      console.warn('Error clearing inactive player during crossfade cancel:', e);
    }

    if (this.audioContext) {
      const now = this.audioContext.currentTime;
      const preAmp = this.getPreAmpGain();
      const currentTrack = usePlayerStore.getState().currentTrack;
      const targetGain = preAmp * this.getLoudnessMultiplier(currentTrack);

      if (this.gainNode1 && this.gainNode2) {
        this.gainNode1.gain.cancelScheduledValues(now);
        this.gainNode2.gain.cancelScheduledValues(now);
        this.gainNode1.gain.setValueAtTime(this.activePlayer === 1 ? targetGain : 0.0, now);
        this.gainNode2.gain.setValueAtTime(this.activePlayer === 2 ? targetGain : 0.0, now);
      }
    }
  }

  private async triggerCrossfade() {
    const { queue, activeQueueIndex, streamingQuality } = usePlayerStore.getState();
    const nextIndex = activeQueueIndex + 1;
    if (nextIndex >= queue.length) return;

    const nextTrackObj = queue[nextIndex];
    this.isCrossfading = true;
    this.currentCrossfadeId++;
    const activeCfId = this.currentCrossfadeId;

    const fadeOutPlayer = this.activePlayer === 1 ? this.audio1 : this.audio2;
    const fadeInPlayer = this.activePlayer === 1 ? this.audio2 : this.audio1;
    const fadeOutGain = this.activePlayer === 1 ? this.gainNode1 : this.gainNode2;
    const fadeInGain = this.activePlayer === 1 ? this.gainNode2 : this.gainNode1;

    if (!fadeOutPlayer || !fadeInPlayer || !fadeOutGain || !fadeInGain || !this.audioContext) {
      this.isCrossfading = false;
      return;
    }

    const targetSrc = this.getStreamUrlWithParams(nextTrackObj.streamUrl, streamingQuality);

    fadeInPlayer.src = targetSrc;
    fadeInPlayer.playbackRate = this.playbackSpeed;
    fadeInPlayer.load();

    const now = this.audioContext.currentTime;
    const cfDur = this.cachedCrossfadeDuration;
    
    const preAmp = this.getPreAmpGain();
    const fadeOutMultiplier = this.getLoudnessMultiplier(usePlayerStore.getState().currentTrack);
    const fadeInMultiplier = this.getLoudnessMultiplier(nextTrackObj);
    
    const fadeOutTarget = preAmp * fadeOutMultiplier;
    const fadeInTarget = preAmp * fadeInMultiplier;

    fadeOutGain.gain.cancelScheduledValues(now);
    fadeInGain.gain.cancelScheduledValues(now);

    const { fadeOutCurve: baseFadeOut, fadeInCurve: baseFadeIn } = this.getCrossfadeCurves();
    const fadeOutCurve = new Float32Array(baseFadeOut.length);
    const fadeInCurve = new Float32Array(baseFadeIn.length);
    for (let i = 0; i < baseFadeOut.length; i++) {
      fadeOutCurve[i] = baseFadeOut[i] * fadeOutTarget;
      fadeInCurve[i] = baseFadeIn[i] * fadeInTarget;
    }

    fadeOutGain.gain.setValueCurveAtTime(fadeOutCurve, now, cfDur);
    fadeInGain.gain.setValueCurveAtTime(fadeInCurve, now, cfDur);

    try {
      await fadeInPlayer.play();
    } catch (e) {
      console.error('Failed to play crossfaded track:', e);
    }

    if (activeCfId !== this.currentCrossfadeId) return;

    this.activePlayer = this.activePlayer === 1 ? 2 : 1;

    const onFadeOutEnded = () => {
      fadeOutPlayer.removeEventListener('ended', onFadeOutEnded);
      if (this.activeFadeOutPlayer === fadeOutPlayer && this.activeFadeOutEndedListener === onFadeOutEnded) {
        this.activeFadeOutPlayer = null;
        this.activeFadeOutEndedListener = null;
      }
      
      if (activeCfId !== this.currentCrossfadeId) return;

      fadeOutPlayer.pause();
      fadeOutPlayer.src = '';

      usePlayerStore.setState({
        currentTrack: nextTrackObj,
        activeQueueIndex: nextIndex,
      });

      this.isCrossfading = false;
      if (this.crossfadeTimeout) {
        clearTimeout(this.crossfadeTimeout);
        this.crossfadeTimeout = null;
      }

      this.updateMediaSession(nextTrackObj, true);
    };

    this.activeFadeOutPlayer = fadeOutPlayer;
    this.activeFadeOutEndedListener = onFadeOutEnded;
    fadeOutPlayer.addEventListener('ended', onFadeOutEnded);

    if (this.crossfadeTimeout) clearTimeout(this.crossfadeTimeout);
    this.crossfadeTimeout = setTimeout(() => {
      onFadeOutEnded();
    }, (cfDur + 1.0) * 1000);
  }

  private getCrossfadeCurves() {
    if (this.cachedFadeOutCurve && this.cachedFadeInCurve) {
      return { fadeOutCurve: this.cachedFadeOutCurve, fadeInCurve: this.cachedFadeInCurve };
    }
    
    const curveLength = 40;
    const fadeOutCurve = new Float32Array(curveLength);
    const fadeInCurve = new Float32Array(curveLength);
    for (let i = 0; i < curveLength; i++) {
      const t = i / (curveLength - 1);
      fadeOutCurve[i] = Math.cos(t * Math.PI / 2);
      fadeInCurve[i] = Math.sin(t * Math.PI / 2);
    }
    this.cachedFadeOutCurve = fadeOutCurve;
    this.cachedFadeInCurve = fadeInCurve;
    return { fadeOutCurve, fadeInCurve };
  }

  private invalidateCrossfadeCurves() {
    this.cachedFadeOutCurve = null;
    this.cachedFadeInCurve = null;
  }

  private tick = () => {
    const player = this.activePlayer === 1 ? this.audio1 : this.audio2;
    const current = player.currentTime;
    const total = player.duration || 0;
    setTimeValues(current, total);

    const cfDur = this.cachedCrossfadeDuration;
    if (
      total > 0 &&
      cfDur > 0 &&
      current >= total - cfDur &&
      !this.isCrossfading
    ) {
      this.triggerCrossfade();
    }

    if (total > 0 && current >= total * 0.6 && !this.prefetchedTrackId) {
      this.prefetchNextTrack();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private startProgressTimer() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopProgressTimer() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private getCachedImpulseResponse(ctx: AudioContext, roomSize: 'small' | 'medium' | 'large'): AudioBuffer {
    if (this.impulseCache.has(roomSize)) {
      return this.impulseCache.get(roomSize)!;
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
    const buffer = this.createImpulseResponse(ctx, duration, decay);
    this.impulseCache.set(roomSize, buffer);
    return buffer;
  }

  private createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
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
  }

  private updateMediaSession(track: Track | null, isPlaying: boolean) {
    if (!('mediaSession' in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const coverUrl = api.coverUrl(track.coverArtUrl, track.videoId) || '';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => usePlayerStore.getState().setPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => usePlayerStore.getState().setPlaying(false));
    navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().nextTrack());
    navigator.mediaSession.setActionHandler('seekto', (e) => {
      if (e.seekTime != null) {
        this.seek(e.seekTime);
      }
    });
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    useToastStore.getState().addToast(message, type);
  }

  private async handlePlaybackError(audio: HTMLAudioElement) {
    const err = audio.error;
    console.error('[Audio Engine] Playback error event:', err);
    
    if (err) {
      this.showToast('Playback interrupted. Recovering stream...', 'info');
      usePlayerStore.getState().setBuffering(true);
      
      const currentTrack = usePlayerStore.getState().currentTrack;
      if (!currentTrack) return;
      
      const targetSrc = this.getStreamUrlWithParams(currentTrack.streamUrl, usePlayerStore.getState().streamingQuality);
      try {
        const freshSrc = `${targetSrc}${targetSrc.includes('?') ? '&' : '?'}retry=${Date.now()}`;
        console.log('[Audio Engine] Attempting stream recovery from:', freshSrc);
        audio.src = freshSrc;
        audio.load();
        if (usePlayerStore.getState().isPlaying) {
          await audio.play();
        }
      } catch (retryErr) {
        console.error('[Audio Engine] Recovery retry failed:', retryErr);
        usePlayerStore.getState().setPlaying(false);
        usePlayerStore.getState().setBuffering(false);
        this.showToast('Playback failed. Please check your network or try another track.', 'error');
      }
    }
  }

  public async destroy() {
    this.stopProgressTimer();
    this.cancelActiveCrossfade();
    
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (e) {
        console.warn('Error closing AudioContext:', e);
      }
      this.audioContext = null;
    }
    
    this.audio1.pause();
    this.audio1.src = '';
    
    this.audio2.pause();
    this.audio2.src = '';
    
    this.gainNode1 = null;
    this.gainNode2 = null;
    this.eqFilters = [];
    this.pannerNode = null;
    this.convolverNode = null;
    this.reverbGainNode = null;
    this.dryGainNode = null;
    this.analyserNode = null;
    this.mainGainNode = null;
    this.limiterNode = null;
    this.sourceNodesCreated = false;
    this.prefetchedTrackId = null;
    this.impulseCache.clear();
  }

  public seek(time: number) {
    const activePlayerInstance = this.activePlayer === 1 ? this.audio1 : this.audio2;
    activePlayerInstance.currentTime = time;
    setTimeValues(time, activePlayerInstance.duration || 0);
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }
}

// HMR Cleanup: destroy previous instance if it exists
if ((window as any).__audioEngineInstance__) {
  try {
    (window as any).__audioEngineInstance__.destroy();
  } catch (e) {
    console.warn('Error destroying old audioEngine instance during HMR:', e);
  }
}

export const audioEngine = new AudioEngine();
(window as any).__audioEngineInstance__ = audioEngine;

export const closeAudioEngine = async () => {
  await audioEngine.destroy();
};

export const useAudioEngine = () => {
  const seek = useCallback((time: number) => {
    audioEngine.seek(time);
  }, []);

  const getAnalyser = useCallback((): AnalyserNode | null => {
    return audioEngine.getAnalyser();
  }, []);

  return { seek, getAnalyser };
};
