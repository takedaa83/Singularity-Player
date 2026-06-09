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
import { preWarmClient, ensureYtDlpBinary } from './services/youtubeService';
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

// Route bindings
app.use('/api/search', generalLimiter, searchRouter);
app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/stream', streamRouter); // streaming route (no rate limiting to support seeking and Range requests)
app.use('/api/download', downloadRouter); // downloading route (no rate limiting to support large file downloads)

// Exempt streaming/downloading endpoints under /api/yt from rate limiting
const ytLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    req.path.startsWith('/stream') ||
    req.path.startsWith('/download') ||
    req.originalUrl.includes('/stream') ||
    req.originalUrl.includes('/download')
  ) {
    return next();
  }
  generalLimiter(req, res, next);
};
app.use('/api/yt', ytLimiter, ytRouter);

app.use('/api/lyrics', generalLimiter, lyricsRouter);

// Exempt streaming/SSE endpoints under /api/downloads from rate limiting
const downloadsLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    req.path.startsWith('/file') ||
    req.path.startsWith('/progress') ||
    req.originalUrl.includes('/file') ||
    req.originalUrl.includes('/progress')
  ) {
    return next();
  }
  generalLimiter(req, res, next);
};
app.use('/api/downloads', downloadsLimiter, downloadsRouter);

// Image Proxy Endpoint to bypass CORS blocks for canvas-based color extraction
app.get('/api/proxy-image', (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    res.status(400).json({ error: 'url parameter is required' });
    return;
  }
  
  // If local server cover art, serve directly or redirect
  if (imageUrl.startsWith('/api/covers/') || imageUrl.startsWith('http://localhost') || imageUrl.startsWith('http://127.0.0.1')) {
    res.redirect(imageUrl);
    return;
  }

  try {
    const httpLib = imageUrl.startsWith('https') ? require('https') : require('http');
    const proxyReq = httpLib.request(imageUrl, (proxyRes: any) => {
      if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
        res.status(proxyRes.statusCode).json({ error: `Image server returned ${proxyRes.statusCode}` });
        return;
      }
      
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (e: any) => {
      console.error('[Image Proxy] HTTP error:', e);
      res.status(500).json({ error: 'Proxy request failed' });
    });
    
    proxyReq.end();
  } catch (e) {
    console.error('[Image Proxy] Error:', e);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

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
app.listen(PORT, async () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] CORS origins: ${allowedOrigins.join(', ')}`);
  await ensureYtDlpBinary();
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
