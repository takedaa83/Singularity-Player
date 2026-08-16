import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

const ALLOWED_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.opus', '.m4a', '.aac', '.webm', '.aiff', '.wma'];

function getAudioContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.flac': return 'audio/flac';
    case '.wav': return 'audio/wav';
    case '.ogg': return 'audio/ogg';
    case '.opus': return 'audio/ogg';
    case '.m4a':
    case '.aac': return 'audio/mp4';
    case '.webm': return 'audio/webm';
    case '.aiff': return 'audio/aiff';
    default: return 'audio/mpeg';
  }
}

function streamAudioFile(filePath: string, req: Request, res: Response): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_AUDIO_EXTS.includes(ext)) {
    res.status(400).json({ error: 'File is not a supported audio format' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = getAudioContentType(ext);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || start < 0) {
      res.status(416).set({
        'Content-Range': `bytes */${fileSize}`
      }).send();
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    file.on('error', (err) => {
      console.error('[Stream Route Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio file' });
      }
    });

    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    const file = fs.createReadStream(filePath);
    file.on('error', (err) => {
      console.error('[Stream Route Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio file' });
      }
    });
    file.pipe(res);
  }
}

// GET /api/stream/local?path=...
router.get('/local', (req: Request, res: Response) => {
  const targetPath = req.query.path as string;
  if (!targetPath) {
    res.status(400).json({ error: 'Missing path query parameter' });
    return;
  }

  const normalized = path.resolve(targetPath);
  streamAudioFile(normalized, req, res);
});

// GET /api/stream/:filename
router.get('/:filename', (req: Request, res: Response) => {
  // Sanitize filename: strip any directory components to prevent traversal
  const filename = path.basename(req.params.filename);
  
  if (!filename || filename.startsWith('.')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(__dirname, '..', '..', 'uploads', 'tracks', filename);
  streamAudioFile(filePath, req, res);
});

export default router;
