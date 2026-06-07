import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as fs from 'fs';

// Routes
import searchRouter from './routes/search';
import uploadRouter from './routes/upload';
import streamRouter from './routes/stream';
import downloadRouter from './routes/download';
import ytRouter from './routes/yt';
import lyricsRouter from './routes/lyrics';
import downloadsRouter from './routes/downloads';
import { preWarmClient } from './services/youtubeService';
import { ytdlpPool } from './services/processPool';

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads folders exist
const uploadsTracksDir = path.join(__dirname, '..', 'uploads', 'tracks');
const uploadsCoversDir = path.join(__dirname, '..', 'uploads', 'covers');

if (!fs.existsSync(uploadsTracksDir)) {
  fs.mkdirSync(uploadsTracksDir, { recursive: true });
}
if (!fs.existsSync(uploadsCoversDir)) {
  fs.mkdirSync(uploadsCoversDir, { recursive: true });
}

// Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(compression({
  filter: (req, res) => {
    // Skip compression for audio streaming and download routes to keep Accept-Ranges intact
    if (req.path.includes('/stream') || req.path.includes('/download') || req.path.includes('/yt/')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Configurable CORS origins via environment variable
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: true
}));

app.use(express.json());

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 150,
  message: { error: 'Too many requests, please try again later.' }
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: 'Upload rate limit exceeded. Please wait a few minutes.' }
});

// Static directory serving for cover art (with cache headers)
app.use('/api/covers', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache
  next();
}, express.static(uploadsCoversDir));

// Route bindings — ALL routes now rate-limited
app.use('/api/search', generalLimiter, searchRouter);
app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/stream', generalLimiter, streamRouter);
app.use('/api/download', generalLimiter, downloadRouter);
app.use('/api/yt', generalLimiter, ytRouter);
app.use('/api/lyrics', generalLimiter, lyricsRouter);
app.use('/api/downloads', generalLimiter, downloadsRouter);

// Health check with process pool stats
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Music Platform API server is running.',
    processPool: {
      active: ytdlpPool.getActiveCount(),
      queued: ytdlpPool.getQueuedCount(),
    }
  });
});

// Global error handler — don't leak internal error details
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error')
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] CORS origins: ${allowedOrigins.join(', ')}`);
  preWarmClient();
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  ytdlpPool.shutdownAll();
  process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
