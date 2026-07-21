"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const downloadManager_1 = require("../services/downloadManager");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
const TRACKS_DIR = path_1.default.resolve(__dirname, '..', '..', 'uploads', 'tracks');
/**
 * POST /api/downloads/start
 * Start a YouTube download job.
 */
router.post('/start', async (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
        res.status(400).json({ error: 'videoId is required' });
        return;
    }
    try {
        const jobId = await downloadManager_1.downloadManager.startDownload(videoId);
        res.json({ jobId });
    }
    catch (err) {
        res.status(400).json({ error: err?.message || 'Failed to start download' });
    }
});
/**
 * GET /api/downloads/progress/:jobId
 * Server-Sent Events (SSE) stream for real-time download progress.
 */
router.get('/progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = downloadManager_1.downloadManager.getJob(jobId);
    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    // Send initial status
    res.write(`data: ${JSON.stringify(job)}\n\n`);
    // Event handler for progress updates
    const onUpdate = (updatedJob) => {
        if (updatedJob.id === jobId) {
            res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
            if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
                cleanup();
            }
        }
    };
    const cleanup = () => {
        downloadManager_1.downloadManager.off('update', onUpdate);
        res.end();
    };
    downloadManager_1.downloadManager.on('update', onUpdate);
    req.on('close', cleanup);
});
/**
 * GET /api/downloads/file/:jobId
 * Serves the downloaded file.
 */
router.get('/file/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = downloadManager_1.downloadManager.getJob(jobId);
    if (!job || job.status !== 'completed' || !job.filePath) {
        res.status(400).json({ error: 'File is not ready or download failed' });
        return;
    }
    const filePath = path_1.default.join(TRACKS_DIR, job.filePath);
    if (!fs_1.default.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found on server' });
        return;
    }
    const downloadName = req.query.name || job.filePath;
    res.download(filePath, downloadName, (err) => {
        if (err && !res.headersSent) {
            res.status(500).json({ error: 'Failed to stream download file' });
        }
    });
});
/**
 * DELETE /api/downloads/cancel/:jobId
 * Cancels a running download job.
 */
router.delete('/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = downloadManager_1.downloadManager.getJob(jobId);
    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }
    downloadManager_1.downloadManager.cancelDownload(jobId);
    res.json({ success: true, message: 'Download cancelled' });
});
exports.default = router;
