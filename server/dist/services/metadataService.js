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
exports.MetadataService = void 0;
const mm = __importStar(require("music-metadata"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
class MetadataService {
    /**
     * Parses an audio file at filePath and extracts tags & cover art.
     */
    static async parseTrack(filePath, originalName, fileSize) {
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
            let coverArtUrl = null;
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
        }
        catch (e) {
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
    static async saveCoverArt(buffer, format) {
        try {
            const hash = crypto.createHash('md5').update(buffer).digest('hex');
            // Determine file extension
            let ext = '.jpg';
            if (format.includes('png'))
                ext = '.png';
            else if (format.includes('gif'))
                ext = '.gif';
            else if (format.includes('webp'))
                ext = '.webp';
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
        }
        catch (e) {
            console.error('Failed to save cover art:', e);
            return null;
        }
    }
}
exports.MetadataService = MetadataService;
