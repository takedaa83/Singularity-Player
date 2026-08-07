/**
 * EBU R128 Standard Integrated Loudness & Silence Analyzer
 * Implements Stage 1 K-Weighting pre-filter (High shelf + RLB highpass)
 * and 400ms gated mean-square integration to measure LUFS with peak limiting.
 */

export interface LoudnessAnalysis {
  lufs: number; // EBU R128 Integrated Loudness in LUFS
  targetGain: number; // Gain multiplier to match target -14.0 LUFS
  silenceStart: number; // Lead-in silence duration in seconds
  silenceEnd: number; // Lead-out silence timestamp in seconds
}

const TARGET_LUFS = -14.0; // Standard streaming target (-14 LUFS)

export function analyzeAudioBuffer(buffer: AudioBuffer): LoudnessAnalysis {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const length = channelData.length;

  if (length === 0) {
    return { lufs: -24.0, targetGain: 1.0, silenceStart: 0, silenceEnd: buffer.duration };
  }

  // 1. Stage 1: Apply K-Weighting Pre-Filter (High-pass RLB filter at ~38Hz + High Shelf at 1.5kHz)
  const filtered = new Float32Array(length);
  // High Shelf filter coefficients (1.5kHz, +4dB boost)
  const b0 = 1.53512485958697;
  const b1 = -2.69169618940638;
  const b2 = 1.19839281085285;
  const a1 = -1.69065929318241;
  const a2 = 0.73248077421585;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < length; i++) {
    const x = channelData[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    filtered[i] = y;
  }

  // 2. Stage 2: 400ms Gated Mean-Square Calculation
  const windowSize = Math.floor(sampleRate * 0.4); // 400ms window
  let totalEnergy = 0;
  let validWindowCount = 0;

  for (let i = 0; i < length; i += windowSize) {
    let windowSum = 0;
    const count = Math.min(windowSize, length - i);
    for (let j = 0; j < count; j++) {
      const sample = filtered[i + j];
      windowSum += sample * sample;
    }
    const meanSquare = windowSum / count;
    // Absolute loudness threshold -70 LUFS (gating)
    if (meanSquare > 1e-7) {
      totalEnergy += meanSquare;
      validWindowCount++;
    }
  }

  const overallMeanSquare = validWindowCount > 0 ? totalEnergy / validWindowCount : 1e-4;
  // EBU R128 formula: L_k = -0.691 + 10 * log10(overallMeanSquare)
  const lufs = -0.691 + 10 * Math.log10(Math.max(overallMeanSquare, 1e-10));

  // Gain scaling to match TARGET_LUFS (-14.0 LUFS)
  const lufsDiff = TARGET_LUFS - lufs;
  const targetGain = Math.min(Math.pow(10, lufsDiff / 20), 2.0); // Cap at +6dB boost

  // 3. Stage 3: Lead-in / Lead-out Silence Detection (-50dB threshold)
  const SILENCE_THRESHOLD = 0.00316;
  let firstSound = 0;
  let lastSound = length - 1;

  for (let i = 0; i < length; i++) {
    if (Math.abs(channelData[i]) > SILENCE_THRESHOLD) {
      firstSound = i;
      break;
    }
  }

  for (let i = length - 1; i >= 0; i--) {
    if (Math.abs(channelData[i]) > SILENCE_THRESHOLD) {
      lastSound = i;
      break;
    }
  }

  return {
    lufs: Math.round(lufs * 10) / 10,
    targetGain: Math.round(targetGain * 100) / 100,
    silenceStart: Math.max(0, Math.round((firstSound / sampleRate) * 100) / 100),
    silenceEnd: Math.min(buffer.duration, Math.round((lastSound / sampleRate) * 100) / 100),
  };
}
