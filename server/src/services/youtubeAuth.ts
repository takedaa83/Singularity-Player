import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CookieMap {
  [key: string]: string;
}

const YOUTUBE_COOKIE = process.env.YOUTUBE_COOKIE || '';

let cachedCookiePath: string | null = null;

/**
 * Returns the raw YOUTUBE_COOKIE string or an empty string.
 */
export function getCookieHeader(): string {
  return YOUTUBE_COOKIE;
}

/**
 * Helper function to parse a raw cookie string into a key/value map.
 */
export function parseCookie(cookieStr: string): CookieMap {
  const map: CookieMap = {};
  if (!cookieStr) return map;
  cookieStr.split(';').forEach(pair => {
    const parts = pair.split('=');
    if (parts.length >= 2) {
      map[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return map;
}

/**
 * Returns the parsed key/value map of the YOUTUBE_COOKIE.
 */
export function getCookieMap(): CookieMap {
  return parseCookie(YOUTUBE_COOKIE);
}

/**
 * Generates the SAPISIDHASH required for authorized YouTube web client requests.
 */
export function getSapisidHash(sapisid: string, origin: string): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const data = `${currentTime} ${sapisid} ${origin}`;
  const sha1 = crypto.createHash('sha1').update(data).digest('hex');
  return `${currentTime}_${sha1}`;
}

/**
 * Lazily generates and writes a Netscape cookies.txt file for yt-dlp consumption.
 * Cached path is returned thereafter. Returns null if YOUTUBE_COOKIE is not configured.
 */
export function getCookieFilePath(): string | null {
  if (!YOUTUBE_COOKIE) {
    return null;
  }
  if (cachedCookiePath && fs.existsSync(cachedCookiePath)) {
    return cachedCookiePath;
  }

  try {
    const cookieMap = getCookieMap();
    let netscapeContent = '# Netscape HTTP Cookie File\n';
    netscapeContent += '# This file is generated dynamically by Singularity Player\n\n';

    const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year out

    for (const [name, value] of Object.entries(cookieMap)) {
      // Netscape Format: domain \t includeSubdomains \t path \t secure \t expiry \t name \t value
      netscapeContent += `.youtube.com\tTRUE\t/\tTRUE\t${expiry}\t${name}\t${value}\n`;
    }

    const tempPath = path.join(os.tmpdir(), `youtube_cookies_${Date.now()}.txt`);
    fs.writeFileSync(tempPath, netscapeContent, 'utf-8');
    cachedCookiePath = tempPath;
    console.log(`[youtubeAuth] Netscape cookies file written to: ${tempPath}`);
    
    // Register process exit hook to cleanup the temp cookies file
    process.on('exit', () => {
      try {
        if (cachedCookiePath && fs.existsSync(cachedCookiePath)) {
          fs.unlinkSync(cachedCookiePath);
        }
      } catch {}
    });

    return tempPath;
  } catch (err: any) {
    console.error('[youtubeAuth] Failed to generate Netscape cookies file:', err?.message || err);
    return null;
  }
}
