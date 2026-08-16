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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const archiver_1 = __importDefault(require("archiver"));
const router = (0, express_1.Router)();
// GET /api/download/single/:filename
router.get('/single/:filename', (req, res) => {
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
    const downloadName = req.query.name || filename;
    res.download(filePath, downloadName, (err) => {
        if (err) {
            console.error('Error sending file for download:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        }
    });
});
// POST /api/download/batch
router.post('/batch', (req, res) => {
    const { tracks } = req.body;
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        res.status(400).json({ error: 'No tracks selected for batch download' });
        return;
    }
    const archive = (0, archiver_1.default)('zip', {
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
        if (!safeFilePath || safeFilePath.startsWith('.'))
            continue;
        const fullPath = path.join(uploadsDir, safeFilePath);
        if (fs.existsSync(fullPath)) {
            // Determine file extension
            const ext = path.extname(track.filePath) || path.extname(track.originalName) || '.mp3';
            // Clean up names to prevent invalid ZIP folder characters
            const cleanArtist = (track.artist || 'Unknown Artist').replace(/[\/\\?%*:|"<>\.]/g, '_').trim();
            const cleanAlbum = (track.album || 'Unknown Album').replace(/[\/\\?%*:|"<>\.]/g, '_').trim();
            const cleanTitle = (track.title || 'Untitled Track').replace(/[\/\\?%*:|"<>\.]/g, '_').trim();
            // Structure folders: Artist / Album / Title.ext
            const zipPath = `${cleanArtist}/${cleanAlbum}/${cleanTitle}${ext}`;
            archive.file(fullPath, { name: zipPath });
        }
        else {
            console.warn(`File not found: ${fullPath}, skipping in ZIP archive.`);
        }
    }
    archive.finalize();
});
exports.default = router;
