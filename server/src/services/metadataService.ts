import * as mm from 'music-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  duration: number;
  bitrate: number | null;
  sampleRate: number | null;
  fileSize: number;
  coverArtUrl: string | null;
}

export class MetadataService {
  /**
   * Parses an audio file at filePath and extracts tags & cover art.
   */
  public static async parseTrack(
    filePath: string,
    originalName: string,
    fileSize: number
  ): Promise<ExtractedMetadata> {
    const ext = path.extname(originalName).toLowerCase();
    
    // Default fallback values based on the filename
    const baseName = path.basename(originalName, ext);
    const parts = baseName.split(' - ');
    let defaultArtist = 'Unknown Artist';
    let defaultTitle = baseName;

    if (parts.length > 1) {
      defaultArtist = parts[0].trim();
      defaultTitle = parts.slice(1).join(' - ').trim();
    }

    try {
      const metadata = await mm.parseFile(filePath);
      const common = metadata.common;
      const format = metadata.format;

      let coverArtUrl: string | null = null;
      if (common.picture && common.picture.length > 0) {
        const pic = common.picture[0];
        coverArtUrl = await this.saveCoverArt(pic.data, pic.format);
      }

      return {
        title: common.title || defaultTitle,
        artist: common.artist || defaultArtist,
        album: common.album || 'Unknown Album',
        genre: common.genre && common.genre.length > 0 ? common.genre[0] : 'Unknown',
        year: common.year || null,
        trackNumber: common.track?.no || null,
        duration: format.duration ? Math.round(format.duration) : 0,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null, // in kbps
        sampleRate: format.sampleRate || null,
        fileSize,
        coverArtUrl
      };
    } catch (e) {
      console.error('Error parsing metadata for', originalName, ':', e);
      // Return fallback tags so the upload still succeeds
      return {
        title: defaultTitle,
        artist: defaultArtist,
        album: 'Unknown Album',
        genre: 'Unknown',
        year: null,
        trackNumber: null,
        duration: 0,
        bitrate: null,
        sampleRate: null,
        fileSize,
        coverArtUrl: null
      };
    }
  }

  /**
   * Helper to write raw cover art buffer to uploads/covers folder with a hash name
   */
  private static async saveCoverArt(buffer: Uint8Array, format: string): Promise<string | null> {
    try {
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      
      // Determine file extension
      let ext = '.jpg';
      if (format.includes('png')) ext = '.png';
      else if (format.includes('gif')) ext = '.gif';
      else if (format.includes('webp')) ext = '.webp';

      const fileName = `${hash}${ext}`;
      const outputDir = path.join(__dirname, '..', '..', 'uploads', 'covers');
      
      if (!fs.existsSync(outputDir)) {
        await fs.promises.mkdir(outputDir, { recursive: true });
      }

      const fullPath = path.join(outputDir, fileName);
      if (!fs.existsSync(fullPath)) {
        await fs.promises.writeFile(fullPath, buffer);
      }

      // The frontend will access this image via /api/covers/:filename
      return `/api/covers/${fileName}`;
    } catch (e) {
      console.error('Failed to save cover art:', e);
      return null;
    }
  }
}
