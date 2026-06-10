import React, { useState, useEffect, useRef } from 'react';
import { Mic, X, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateShazamSignature } from '../../utils/shazamSignature';
import { api } from '../../utils/api';
import { useToastStore } from '../../hooks/useToast';
import { usePlayerStore } from '../../stores/playerStore';

interface AudioRecognizerProps {
  isOpen: boolean;
  onClose: () => void;
  onRecognized: (query: string, track: any) => void;
}

export const AudioRecognizer: React.FC<AudioRecognizerProps> = ({
  isOpen,
  onClose,
  onRecognized
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dbLevel, setDbLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { addToast } = useToastStore();
  const { playTrack } = usePlayerStore();

  const maxDurationSeconds = 10;
  const sampleRate = 16000;

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopRecordingAndCleanup();
    };
  }, []);

  async function startRecording() {
    pcmChunksRef.current = [];
    setProgress(0);
    setIsRecording(true);
    setIsProcessing(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // ScriptProcessor is used for wide browser support
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const maxSamples = sampleRate * maxDurationSeconds;
      let samplesRecorded = 0;

      processor.onaudioprocess = (e) => {
        const inputChannel = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(inputChannel));
        samplesRecorded += inputChannel.length;

        const currentProgress = (samplesRecorded / maxSamples) * 100;
        setProgress(Math.min(currentProgress, 100));

        if (samplesRecorded >= maxSamples) {
          handleFinishRecording();
        }
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      // Web Audio level meter loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Map average magnitude 0-255 to a dB-like height
        setDbLevel(average / 128);
        animationFrameRef.current = requestAnimationFrame(checkLevel);
      };
      checkLevel();

      // Absolute safety timeout
      recordingTimerRef.current = window.setTimeout(() => {
        handleFinishRecording();
      }, maxDurationSeconds * 1000 + 500);

    } catch (err: any) {
      console.error('Failed to access microphone:', err);
      addToast(
        err.name === 'NotAllowedError' 
          ? 'Microphone permission denied. Please allow mic access in your settings.' 
          : 'Could not access microphone. Verify it is connected.', 
        'error'
      );
      setIsRecording(false);
      onClose();
    }
  }

  function handleFinishRecording() {
    setIsRecording(false);
    setIsProcessing(true);
    stopRecordingAndCleanup();
    processAudioAndRecognize();
  }

  function stopRecordingAndCleanup() {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  async function processAudioAndRecognize() {
    const chunks = pcmChunksRef.current;
    if (chunks.length === 0) {
      addToast('No audio recorded. Please try again.', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      // 1. Flatten float chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const floatPcm = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        floatPcm.set(chunk, offset);
        offset += chunk.length;
      }

      // 2. Convert Float32Array [-1.0, 1.0] to Int16Array [-32768, 32767]
      const int16Pcm = new Int16Array(totalLength);
      for (let i = 0; i < totalLength; i++) {
        const sample = Math.max(-1.0, Math.min(1.0, floatPcm[i]));
        int16Pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      // 3. Generate base64 Shazam DejaVu signature
      console.log(`[AudioRecognizer] Generating signature for ${totalLength} samples...`);
      const signature = generateShazamSignature(int16Pcm);
      const durationMs = Math.round((totalLength / sampleRate) * 1000);

      // 4. Send signature to backend route
      console.log('[AudioRecognizer] Resolving track from backend...');
      const response = await fetch(`${api.baseUrl}/api/search/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signature,
          sampleDurationMs: durationMs
        })
      });

      if (response.status === 404) {
        addToast('No match found. Please try moving closer to the speaker.', 'info');
        setIsProcessing(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Recognition server returned status ${response.status}`);
      }

      const match = await response.json();
      console.log('[AudioRecognizer] Match succeeded:', match);

      addToast(`Recognized: "${match.artist} - ${match.title}"`, 'success');
      
      if (match.resolvedTrack) {
        onRecognized(`${match.artist} - ${match.title}`, match.resolvedTrack);
      } else {
        // Fallback search suggestions if stream URL resolved failed
        onRecognized(`${match.artist} - ${match.title}`, null);
      }

    } catch (e: any) {
      console.error('[AudioRecognizer] Recognition failed:', e);
      addToast('Recognition failed. Please check your network connection.', 'error');
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startRecording();
    } else {
      stopRecordingAndCleanup();
      setIsRecording(false);
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-8 flex flex-col items-center shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        >
          {/* Close button */}
          <button
            onClick={() => {
              stopRecordingAndCleanup();
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2 mt-2">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            Identify Song
          </h3>
          <p className="text-xs text-neutral-400 text-center mt-2 max-w-[240px]">
            Keep your device close to the audio source playing the music.
          </p>

          {/* Animated visualizer circle */}
          <div className="relative w-44 h-44 flex items-center justify-center my-10">
            {/* Pulsing visual circles */}
            {isRecording && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.25 + dbLevel * 0.4, 1], opacity: [0.15, 0.03, 0.15] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
                <motion.div
                  animate={{ scale: [1, 1.1 + dbLevel * 0.2, 1], opacity: [0.3, 0.08, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.2 }}
                  className="absolute inset-4 rounded-full bg-primary/20"
                />
              </>
            )}

            <div className="relative w-32 h-32 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center z-10 overflow-hidden shadow-inner">
              {isRecording ? (
                <div className="flex flex-col items-center">
                  <Mic className="w-10 h-10 text-primary animate-pulse" />
                  <span className="text-[10px] text-primary/80 font-semibold tracking-widest mt-2 uppercase">
                    Listening
                  </span>
                </div>
              ) : isProcessing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <span className="text-[10px] text-primary/80 font-semibold tracking-widest mt-2 uppercase">
                    Analyzing
                  </span>
                </div>
              ) : (
                <Mic className="w-10 h-10 text-neutral-500" />
              )}

              {/* Progress ring/circle */}
              {isRecording && (
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="61"
                    stroke="var(--primary)"
                    strokeWidth="3"
                    fill="transparent"
                    strokeDasharray={383.2}
                    strokeDashoffset={383.2 - (383.2 * progress) / 100}
                    className="transition-all duration-100 ease-linear"
                    style={{ transformOrigin: 'center', transform: 'scale(1.25)' }}
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Bottom status text */}
          <div className="w-full flex flex-col items-center">
            {isRecording ? (
              <div className="flex flex-col items-center gap-1.5 w-full">
                <div className="w-full max-w-[200px] h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">
                  {(progress / 10).toFixed(1)}s / {maxDurationSeconds.toFixed(1)}s
                </span>
              </div>
            ) : isProcessing ? (
              <span className="text-sm font-medium text-neutral-300 animate-pulse">
                Comparing audio fingerprints...
              </span>
            ) : (
              <button
                onClick={startRecording}
                className="px-6 py-2 rounded-full bg-primary hover:bg-primary-hover active:scale-95 text-black text-xs font-bold transition-all shadow-lg shadow-primary/20"
              >
                Try Again
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
