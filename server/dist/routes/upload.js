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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const metadataService_1 = require("../services/metadataService");
const paths_1 = require("../utils/paths");
const router = (0, express_1.Router)();
// Ensure upload folders exist
const uploadDir = (0, paths_1.getUploadsDir)('tracks');
// Multer Storage Configuration
const storage = multer_1.default.diskStorage({
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
const fileFilter = (req, file, cb) => {
    const allowedExts = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.aiff', '.wma', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) || file.mimetype.startsWith('audio/')) {
        cb(null, true);
    }
    else {
        cb(new Error(`Invalid file type. Supported extensions: ${allowedExts.join(', ')}`));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB per file limit
    }
});
// POST /api/upload
// Can accept single or multiple files under key 'files' or 'file'
router.post('/', upload.array('files', 5), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            res.status(400).json({ error: 'No files were uploaded.' });
            return;
        }
        const tracks = [];
        for (const file of files) {
            const metadata = await metadataService_1.MetadataService.parseTrack(file.path, file.originalname, file.size);
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
    }
    catch (error) {
        console.error('Error in track upload route:', error);
        res.status(500).json({ error: error.message || 'Failed to process files.' });
    }
});
exports.default = router;
