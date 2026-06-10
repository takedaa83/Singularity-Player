import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SYNC_FILE = path.join(DATA_DIR, 'library_sync.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// POST /api/sync/push
router.post('/push', async (req: Request, res: Response) => {
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
    const content = fs.readFileSync(SYNC_FILE, 'utf-8');
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
  } catch (error) {
    console.error('[Sync Route] Status error:', error);
    res.status(500).json({ error: 'Failed to retrieve sync status' });
  }
});

export default router;
