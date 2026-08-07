/**
 * Microphone Acoustic Song Recognizer Service
 * Captures microphone audio using getUserMedia, extracts FFT frequency peaks,
 * and matches them against IndexedDB Shazam signatures.
 */

import { generateSignatureFromBuffer, matchSignature } from '../utils/shazamSignature';
import { initDB } from '../lib/db';
import { Track } from '../types';

export interface RecognitionResult {
  matchedTrack: Track | null;
  confidence: number;
}

export async function recognizeAudioFromMic(): Promise<RecognitionResult> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone access is not supported by your browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  source.connect(analyser);

  // Capture 4 seconds of microphone audio
  const sampleRate = audioCtx.sampleRate;
  const durationSec = 4;
  const bufferLength = sampleRate * durationSec;
  const micBuffer = audioCtx.createBuffer(1, bufferLength, sampleRate);
  const channelData = micBuffer.getChannelData(0);

  const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
  let recordedSamples = 0;

  return new Promise((resolve) => {
    scriptProcessor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < input.length; i++) {
        if (recordedSamples < bufferLength) {
          channelData[recordedSamples] = input[i];
          recordedSamples++;
        }
      }

      if (recordedSamples >= bufferLength) {
        scriptProcessor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();

        // Match extracted signature against IndexedDB track database
        (async () => {
          const micSignature = generateSignatureFromBuffer(micBuffer);
          const db = await initDB();
          const allTracks = await db.getAll('tracks');

          let bestMatch: Track | null = null;
          let highestConfidence = 0;

          for (const track of allTracks) {
            if (track.shazamSignature) {
              const confidence = matchSignature(micSignature, track.shazamSignature);
              if (confidence > highestConfidence && confidence >= 40) {
                highestConfidence = confidence;
                bestMatch = track;
              }
            }
          }

          resolve({ matchedTrack: bestMatch, confidence: highestConfidence });
        })();
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
  });
}
