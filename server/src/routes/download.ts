import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';

const router = Router();

// GET /api/download/single/:filename
router.get('/single/:filename', (req: Request, res: Response) => {
  // Sanitize filename: strip any directory components to prevent traversal
  const filename = path.basename(req.params.filename);

  if (!filename || filename.startsWith('.')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(__dirname, '..', '..', 'uploads', 'tracks', filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Get original name from query if provided to download with correct metadata filename
  const downloadName = (req.query.name as string) || filename;

  res.download(filePath, downloadName, (err) => {
    if (err) {
      console.error('Error sending file for download:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });
});

interface BatchTrackInput {
  filePath: string;      // Server-side relative uploaded filename (e.g. "1234-xyz.mp3")
  title: string;
  artist: string;
  album: string;
  originalName: string;  // e.g. "song.mp3"
}

// POST /api/download/batch
router.post('/batch', (req: Request, res: Response) => {
  const { tracks } = req.body as { tracks: BatchTrackInput[] };

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    res.status(400).json({ error: 'No tracks selected for batch download' });
    return;
  }

  const archive = archiver('zip', {
    zlib: { level: 5 } // Compress level 5 (balance speed and size)
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="music_collection.zip"');

  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    res.status(500).send({ error: err.message });
  });

  // Pipe the archive output directly to the Express response stream
  archive.pipe(res);

  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'tracks');

  for (const track of tracks) {
    // Sanitize filePath from client body to prevent traversal
    const safeFilePath = path.basename(track.filePath || '');
    if (!safeFilePath || safeFilePath.startsWith('.')) continue;

    const fullPath = path.join(uploadsDir, safeFilePath);
    
    if (fs.existsSync(fullPath)) {
      // Determine file extension
      const ext = path.extname(track.filePath) || path.extname(track.originalName) || '.mp3';
      
      // Clean up names to prevent invalid ZIP folder characters
      const cleanArtist = track.artist.replace(/[\/\\?%*:|"<>\.]/g, '_').trim();
      const cleanAlbum = track.album.replace(/[\/\\?%*:|"<>\.]/g, '_').trim();
      const cleanTitle = track.title.replace(/[\/\\?%*:|"<>\.]/g, '_').trim();

      // Structure folders: Artist / Album / Title.ext
      const zipPath = `${cleanArtist}/${cleanAlbum}/${cleanTitle}${ext}`;
      
      archive.file(fullPath, { name: zipPath });
    } else {
      console.warn(`File not found: ${fullPath}, skipping in ZIP archive.`);
    }
  }

  archive.finalize();
});

export default router;
