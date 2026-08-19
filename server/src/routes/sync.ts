import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

import { getSyncDataDir } from '../utils/paths';

const router = Router();

const DATA_DIR = getSyncDataDir();
const SYNC_FILE = path.join(DATA_DIR, 'library_sync.json');

// POST /api/sync/push
router.post('/push', async (req: Request, res: Response) => {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Invalid library sync data' });
    return;
  }

  try {
    // Save backup JSON to disk asynchronously
    const payload = {
      ...data,
      syncedAt: Date.now()
    };
    await fsPromises.writeFile(SYNC_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ 
      success: true, 
      message: 'Library synced to server successfully', 
      syncedAt: payload.syncedAt 
    });
  } catch (error) {
    console.error('[Sync Route] Push error:', error);
    res.status(500).json({ error: 'Failed to save sync file on server' });
  }
});

// GET /api/sync/pull
router.get('/pull', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(SYNC_FILE)) {
      res.status(404).json({ error: 'No synced library found on server' });
      return;
    }
    const content = await fsPromises.readFile(SYNC_FILE, 'utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    console.error('[Sync Route] Pull error:', error);
    res.status(500).json({ error: 'Failed to read sync file from server' });
  }
});

// GET /api/sync/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(SYNC_FILE)) {
      res.json({ exists: false });
      return;
    }
    const [stats, content] = await Promise.all([
      fsPromises.stat(SYNC_FILE),
      fsPromises.readFile(SYNC_FILE, 'utf-8')
    ]);
    const parsed = JSON.parse(content);
    res.json({
      exists: true,
      syncedAt: parsed.syncedAt || stats.mtimeMs,
      sizeBytes: stats.size,
      trackCount: Array.isArray(parsed.tracks) ? parsed.tracks.length : 0,
      playlistCount: Array.isArray(parsed.playlists) ? parsed.playlists.length : 0
    });
  } catch (error) {
    console.error('[Sync Route] Status error:', error);
    res.status(500).json({ error: 'Failed to retrieve sync status' });
  }
});

// ─── Listen Together Synchronized Rooms Architecture ───────────────────

interface RoomState {
  currentTrack: any | null;
  currentTime: number;
  isPlaying: boolean;
  queue: any[];
  activeQueueIndex: number;
  updatedAt: number;
}

interface SyncRoom {
  id: string;
  hostId: string;
  createdAt: number;
  lastActiveAt: number;
  state: RoomState;
  listeners: { [clientId: string]: { name: string; lastSeen: number } };
}

const activeRooms = new Map<string, SyncRoom>();
const ROOMS_FILE = path.join(DATA_DIR, 'active_rooms.json');

function saveRoomsToDisk() {
  try {
    const obj: Record<string, SyncRoom> = {};
    for (const [id, r] of activeRooms.entries()) {
      obj[id] = r;
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Sync Route] Failed to save active rooms to disk:', e);
  }
}

function loadRoomsFromDisk() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const content = fs.readFileSync(ROOMS_FILE, 'utf-8');
      const obj = JSON.parse(content);
      const now = Date.now();
      for (const [id, r] of Object.entries(obj)) {
        if (now - (r as SyncRoom).lastActiveAt < 4 * 60 * 60 * 1000) {
          activeRooms.set(id, r as SyncRoom);
        }
      }
      if (activeRooms.size > 0) {
        console.log(`[Sync Route] Restored ${activeRooms.size} active rooms from disk storage 🔄`);
      }
    }
  } catch (e) {
    console.warn('[Sync Route] Failed to load active rooms from disk:', e);
  }
}

loadRoomsFromDisk();

// Clean up stale rooms older than 4 hours
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [roomId, room] of activeRooms.entries()) {
    if (now - room.lastActiveAt > 4 * 60 * 60 * 1000) {
      activeRooms.delete(roomId);
      changed = true;
    }
  }
  if (changed) saveRoomsToDisk();
}, 15 * 60 * 1000);

// POST /api/sync/room/create
router.post('/room/create', (req: Request, res: Response) => {
  const { hostId, hostName, initialTrack, isPlaying, queue, activeQueueIndex } = req.body;
  if (!hostId) {
    res.status(400).json({ error: 'hostId is required' });
    return;
  }

  // Generate 6-char alphanumeric room code (e.g. SING-789)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let roomId = 'SING-';
  for (let i = 0; i < 4; i++) {
    roomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const now = Date.now();
  const room: SyncRoom = {
    id: roomId,
    hostId,
    createdAt: now,
    lastActiveAt: now,
    state: {
      currentTrack: initialTrack || null,
      currentTime: 0,
      isPlaying: Boolean(isPlaying),
      queue: Array.isArray(queue) ? queue : [],
      activeQueueIndex: activeQueueIndex || 0,
      updatedAt: now,
    },
    listeners: {
      [hostId]: { name: hostName || 'Host', lastSeen: now }
    }
  };

  activeRooms.set(roomId, room);
  saveRoomsToDisk();
  res.json({ success: true, roomId, room });
});

// POST /api/sync/room/join
router.post('/room/join', (req: Request, res: Response) => {
  const { roomId, clientId, clientName } = req.body;
  if (!roomId || !clientId) {
    res.status(400).json({ error: 'roomId and clientId are required' });
    return;
  }

  const cleanRoomId = String(roomId).trim().toUpperCase();
  const room = activeRooms.get(cleanRoomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found or expired' });
    return;
  }

  const now = Date.now();
  room.lastActiveAt = now;
  room.listeners[clientId] = { name: clientName || 'Listener', lastSeen: now };
  saveRoomsToDisk();

  res.json({
    success: true,
    roomId: cleanRoomId,
    isHost: room.hostId === clientId,
    room: {
      id: room.id,
      hostId: room.hostId,
      state: room.state,
      listenerCount: Object.keys(room.listeners).length,
      listeners: Object.values(room.listeners).map(l => l.name)
    }
  });
});

// POST /api/sync/room/:roomId/state (Host broadcast update)
router.post('/room/:roomId/state', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { hostId, currentTrack, currentTime, isPlaying, queue, activeQueueIndex } = req.body;

  const room = activeRooms.get(String(roomId).toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  if (room.hostId !== hostId) {
    res.status(403).json({ error: 'Only the room host can broadcast state' });
    return;
  }

  const now = Date.now();
  room.lastActiveAt = now;
  if (room.listeners[hostId]) {
    room.listeners[hostId].lastSeen = now;
  }

  room.state = {
    currentTrack: currentTrack !== undefined ? currentTrack : room.state.currentTrack,
    currentTime: typeof currentTime === 'number' ? currentTime : room.state.currentTime,
    isPlaying: typeof isPlaying === 'boolean' ? isPlaying : room.state.isPlaying,
    queue: Array.isArray(queue) ? queue : room.state.queue,
    activeQueueIndex: typeof activeQueueIndex === 'number' ? activeQueueIndex : room.state.activeQueueIndex,
    updatedAt: now,
  };

  saveRoomsToDisk();
  res.json({ success: true, updatedAt: now });
});

// GET /api/sync/room/:roomId/poll (Listener polling & synchronization)
router.get('/room/:roomId/poll', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const clientId = String(req.query.clientId || '');

  const room = activeRooms.get(String(roomId).toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const now = Date.now();
  room.lastActiveAt = now;
  if (clientId && room.listeners[clientId]) {
    room.listeners[clientId].lastSeen = now;
  }

  // Clean listeners inactive for more than 45 seconds
  for (const [id, listener] of Object.entries(room.listeners)) {
    if (now - listener.lastSeen > 45000 && id !== room.hostId) {
      delete room.listeners[id];
    }
  }

  res.json({
    success: true,
    roomId: room.id,
    isHost: room.hostId === clientId,
    state: room.state,
    listenerCount: Object.keys(room.listeners).length,
    listeners: Object.values(room.listeners).map(l => l.name),
    serverTime: now
  });
});

export default router;
