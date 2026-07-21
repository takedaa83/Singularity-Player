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
        // Save backup JSON to disk
        const payload = {
            ...data,
            syncedAt: Date.now()
        };
        fs.writeFileSync(SYNC_FILE, JSON.stringify(payload, null, 2), 'utf-8');
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
        const content = fs.readFileSync(SYNC_FILE, 'utf-8');
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
        const stats = fs.statSync(SYNC_FILE);
        const content = fs.readFileSync(SYNC_FILE, 'utf-8');
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
exports.default = router;
