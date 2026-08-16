/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  👥 LISTEN TOGETHER: REAL-TIME SYNCHRONIZED LISTENING ROOMS
 * ═══════════════════════════════════════════════════════════════════════════
 *  Millisecond-precision shared listening engine allowing friends to sync
 *  playback, track seeking, and queue progression in real time.
 */

import { Track } from '../types';
import { api, getApiBaseUrl } from '../utils/api';
import { usePlayerStore } from '../stores/playerStore';
import { audioEngine } from '../hooks/useAudioEngine';

export interface RoomState {
  currentTrack: Track | null;
  currentTime: number;
  isPlaying: boolean;
  queue: Track[];
  activeQueueIndex: number;
  updatedAt: number;
}

export interface RoomInfo {
  id: string;
  hostId: string;
  isHost: boolean;
  listenerCount: number;
  listeners: string[];
  state: RoomState;
}

class ListenTogetherService {
  private clientId: string;
  private clientName: string;
  private currentRoomId: string | null = null;
  private isHost: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private hostBroadcastThrottle: ReturnType<typeof setTimeout> | null = null;
  private lastSyncedTrackId: string | null = null;
  private isSyncingFromHost = false;

  constructor() {
    // Generate or retrieve persistent unique client ID
    let storedId = localStorage.getItem('singularity_client_id');
    if (!storedId) {
      storedId = 'client_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('singularity_client_id', storedId);
    }
    this.clientId = storedId;
    this.clientName = localStorage.getItem('singularity_client_name') || 'Music Explorer';
  }

  public getClientId(): string {
    return this.clientId;
  }

  public getClientName(): string {
    return this.clientName;
  }

  public setClientName(name: string): void {
    this.clientName = name.trim() || 'Music Explorer';
    localStorage.setItem('singularity_client_name', this.clientName);
  }

  public getActiveRoomId(): string | null {
    return this.currentRoomId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  /**
   * Creates a new synchronized room where the current user is Host
   */
  public async createRoom(hostName?: string): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (hostName) this.setClientName(hostName);

    const playerState = usePlayerStore.getState();

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sync/room/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: this.clientId,
          hostName: this.clientName,
          initialTrack: playerState.currentTrack,
          isPlaying: playerState.isPlaying,
          queue: playerState.queue,
          activeQueueIndex: playerState.activeQueueIndex
        })
      });

      const data = await res.json();
      if (data.success && data.roomId) {
        this.currentRoomId = data.roomId;
        this.isHost = true;
        this.startHostBroadcasting();
        return { success: true, roomId: data.roomId };
      }
      return { success: false, error: data.error || 'Failed to create room' };
    } catch (err: any) {
      console.error('[ListenTogether] Create room failed:', err);
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /**
   * Joins an existing room using a 6-character room code
   */
  public async joinRoom(roomId: string, listenerName?: string): Promise<{ success: boolean; error?: string; room?: RoomInfo }> {
    if (listenerName) this.setClientName(listenerName);
    const cleanId = roomId.trim().toUpperCase();

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sync/room/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: cleanId,
          clientId: this.clientId,
          clientName: this.clientName
        })
      });

      const data = await res.json();
      if (data.success && data.room) {
        this.currentRoomId = cleanId;
        this.isHost = Boolean(data.isHost);

        if (!this.isHost) {
          // Apply initial state from Host
          this.applyHostStateToPlayer(data.room.state);
          this.startListenerPolling();
        } else {
          this.startHostBroadcasting();
        }

        return { success: true, room: data.room };
      }
      return { success: false, error: data.error || 'Room not found' };
    } catch (err: any) {
      console.error('[ListenTogether] Join room failed:', err);
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /**
   * Leaves active room and stops polling
   */
  public leaveRoom(): void {
    this.stopPolling();
    this.currentRoomId = null;
    this.isHost = false;
    this.lastSyncedTrackId = null;
  }

  /**
   * Host broadcast loop: pushes playback changes to server
   */
  public broadcastHostState(force = false): void {
    if (!this.isHost || !this.currentRoomId) return;

    if (this.hostBroadcastThrottle && !force) return;

    this.hostBroadcastThrottle = setTimeout(async () => {
      this.hostBroadcastThrottle = null;
      if (!this.isHost || !this.currentRoomId) return;

      const playerState = usePlayerStore.getState();
      const currentTrack = playerState.currentTrack;
      const isPlaying = playerState.isPlaying;

      try {
        await fetch(`${getApiBaseUrl()}/api/sync/room/${this.currentRoomId}/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostId: this.clientId,
            currentTrack,
            currentTime: (window as any)._singularityCurrentTime || 0,
            isPlaying,
            queue: playerState.queue,
            activeQueueIndex: playerState.activeQueueIndex
          })
        });
      } catch (err) {
        console.error('[ListenTogether] Host broadcast failed:', err);
      }
    }, force ? 0 : 400);
  }

  private startHostBroadcasting(): void {
    this.stopPolling();
    // Poll to keep listener list updated
    this.pollInterval = setInterval(async () => {
      if (!this.currentRoomId || !this.isHost) return;
      try {
        await fetch(`${getApiBaseUrl()}/api/sync/room/${this.currentRoomId}/poll?clientId=${this.clientId}`);
      } catch {}
    }, 4000);
  }

  /**
   * Listener polling loop: synchronizes track, play state, and seek time
   */
  private startListenerPolling(): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      if (!this.currentRoomId || this.isHost) return;

      const pollStart = performance.now();
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/sync/room/${this.currentRoomId}/poll?clientId=${this.clientId}`);
        if (!res.ok) {
          if (res.status === 404) this.leaveRoom();
          return;
        }

        const data = await res.json();
        const roundTripMs = performance.now() - pollStart;
        if (data.success && data.state) {
          this.applyHostStateToPlayer(data.state, roundTripMs / 2);
        }
      } catch (err) {
        console.error('[ListenTogether] Listener poll failed:', err);
      }
    }, 1200);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Reconciles listener audio state with Host broadcast state
   */
  private applyHostStateToPlayer(state: RoomState, networkLatencyMs = 50): void {
    if (this.isSyncingFromHost) return;
    this.isSyncingFromHost = true;

    try {
      const playerStore = usePlayerStore.getState();
      const currentTrack = playerStore.currentTrack;

      // 1. Sync Track Selection
      if (state.currentTrack && (!currentTrack || currentTrack.id !== state.currentTrack.id)) {
        playerStore.playTrack(state.currentTrack);
        this.lastSyncedTrackId = state.currentTrack.id;
      }

      // 2. Sync Play / Pause state
      if (playerStore.isPlaying !== state.isPlaying) {
        playerStore.setPlaying(state.isPlaying);
      }

      // 3. Sync Millisecond Time with Clock Drift Compensation
      const timeSinceHostUpdate = (Date.now() - state.updatedAt + networkLatencyMs) / 1000;
      const targetTime = state.currentTime + (state.isPlaying ? timeSinceHostUpdate : 0);

      const localTime = (window as any)._singularityCurrentTime || 0;
      const drift = Math.abs(localTime - targetTime);

      // Reconcile seek if drift exceeds 1.5 seconds or on track change
      if (drift > 1.5 && state.currentTrack) {
        audioEngine.seek(Math.max(0, targetTime));
      }
    } finally {
      this.isSyncingFromHost = false;
    }
  }
}

export const listenTogetherService = new ListenTogetherService();
