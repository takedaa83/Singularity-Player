"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookieHeader = getCookieHeader;
exports.parseCookie = parseCookie;
exports.getCookieMap = getCookieMap;
exports.getSapisidHash = getSapisidHash;
exports.getCookieFilePath = getCookieFilePath;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const YOUTUBE_COOKIE = process.env.YOUTUBE_COOKIE || '';
let cachedCookiePath = null;
/**
 * Returns the raw YOUTUBE_COOKIE string or an empty string.
 */
function getCookieHeader() {
    return YOUTUBE_COOKIE;
}
/**
 * Helper function to parse a raw cookie string into a key/value map.
 */
function parseCookie(cookieStr) {
    const map = {};
    if (!cookieStr)
        return map;
    // Check if Netscape tab-separated format (e.g. from cookies.txt export)
    if (cookieStr.includes('\t') || cookieStr.includes('# Netscape')) {
        const lines = cookieStr.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const parts = trimmed.split('\t');
            if (parts.length >= 7) {
                const name = parts[5].trim();
                const value = parts[6].trim();
                if (name && value) {
                    map[name] = value;
                }
            }
        }
        return map;
    }
    // Standard HTTP header format (name=value; name2=value2)
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
function getCookieMap() {
    return parseCookie(YOUTUBE_COOKIE);
}
/**
 * Generates the SAPISIDHASH required for authorized YouTube web client requests.
 */
function getSapisidHash(sapisid, origin) {
    const currentTime = Math.floor(Date.now() / 1000);
    const data = `${currentTime} ${sapisid} ${origin}`;
    const sha1 = crypto_1.default.createHash('sha1').update(data).digest('hex');
    return `${currentTime}_${sha1}`;
}
/**
 * Lazily generates and writes a Netscape cookies.txt file for yt-dlp consumption.
 * Cached path is returned thereafter. Returns null if YOUTUBE_COOKIE is not configured.
 */
function getCookieFilePath() {
    if (!YOUTUBE_COOKIE) {
        return null;
    }
    if (cachedCookiePath && fs_1.default.existsSync(cachedCookiePath)) {
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
        const tempPath = path_1.default.join(os_1.default.tmpdir(), `youtube_cookies_${Date.now()}.txt`);
        fs_1.default.writeFileSync(tempPath, netscapeContent, 'utf-8');
        cachedCookiePath = tempPath;
        console.log(`[youtubeAuth] Netscape cookies file written to: ${tempPath}`);
        // Register process exit hook to cleanup the temp cookies file
        process.on('exit', () => {
            try {
                if (cachedCookiePath && fs_1.default.existsSync(cachedCookiePath)) {
                    fs_1.default.unlinkSync(cachedCookiePath);
                }
            }
            catch { }
        });
        return tempPath;
    }
    catch (err) {
        console.error('[youtubeAuth] Failed to generate Netscape cookies file:', err?.message || err);
        return null;
    }
}
