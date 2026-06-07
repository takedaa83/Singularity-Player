import { Router, Request, Response } from 'express';
import { downloadManager, DownloadJob } from '../services/downloadManager';
import path from 'path';
import fs from 'fs';

const router = Router();
const TRACKS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'tracks');

/**
 * POST /api/downloads/start
 * Start a YouTube download job.
 */
router.post('/start', async (req: Request, res: Response) => {
  const { videoId } = req.body;

  if (!videoId) {
    res.status(400).json({ error: 'videoId is required' });
    return;
  }

  try {
    const jobId = await downloadManager.startDownload(videoId);
    res.json({ jobId });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to start download' });
  }
});

/**
 * GET /api/downloads/progress/:jobId
 * Server-Sent Events (SSE) stream for real-time download progress.
 */
router.get('/progress/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = downloadManager.getJob(jobId);

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
  const onUpdate = (updatedJob: DownloadJob) => {
    if (updatedJob.id === jobId) {
      res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
      if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
        cleanup();
      }
    }
  };

  const cleanup = () => {
    downloadManager.off('update', onUpdate);
    res.end();
  };

  downloadManager.on('update', onUpdate);

  req.on('close', cleanup);
});

/**
 * GET /api/downloads/file/:jobId
 * Serves the downloaded file.
 */
router.get('/file/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = downloadManager.getJob(jobId);

  if (!job || job.status !== 'completed' || !job.filePath) {
    res.status(400).json({ error: 'File is not ready or download failed' });
    return;
  }

  const filePath = path.join(TRACKS_DIR, job.filePath);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on server' });
    return;
  }

  const downloadName = (req.query.name as string) || job.filePath;
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
router.delete('/cancel/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = downloadManager.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  downloadManager.cancelDownload(jobId);
  res.json({ success: true, message: 'Download cancelled' });
});

export default router;
