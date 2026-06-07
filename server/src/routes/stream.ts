import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// GET /api/stream/:filename
router.get('/:filename', (req: Request, res: Response) => {
  // Sanitize filename: strip any directory components to prevent traversal
  const filename = path.basename(req.params.filename);
  
  if (!filename || filename.startsWith('.')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(__dirname, '..', '..', 'uploads', 'tracks', filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Determine content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'audio/mpeg'; // default
  if (ext === '.flac') contentType = 'audio/flac';
  else if (ext === '.wav') contentType = 'audio/wav';
  else if (ext === '.ogg') contentType = 'audio/ogg';
  else if (ext === '.opus') contentType = 'audio/ogg'; // or audio/opus
  else if (ext === '.m4a' || ext === '.aac') contentType = 'audio/mp4';
  else if (ext === '.webm') contentType = 'audio/webm';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).set({
        'Content-Range': `bytes */${fileSize}`
      }).send();
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    
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
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;
