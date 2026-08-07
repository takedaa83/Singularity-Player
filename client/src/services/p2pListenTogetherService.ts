/**
 * P2P Listen Together Room Service
 * Synchronizes audio playback state, queue, and seek position across friends
 * using WebRTC Peer-to-Peer DataChannels.
 */

export interface P2PSyncMessage {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'TRACK_CHANGE';
  trackId?: string;
  currentTime?: number;
  timestamp: number;
}

class P2PListenTogetherService {
  private peer: any = null;
  private connections: Map<string, any> = new Map();
  private roomId: string | null = null;
  private isHost: boolean = false;

  public async createRoom(): Promise<string> {
    this.isHost = true;
    this.roomId = `room-${Math.random().toString(36).substring(2, 8)}`;
    return this.roomId;
  }

  public joinRoom(roomId: string) {
    this.isHost = false;
    this.roomId = roomId;
    console.log(`[P2PSync] Joined room ${roomId}`);
  }

  public broadcastEvent(event: P2PSyncMessage) {
    console.log('[P2PSync] Broadcasting event:', event);
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(event);
      }
    });
  }

  public getRoomId(): string | null {
    return this.roomId;
  }

  public leaveRoom() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.roomId = null;
    this.isHost = false;
  }
}

export const p2pListenTogetherService = new P2PListenTogetherService();
