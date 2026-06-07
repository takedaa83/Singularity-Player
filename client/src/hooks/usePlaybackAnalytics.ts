import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { usePlaybackTime } from './usePlaybackTime';
import { useLibraryDB } from './useLibraryDB';
import { PlaySession } from '../types';

export const usePlaybackAnalytics = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const { currentTime, duration } = usePlaybackTime();
  const { recordPlaySession, saveTrack } = useLibraryDB();

  const activeTrackIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Write session to database
  const saveSession = async (trackId: string, durationSec: number, totalDuration: number) => {
    if (durationSec < 2) return; // Ignore very short clicks

    const completed = durationSec >= totalDuration * 0.8;
    const skipped = durationSec < totalDuration * 0.3;

    const session: Omit<PlaySession, 'id'> = {
      trackId,
      startTime: startTimeRef.current,
      duration: Math.round(durationSec),
      completed,
      skipped,
    };

    try {
      await recordPlaySession(session);

      // Update Track record stats
      const db = await import('../lib/db').then((m) => m.initDB());
      const track = await db.get('tracks', trackId);
      if (track) {
        track.playCount = (track.playCount || 0) + (completed ? 1 : 0);
        track.skipCount = (track.skipCount || 0) + (skipped ? 1 : 0);
        track.lastPlayedAt = Date.now();
        track.totalListenDuration = (track.totalListenDuration || 0) + Math.round(durationSec);
        await saveTrack(track);
      }
    } catch (err) {
      console.error('Failed to save playback session:', err);
    }
  };

  // Track accumulator based on currentTime ticks
  useEffect(() => {
    if (!currentTrack) {
      activeTrackIdRef.current = null;
      return;
    }

    // Initialize state on new track
    if (activeTrackIdRef.current !== currentTrack.id) {
      // If we were tracking a previous track, save its session
      if (activeTrackIdRef.current) {
        saveSession(activeTrackIdRef.current, accumulatedTimeRef.current, lastTimeRef.current || 1);
      }

      activeTrackIdRef.current = currentTrack.id;
      startTimeRef.current = Date.now();
      accumulatedTimeRef.current = 0;
      lastTimeRef.current = currentTime;
    }

    if (isPlaying) {
      const delta = currentTime - lastTimeRef.current;
      // Normal tick: delta should be close to EMIT_INTERVAL (~0.033s)
      if (delta > 0 && delta < 2.0) {
        accumulatedTimeRef.current += delta;
      }
      lastTimeRef.current = currentTime;
    }
  }, [currentTime, isPlaying, currentTrack]);

  // Handle page unloading / unmounting
  useEffect(() => {
    return () => {
      if (activeTrackIdRef.current && accumulatedTimeRef.current > 2) {
        saveSession(activeTrackIdRef.current, accumulatedTimeRef.current, lastTimeRef.current || 1);
      }
    };
  }, []);
};

export default usePlaybackAnalytics;
