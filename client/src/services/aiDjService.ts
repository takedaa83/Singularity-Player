/**
 * AI Radio DJ Voiceover Engine
 * Synthesizes natural, contextual DJ commentary and track introductions
 * using the browser's native Web Speech Synthesis API.
 */

import { Track } from '../types';

export interface DjConfig {
  enabled: boolean;
  frequency: 'every_track' | 'every_3_tracks' | 'genre_switch' | 'rare';
  speechRate: number; // 0.8 to 1.3
  speechPitch: number; // 0.8 to 1.2
  volume: number; // 0.0 to 1.0
  voiceName?: string;
}

const DEFAULT_DJ_CONFIG: DjConfig = {
  enabled: false,
  frequency: 'every_3_tracks',
  speechRate: 1.05,
  speechPitch: 1.0,
  volume: 0.85,
};

class AiDjService {
  private config: DjConfig = DEFAULT_DJ_CONFIG;
  private tracksPlayedCount = 0;
  private lastGenre: string | null = null;
  private isSpeaking = false;

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem('singularity_dj_config');
      if (saved) {
        this.config = { ...DEFAULT_DJ_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      this.config = DEFAULT_DJ_CONFIG;
    }
  }

  public saveConfig(newConfig: Partial<DjConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('singularity_dj_config', JSON.stringify(this.config));
    } catch {}
  }

  public getConfig(): DjConfig {
    return { ...this.config };
  }

  public shouldCommentate(nextTrack: Track): boolean {
    if (!this.config.enabled) return false;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

    this.tracksPlayedCount++;

    if (this.config.frequency === 'every_track') return true;
    if (this.config.frequency === 'every_3_tracks' && this.tracksPlayedCount % 3 === 0) return true;
    if (this.config.frequency === 'rare' && this.tracksPlayedCount % 6 === 0) return true;

    if (this.config.frequency === 'genre_switch') {
      const currentGenre = (nextTrack.genre || 'Music').toLowerCase();
      if (this.lastGenre && this.lastGenre !== currentGenre) {
        this.lastGenre = currentGenre;
        return true;
      }
      this.lastGenre = currentGenre;
    }

    return false;
  }

  public generateCommentaryText(track: Track, prevTrack?: Track | null): string {
    const artist = track.artist || 'the artist';
    const title = track.title || 'this track';

    const intros = [
      `Up next on Singularity Radio, here is ${artist} with ${title}.`,
      `Spinning next, ${title} by ${artist}. Enjoy the sound.`,
      `Keeping the energy flowing, here's ${title} from ${artist}.`,
      `Next up in your queue, let's dive into ${title} by ${artist}.`,
      `Switching gears now. Here is ${artist} with ${title}.`,
    ];

    if (prevTrack && prevTrack.artist === track.artist) {
      return `Sticking with ${artist}, here is ${title}.`;
    }

    const randomIndex = Math.floor(Math.random() * intros.length);
    return intros[randomIndex];
  }

  public async speakTrackIntro(track: Track, prevTrack?: Track | null): Promise<void> {
    if (!this.config.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const text = this.generateCommentaryText(track, prevTrack);

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.config.speechRate;
        utterance.pitch = this.config.speechPitch;
        utterance.volume = this.config.volume;

        const voices = window.speechSynthesis.getVoices();
        if (this.config.voiceName) {
          const selected = voices.find((v) => v.name === this.config.voiceName);
          if (selected) utterance.voice = selected;
        } else {
          // Default to high-quality English voice
          const naturalVoice = voices.find(
            (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
          );
          if (naturalVoice) utterance.voice = naturalVoice;
        }

        this.isSpeaking = true;

        utterance.onend = () => {
          this.isSpeaking = false;
          resolve();
        };

        utterance.onerror = () => {
          this.isSpeaking = false;
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        this.isSpeaking = false;
        resolve();
      }
    });
  }

  public stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }
}

export const aiDjService = new AiDjService();
