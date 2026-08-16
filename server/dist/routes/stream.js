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
const express_1 = require("express");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const router = (0, express_1.Router)();
const ALLOWED_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.opus', '.m4a', '.aac', '.webm', '.aiff', '.wma'];
function getAudioContentType(ext) {
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
function streamAudioFile(filePath, req, res) {
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
    }
    else {
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
router.get('/local', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath) {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
    }
    const normalized = path.resolve(targetPath);
    streamAudioFile(normalized, req, res);
});
// GET /api/stream/:filename
router.get('/:filename', (req, res) => {
    // Sanitize filename: strip any directory components to prevent traversal
    const filename = path.basename(req.params.filename);
    if (!filename || filename.startsWith('.')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
    }
    const filePath = path.join(__dirname, '..', '..', 'uploads', 'tracks', filename);
    streamAudioFile(filePath, req, res);
});
exports.default = router;
