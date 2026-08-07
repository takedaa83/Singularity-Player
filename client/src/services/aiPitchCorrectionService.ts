/**
 * Production YIN Pitch Autocorrelation & Key Quantization Engine
 * Implements full YIN fundamental frequency (F0) detection algorithm:
 * 1. Difference function d(tau)
 * 2. Cumulative mean normalized difference d'(tau)
 * 3. Absolute thresholding & parabolic interpolation of lag peaks
 * 4. Equal-tempered MIDI scale quantization F = 440 * 2^((n-69)/12)
 */

export interface PitchCorrectionConfig {
  enabled: boolean;
  scale: 'chromatic' | 'c_major' | 'a_minor' | 'g_major' | 'f_major';
  retuneSpeed: number; // 0 (natural) to 1 (hard T-Pain autotune)
}

const SCALE_NOTES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  c_major: [0, 2, 4, 5, 7, 9, 11],
  a_minor: [9, 11, 0, 2, 4, 5, 7],
  g_major: [7, 9, 11, 0, 2, 4, 6],
  f_major: [5, 7, 9, 10, 0, 2, 4],
};

class AiPitchCorrectionService {
  private config: PitchCorrectionConfig = {
    enabled: false,
    scale: 'c_major',
    retuneSpeed: 0.85,
  };

  public setConfig(cfg: Partial<PitchCorrectionConfig>) {
    this.config = { ...this.config, ...cfg };
  }

  /**
   * YIN Fundamental Frequency (F0) Estimation
   * Computes the exact fundamental frequency of a PCM audio buffer.
   */
  public detectFundamentalFrequency(buffer: Float32Array, sampleRate: number): number {
    const threshold = 0.15; // YIN absolute threshold
    const bufferSize = buffer.length;
    const halfSize = Math.floor(bufferSize / 2);
    const yinBuffer = new Float32Array(halfSize);

    // Step 1: Difference function d(tau)
    for (let tau = 0; tau < halfSize; tau++) {
      let deltaSum = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        deltaSum += delta * delta;
      }
      yinBuffer[tau] = deltaSum;
    }

    // Step 2: Cumulative mean normalized difference d'(tau)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] = (yinBuffer[tau] * tau) / (runningSum || 1);
    }

    // Step 3: Absolute thresholding
    let tauEstimate = -1;
    for (let tau = 2; tau < halfSize; tau++) {
      if (yinBuffer[tau] < threshold) {
        while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) return 0; // No periodic pitch detected

    // Step 4: Parabolic interpolation for sub-sample accuracy
    let betterTau = tauEstimate;
    const x0 = tauEstimate > 0 ? tauEstimate - 1 : tauEstimate;
    const x2 = tauEstimate + 1 < halfSize ? tauEstimate + 1 : tauEstimate;

    if (x0 !== tauEstimate && x2 !== tauEstimate) {
      const s0 = yinBuffer[x0];
      const s1 = yinBuffer[tauEstimate];
      const s2 = yinBuffer[x2];
      betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1);
    }

    return sampleRate / betterTau;
  }

  /**
   * Retunes detected frequency to nearest scale MIDI note
   */
  public quantizeFrequency(freq: number): number {
    if (!this.config.enabled || freq <= 0) return freq;

    // Convert Hz to MIDI Note
    const midiNote = 69 + 12 * Math.log2(freq / 440);
    const noteInOctave = Math.round(midiNote) % 12;
    const allowedNotes = SCALE_NOTES[this.config.scale] || SCALE_NOTES.chromatic;

    let closestNote = allowedNotes[0];
    let minDiff = Math.abs(noteInOctave - allowedNotes[0]);

    allowedNotes.forEach((n) => {
      const diff = Math.abs(noteInOctave - n);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = n;
      }
    });

    const octave = Math.floor(midiNote / 12);
    const targetMidi = octave * 12 + closestNote;
    const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);

    // Exponential smoothing retune interpolation
    return freq + (targetFreq - freq) * this.config.retuneSpeed;
  }

  public getConfig(): PitchCorrectionConfig {
    return { ...this.config };
  }
}

export const aiPitchCorrectionService = new AiPitchCorrectionService();
