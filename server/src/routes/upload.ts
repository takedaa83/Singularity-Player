import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { MetadataService } from '../services/metadataService';

const router = Router();

// Ensure upload folders exist
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'tracks');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename using a hash + original extension
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${random}${ext}`);
  }
});

// Multer file filter to allow common audio formats
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExts = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.aiff', '.wma', '.webm'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExts.includes(ext) || file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Supported extensions: ${allowedExts.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB per file limit
  }
});

// POST /api/upload
// Can accept single or multiple files under key 'files' or 'file'
router.post('/', upload.array('files', 15), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files were uploaded.' });
      return;
    }

    const tracks = [];
    for (const file of files) {
      const metadata = await MetadataService.parseTrack(
        file.path,
        file.originalname,
        file.size
      );

      // Construct stream and download URLs pointing to this server
      // Note: We use filename for streaming/downloading
      const filename = path.basename(file.path);

      tracks.push({
        id: crypto.randomBytes(16).toString('hex'), // Unique UUID for local client store
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        genre: metadata.genre,
        year: metadata.year,
        trackNumber: metadata.trackNumber,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        fileSize: metadata.fileSize,
        mimeType: file.mimetype,
        coverArtUrl: metadata.coverArtUrl,
        source: 'local',
        streamUrl: `/api/stream/${filename}`,
        filePath: filename, // store filename as relative ref
        addedAt: Date.now()
      });
    }

    res.status(200).json({ success: true, tracks });
  } catch (error: any) {
    console.error('Error in track upload route:', error);
    res.status(500).json({ error: error.message || 'Failed to process files.' });
  }
});

export default router;
