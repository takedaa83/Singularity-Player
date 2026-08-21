# 🌌 Singularity Player 2.0 — Complete System & Deployment Workflow

> **Authoritative Technical Guide & Architecture Workflow**  
> *Targeted for Private Development, Self-Hosting, and Continuous Delivery.*

---

## 🧭 Table of Contents

1. [High-Level Architecture Overview](#1-high-level-architecture-overview)
2. [Desktop Application Workflow](#2-desktop-application-workflow)
3. [Self-Hosted Web Player Workflow](#3-self-hosted-web-player-workflow)
4. [One-Click In-App Hot-Updater Engine](#4-one-click-in-app-hot-updater-engine)
5. [Automated Cloud CI/CD Release Workflow (GitHub Actions)](#5-automated-cloud-cicd-release-workflow-github-actions)
6. [Day-to-Day Developer Runbook](#6-day-to-day-developer-runbook)

---

## 1. High-Level Architecture Overview

Singularity Player 2.0 operates on a **Unified Dual-Runtime Architecture**:

```
                                  ┌──────────────────────────────────────────────┐
                                  │             GITHUB REPOSITORY                │
                                  │      (takedaa83/Singularity-Player)          │
                                  └───────────────┬──────────────┬───────────────┘
                                                  │              │
                           git push [tag / code]  │              │  git fetch / releases API
                                                  ▼              ▼
                    ┌──────────────────────────────┐    ┌──────────────────────────────┐
                    │    GITHUB ACTIONS (CI/CD)    │    │      LIVE UPDATE ENGINE      │
                    │   • Windows Cloud Runner     │    │   • Remote Commit Inspector  │
                    │   • Auto-builds Setup.exe    │    │   • Delta Hash Comparator    │
                    │   • Auto-publishes Release   │    │   • One-Click In-App Rebuild │
                    └──────────────┬───────────────┘    └──────────────┬───────────────┘
                                   │                                   │
                                   ▼                                   ▼
┌──────────────────────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│            DESKTOP APPLICATION (WINDOWS)         │    │           SELF-HOSTED WEB INSTANCE           │
│  • Luxury 660x480 Startup Splash Screen          │    │  • Node.js 20+ / Docker Web Server           │
│  • Zero-Dependency In-Process Express Server     │    │  • Vite Production Client Bundle             │
│  • AppData Virtualized Storage                   │    │  • Background Git Fetch & Rebuild            │
│  • Discord RPC, System Tray & Global Media Keys  │    │  • Instant Browser Hot-Reload                │
└──────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

---

## 2. Desktop Application Workflow

### Phase 1: Startup & Splash Cinematics
1. When the user launches **`Singularity Player Setup.exe`** or **`Singularity Player 2.0.0.exe` (Portable)**, Electron immediately opens a frameless, transparent `660 × 480` splash window (`electron/splash.html`).
2. The splash card plays a **4.6-second** cinematic introduction sequence:
   * 40+ drifting particle field and multi-spectral ambient halos (`#8b5cf6`, `#fa2d55`, `#06b6d4`).
   * SVG vector lightning bolt draws its outline and reveals its gradient fill with an expanding glow ring.
   * Staggered **`S-I-N-G-U-L-A-R-I-T-Y`** typography and live boot phase status indicators.

### Phase 2: In-Process Zero-Dependency Server Boot
1. Concurrently while the splash plays, Electron's main process executes `server/dist/index.js`.
2. **`esbuild` Zero-Dependency Architecture**: The entire Express backend is bundled into a single standalone file with Express, CORS, Helmet, Rate-Limiting, Multer, and Undici inlined—**requiring zero external `node_modules` at runtime**.
3. **AppData Storage Virtualization**: All temporary downloads, streaming caches, and `yt-dlp` binaries are isolated in `%APPDATA%\Singularity Player\server_data`. This ensures the app runs with **100% reliability even when installed in read-only directories like `C:\Program Files`**.
4. Electron performs a health handshake probe against `http://localhost:8000/api/health`.

### Phase 3: Seamless Transition to Main UI
1. Once the health probe returns HTTP 200, the main window (`1360 × 860` frameless glass window) is prepared in the background.
2. Electron signals `splash:close`, triggering a fluid zoom & blur exit ease on the splash screen before revealing the main player window with zero visual flicker.

---

## 3. Self-Hosted Web Player Workflow

For users running Singularity Player as a web application on their local network or home server:

1. **Start Development**:
   ```bash
   npm run dev
   ```
   * Starts Vite dev server at `http://localhost:5173`.
   * Starts Express API server at `http://localhost:8000`.

2. **Start Production Server**:
   ```bash
   npm run build
   npm start
   ```
   * Compiles the React client into `client/dist` and the zero-dependency backend into `server/dist/index.js`.
   * Express serves both the REST API endpoints (`/api/...`) and the static web player on `http://localhost:8000`.

---

## 4. One-Click In-App Hot-Updater Engine

The updater eliminates the need to ever manually re-clone the repository or run terminal commands when new updates are pushed.

```
[Client App / Web Browser]
       │
       ├─► 1. Background Check: GET /api/updater/status
       │      │
       │      ▼
       │   [Server] ──► Checks local `git rev-parse HEAD` vs GitHub API
       │      │
       │      ▼
       │   [Client] ◄── Returns { updateAvailable: true, latestCommit, latestMessage }
       │
       ├─► 2. User clicks "Update to Latest Version" in Settings: POST /api/updater/apply
       │      │
       │      ▼
       │   [Server] ──► Runs `git fetch origin master && git reset --hard origin/master`
       │            ──► Runs `npm run build`
       │            ──► Sends { success: true }
       │
       └─► 3. [Client] Automatically triggers `window.location.reload()`
```

### Key Highlights:
* **Zero Rate-Limiting Overhead**: GitHub API queries are cached in-memory for 30 seconds.
* **TopBar Notification Pill**: If a new commit or release is detected, a glowing badge appears in the top navigation bar.
* **Live Progress Feedback**: The Settings UI displays real-time progress (`Fetching...` $\to$ `Building...` $\to$ `Reloading...`).

---

## 5. Automated Cloud CI/CD Release Workflow (GitHub Actions)

When you want to release a new version of the Desktop App, you **no longer need to build `.exe` files locally**:

### Workflow Configuration (`.github/workflows/release.yml`):
Whenever a version tag starting with `v` is pushed:

```bash
git tag v2.0.1
git push origin v2.0.1
```

### GitHub Cloud Execution Steps:
1. GitHub spins up an isolated **`windows-latest`** virtual runner.
2. Clones the repository and installs clean dependencies via `npm ci`.
3. Runs `node scripts/generateIcons.js` to create crisp multi-resolution Windows icons.
4. Executes `npm run dist:win` to compile the signed `Singularity Player Setup.exe` and `Singularity Player.exe` (Portable).
5. Automatically creates the GitHub Release, attaches the `.exe` binaries, and generates automated changelogs.

---

## 6. Day-to-Day Developer Runbook

### Making Code Changes & Pushing Updates

1. **Make your changes** in the workspace:
   ```bash
   # Test in development
   npm run dev:desktop
   ```

2. **Commit and Push Code** (Regular Updates):
   ```bash
   git add -A
   git commit -m "feat(audio): enhance DSP equalizer clarity"
   git push origin master
   ```
   * *The Self-Hosted Web Player and Dev instances can now update with 1-click in Settings.*

3. **Publish a Full Desktop Release**:
   ```bash
   git tag v2.0.1
   git push origin v2.0.1
   ```
   * *GitHub Actions builds and publishes the new Windows Setup and Portable `.exe` packages in ~2 minutes.*

---

*Singularity Player Architecture Team • 2026*
