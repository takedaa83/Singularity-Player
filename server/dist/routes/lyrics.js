"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lyricsService_1 = require("../services/lyricsService");
const searchService_1 = require("../services/searchService");
const router = (0, express_1.Router)();
// GET /api/lyrics?track=...&artist=...&album=...&duration=...
router.get('/', async (req, res) => {
    const track = req.query.track;
    const artist = req.query.artist;
    const album = req.query.album;
    const duration = req.query.duration ? parseFloat(req.query.duration) : undefined;
    if (!track || !artist) {
        res.status(400).json({ error: 'track and artist parameters are required' });
        return;
    }
    try {
        const result = await (0, lyricsService_1.fetchLyrics)(track, artist, album, duration);
        if (result) {
            res.json(result);
        }
        else {
            res.status(404).json({ error: 'No lyrics found' });
        }
    }
    catch (error) {
        console.error('[Lyrics Route] Error:', error);
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});
// POST /api/lyrics/save
router.post('/save', async (req, res) => {
    const { track, artist, syncedLyrics, plainLyrics, albumName, duration } = req.body;
    if (!track || !artist) {
        res.status(400).json({ error: 'track and artist are required' });
        return;
    }
    try {
        const data = {
            syncedLyrics: syncedLyrics || null,
            plainLyrics: plainLyrics || null,
            trackName: track,
            artistName: artist,
            albumName: albumName || '',
            duration: duration || 0
        };
        await (0, lyricsService_1.saveLyrics)(track, artist, data);
        res.json({ success: true, message: 'Lyrics saved successfully' });
    }
    catch (error) {
        console.error('[Lyrics Route] Save error:', error);
        res.status(500).json({ error: 'Failed to save lyrics' });
    }
});
// POST /api/lyrics/clear
router.post('/clear', async (req, res) => {
    try {
        await (0, lyricsService_1.clearLyricsCache)();
        searchService_1.SearchService.clearSearchCache();
        res.json({ success: true, message: 'Server-side lyrics and search caches cleared successfully' });
    }
    catch (error) {
        console.error('[Lyrics Route] Clear cache error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});
exports.default = router;
