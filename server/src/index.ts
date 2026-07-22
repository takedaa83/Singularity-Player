import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as fs from 'fs';
import http from 'http';
import https from 'https';

// Routes
import searchRouter from './routes/search';
import uploadRouter from './routes/upload';
import streamRouter from './routes/stream';
import downloadRouter from './routes/download';
import ytRouter from './routes/yt';
import lyricsRouter from './routes/lyrics';
import downloadsRouter from './routes/downloads';
import syncRouter from './routes/sync';
import spotifyRouter from './routes/spotify';
import { preWarmClient, ensureYtDlpBinary } from './services/youtubeService';
import { checkCookieHealth } from './services/customInnertube';
import { ytdlpPool } from './services/processPool';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Render) for correct rate limiting IP validation
app.set('trust proxy', 1);

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

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization', 'X-Goog-Visitor-Id', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' data: blob: https:;");
  next();
});

app.use(express.json({ limit: '50mb' }));

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
app.use('/api/sync', generalLimiter, syncRouter);
app.use('/api/spotify', generalLimiter, spotifyRouter);

// Image Proxy Endpoint to bypass CORS blocks for canvas-based color extraction
app.get('/api/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    res.status(400).json({ error: 'url parameter is required and must be a string' });
    return;
  }
  
  // If local server cover art, serve directly or redirect
  if (imageUrl.startsWith('/api/covers/') || imageUrl.startsWith('/') || imageUrl.startsWith('http://localhost') || imageUrl.startsWith('http://127.0.0.1')) {
    res.redirect(imageUrl);
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (err) {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  
  // Whitelist YouTube, Google, iTunes, and Deezer CDN image domains to prevent SSRF
  const allowedHosts = [
    'i.ytimg.com',
    'ytimg.com',
    'googleusercontent.com',
    'ggpht.com',
    'mzstatic.com',
    'dzcdn.net'
  ];
  
  const isAllowed = allowedHosts.some(host => hostname === host || hostname.endsWith('.' + host));
  if (!isAllowed) {
    res.status(403).json({ error: 'Forbidden: Domain not whitelisted for image proxying' });
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

// Serve frontend static build if present (allows friends to open full app directly from link)
const possibleClientPaths = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
];

const clientDistPath = possibleClientPaths.find(p => fs.existsSync(p));

if (clientDistPath) {
  console.log(`[Server] Serving frontend client static build from ${clientDistPath}`);
  app.use(express.static(clientDistPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Root status page fallback if client/dist is not built
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Singularity Player Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; margin: 0; padding: 40px 20px; background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box;">
        <div style="background: #1e293b; border: 1px solid #334155; padding: 40px; border-radius: 16px; max-width: 480px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <h1 style="color: #a855f7; font-size: 2rem; margin: 0 0 10px 0;">Singularity Server</h1>
          <p style="font-size: 1rem; color: #94a3b8; margin: 0 0 24px 0; line-height: 1.5;">Your 24/7 Music Backend is Online & Ready to Stream!</p>
          <div style="display: inline-block; padding: 10px 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; font-family: monospace; color: #34d399; font-weight: 600;">
            Status: ONLINE 🚀
          </div>
        </div>
      </body>
      </html>
    `);
  });
}

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
  console.log(`[Server] CORS origins: * (all origins allowed)`);
  await ensureYtDlpBinary();
  preWarmClient();
  checkCookieHealth().catch(() => {});

  // Self-pinging keep-alive mechanism to prevent Render spin-down
  const PUBLIC_URL = process.env.PUBLIC_URL;
  if (PUBLIC_URL) {
    const pingIntervalMs = 10 * 60 * 1000; // ping every 10 minutes
    console.log(`[Keep-Alive] Configured to self-ping ${PUBLIC_URL} every 10 minutes`);
    setInterval(() => {
      const healthUrl = `${PUBLIC_URL.replace(/\/$/, '')}/api/health`;
      console.log(`[Keep-Alive] Sending self-ping to ${healthUrl}...`);
      
      const clientLib = healthUrl.startsWith('https') ? https : http;
      clientLib.get(healthUrl, (res) => {
        console.log(`[Keep-Alive] Self-ping status code: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('[Keep-Alive] Self-ping failed:', err.message);
      });
    }, pingIntervalMs);
  } else {
    console.log('[Keep-Alive] PUBLIC_URL not set. Self-pinging is disabled.');
  }
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  ytdlpPool.shutdownAll();
  process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
