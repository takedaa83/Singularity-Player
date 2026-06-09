# Release Notes - Singularity Player v1.5.0

We are excited to release **v1.5.0** of Singularity Player! This release focuses on delivering a premium, pixel-perfect lyrics visualizer, solving critical audio streaming and seeking performance bugs, and introducing smart playlist generation, queue recommendation, and listening analytics features.

---

## What's New in v1.5.0

### 🎵 Precision Lyrics Synchronization & Visualizer (Apple Music Style)
* **Word-Level Native Highlight**: Native support for **Enhanced LRC format** tags (e.g. `<00:12.30>`) to perform sweep-based character-by-character coloring matching the heard vocals.
* **Smart Word Sync Fallback & Toggle**: Standard LRC tracks without word timings can use our dynamic tempo-based word sync algorithm, or be toggled to clean **Line-by-Line Highlight** (the entire active line highlights in solid white upon starting, ensuring 100% precision).
* **Sync Offset Adjustment**: Added a visual sync offset slider in the fullscreen header (`-400ms` to `+400ms` in `10ms` steps) to compensate for Bluetooth, audio driver, or speaker latencies. Settings persist in `localStorage`.
* **Kinetic Lyric Centering**: Completely overhauled the scrolling engines using GSAP and relative offset parent coordinates to smoothly scroll and center the active lyric line in both sidebar and fullscreen overlays.
* **Large Typography & Custom Scaling**: Increased default font sizes to `26px` (sidebar) and `48px` (fullscreen) and added a sizing slider in the fullscreen controls supporting sizes up to `40px` base scale.
* **Ambient Backdrop Circle Blobs**: A gorgeous background overlay comprising three heavy-blurred circles that rotate, float, and drift organically, dynamically tinted with the active album cover art colors.

### 🧠 Smart Features & Playback Analytics
* **Smart Queue Service**: Automatically queries YouTube Music API for related radio tracks as you listen, queueing up recommended items when you reach the end of your playback list.
* **Dynamic Playlist Generator**: Generates custom playlists on the fly by grouping tracks based on tempo, mood, and listening metadata.
* **Listening Analytics Dashboard**: A full analytics panel displaying play count, top artists, top genres, skip rates, and detailed listening hour trends.

### ⚡ Performance, Seeking, & Audio Engine Upgrades
* **Audio Seeking Fix**: Resolved a critical issue where seeking or clicking lyric lines restarted the song from the beginning. Decoded track URLs via `decodeURIComponent()` before performing source change checks to prevent browser URL-encoding differences from triggering duplicate `.load()` calls.
* **Chunk Streaming Rate Limit Exemption**: Removed the 150 requests/min rate limiter from `/api/stream/*`, `/api/yt/stream/*`, `/api/download/*`, and `/api/downloads/file/*` to prevent the browser's audio range requests from getting blocked during playback and seek operations.
* **Seamless Crossfading & Prefetching**: Improved crossfade transition timing using a cosine/sine power curve and automatic prefetching of the next track when the active playhead reaches 60%.

---

## How to Run & Test

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Build Client & Server**:
   ```bash
   npm run build
   ```
3. **Run Dev Environment**:
   ```bash
   npm run dev
   ```
   * Client: `http://localhost:5173`
   * Server: `http://localhost:3001`
