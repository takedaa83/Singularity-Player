import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import * as musicMetadata from 'music-metadata';

const router = Router();

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus']);

interface ScannedTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  mimeType: string;
  streamUrl: string;
  coverArtUrl?: string | null;
  filePath: string;
  source: 'local';
  addedAt: number;
}

function scanDirectoryRecursively(dirPath: string, fileList: string[] = []): string[] {
  try {
    if (!fs.existsSync(dirPath)) return fileList;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirectoryRecursively(fullPath, fileList);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          fileList.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.warn(`[Local Scanner Error] Failed to scan directory ${dirPath}:`, err);
  }
  return fileList;
}

/**
 * POST /api/library/scan-folder
 * Scans a local PC folder path for audio tracks and returns parsed metadata.
 */
router.post('/scan-folder', async (req: Request, res: Response) => {
  const { folderPath } = req.body as { folderPath: string };

  if (!folderPath || typeof folderPath !== 'string') {
    res.status(400).json({ error: 'Valid folderPath string is required' });
    return;
  }

  const cleanPath = path.normalize(folderPath.trim());
  if (!fs.existsSync(cleanPath)) {
    res.status(404).json({ error: `Directory does not exist on PC: ${cleanPath}` });
    return;
  }

  console.log(`[Local Scanner] Starting scan of local PC folder: ${cleanPath}`);
  const audioFiles = scanDirectoryRecursively(cleanPath);
  console.log(`[Local Scanner] Found ${audioFiles.length} supported audio files in ${cleanPath}`);

  const tracks: ScannedTrack[] = [];
  const MAX_SCAN_LIMIT = 500; // Cap to 500 tracks per batch for fast response
  const targetFiles = audioFiles.slice(0, MAX_SCAN_LIMIT);

  for (const filePath of targetFiles) {
    try {
      const fileName = path.basename(filePath);
      let title = path.parse(fileName).name;
      let artist = 'Unknown Artist';
      let album = 'Local Audio';
      let duration = 0;
      let coverArtUrl: string | null = null;

      try {
        const metadata = await musicMetadata.parseFile(filePath, { duration: true, skipCovers: false });
        if (metadata.common.title) title = metadata.common.title;
        if (metadata.common.artist) artist = metadata.common.artist;
        if (metadata.common.album) album = metadata.common.album;
        if (metadata.format.duration) duration = Math.round(metadata.format.duration);

        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const pic = metadata.common.picture[0];
          coverArtUrl = `data:${pic.format};base64,${pic.data.toString('base64')}`;
        }
      } catch (metaErr) {
        // Fallback to filename title if tag parsing fails
      }

      const relativeStreamPath = `/api/stream/${encodeURIComponent(fileName)}`;

      tracks.push({
        id: `local-${Buffer.from(filePath).toString('hex').substring(0, 16)}`,
        title,
        artist,
        album,
        duration,
        mimeType: 'audio/mpeg',
        streamUrl: relativeStreamPath,
        coverArtUrl,
        filePath,
        source: 'local',
        addedAt: Date.now(),
      });
    } catch (err) {
      console.warn(`[Local Scanner] Error parsing ${filePath}:`, err);
    }
  }

  res.json({
    folderPath: cleanPath,
    totalFilesFound: audioFiles.length,
    scannedCount: tracks.length,
    tracks,
  });
});

export default router;
