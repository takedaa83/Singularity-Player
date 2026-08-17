"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const fsPromises = __importStar(require("fs/promises"));
const router = (0, express_1.Router)();
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SYNC_FILE = path.join(DATA_DIR, 'library_sync.json');
// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// POST /api/sync/push
router.post('/push', async (req, res) => {
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
    }
    catch (error) {
        console.error('[Sync Route] Push error:', error);
        res.status(500).json({ error: 'Failed to save sync file on server' });
    }
});
// GET /api/sync/pull
router.get('/pull', async (req, res) => {
    try {
        if (!fs.existsSync(SYNC_FILE)) {
            res.status(404).json({ error: 'No synced library found on server' });
            return;
        }
        const content = await fsPromises.readFile(SYNC_FILE, 'utf-8');
        res.json(JSON.parse(content));
    }
    catch (error) {
        console.error('[Sync Route] Pull error:', error);
        res.status(500).json({ error: 'Failed to read sync file from server' });
    }
});
// GET /api/sync/status
router.get('/status', async (req, res) => {
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
    }
    catch (error) {
        console.error('[Sync Route] Status error:', error);
        res.status(500).json({ error: 'Failed to retrieve sync status' });
    }
});
const activeRooms = new Map();
const ROOMS_FILE = path.join(DATA_DIR, 'active_rooms.json');
function saveRoomsToDisk() {
    try {
        const obj = {};
        for (const [id, r] of activeRooms.entries()) {
            obj[id] = r;
        }
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    }
    catch (e) {
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
                if (now - r.lastActiveAt < 4 * 60 * 60 * 1000) {
                    activeRooms.set(id, r);
                }
            }
            if (activeRooms.size > 0) {
                console.log(`[Sync Route] Restored ${activeRooms.size} active rooms from disk storage 🔄`);
            }
        }
    }
    catch (e) {
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
    if (changed)
        saveRoomsToDisk();
}, 15 * 60 * 1000);
// POST /api/sync/room/create
router.post('/room/create', (req, res) => {
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
    const room = {
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
router.post('/room/join', (req, res) => {
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
router.post('/room/:roomId/state', (req, res) => {
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
router.get('/room/:roomId/poll', (req, res) => {
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
exports.default = router;
