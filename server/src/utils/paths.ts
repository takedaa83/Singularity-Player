import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Central utility for obtaining safe, user-writable directories.
 * Ensures the app never attempts to write into read-only directories like app.asar or C:\Program Files.
 */

let baseDataDir: string | null = null;

export function getWritableDataDir(): string {
  if (baseDataDir) return baseDataDir;

  if (process.env.SINGULARITY_DATA_DIR) {
    baseDataDir = process.env.SINGULARITY_DATA_DIR;
  } else if (process.env.APPDATA) {
    baseDataDir = path.join(process.env.APPDATA, 'Singularity Player', 'data');
  } else {
    const home = os.homedir();
    baseDataDir = home ? path.join(home, '.singularity-player', 'data') : path.join(os.tmpdir(), 'singularity-player', 'data');
  }

  try {
    if (!fs.existsSync(baseDataDir)) {
      fs.mkdirSync(baseDataDir, { recursive: true });
    }
  } catch (err) {
    console.warn('[Paths] Fallback to tmpdir due to mkdir error on base data dir:', err);
    baseDataDir = path.join(os.tmpdir(), 'singularity-player', 'data');
    if (!fs.existsSync(baseDataDir)) {
      fs.mkdirSync(baseDataDir, { recursive: true });
    }
  }

  return baseDataDir;
}

export function getUploadsDir(sub: 'tracks' | 'covers' = 'tracks'): string {
  const dir = path.join(getWritableDataDir(), 'uploads', sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getBinDir(): string {
  const dir = path.join(getWritableDataDir(), 'bin');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getCacheDir(sub = 'cache'): string {
  const dir = path.join(getWritableDataDir(), sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getSyncDataDir(): string {
  const dir = path.join(getWritableDataDir(), 'sync');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getLyricsDir(): string {
  const dir = path.join(getWritableDataDir(), 'lyrics');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
