<p align="center">
  <img src="https://img.shields.io/badge/Release-v2.0.0--FLAGSHIP-fa2d55?style=for-the-badge&logo=apple-music&logoColor=white" alt="Release Badge" />
  <img src="https://img.shields.io/badge/Desktop-Native%20Windows%20x64-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows Native" />
  <img src="https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord RPC" />
  <img src="https://img.shields.io/badge/DSP-Master--Engine%20v3.0-10b981?style=for-the-badge&logo=speedtest&logoColor=white" alt="DSP Architecture" />
  <img src="https://img.shields.io/badge/UI-Titanium%20Obsidian-0a0b0f?style=for-the-badge&logo=figma&logoColor=white" alt="Design System" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=for-the-badge" alt="License" />
</p>

<h1 align="center">🌌 Singularity Player 2.0</h1>

<p align="center">
  <strong>The Enterprise-Grade, Audiophile Music Streaming, Desktop & Intelligence Platform</strong><br/>
  Powered by the custom <strong>Singularity Master Engine v3.0</strong>, Native Windows 64-Bit Desktop Architecture, Discord Rich Presence, Sub-Millisecond Syllable-by-Syllable Lyrics, Real-Time 4-Channel Linkwitz-Riley Stem Demixing, Continuous EBU R128 LUFS Loudness Staging, Zero-Dependency Backend Bundle, and the Signature <strong>Titanium Obsidian & Radiant Rose</strong> Design System.
</p>

<p align="center">
  <em>Search any track across global networks. Stream in lossless fidelity. Demix vocal/instrumental stems in real-time. Broadcast live to Discord & OBS. Inspect real-time system telemetry. All local, 100% private, and zero subscription fees.</em>
</p>

---

## 🧭 Table of Contents

1. [✨ What's New in 2.0.0](#-whats-new-in-200)
2. [📦 Download Windows Executables](#-download-windows-executables)
3. [🚀 Step-by-Step Local Self-Hosting Guide](#-step-by-step-local-self-hosting-guide)
4. [🖥️ Native Desktop Architecture](#-native-desktop-architecture-windows)
5. [⚡ Singularity Master Engine v3.0](#-singularity-master-engine-v30)
6. [🎛️ Audiophile DSP & Stems Pipeline](#-audiophile-dsp--stems-pipeline)
7. [🎤 Sub-Millisecond Syllable Lyrics](#-sub-millisecond-syllable-lyrics)
8. [💻 Live Developer & Diagnostic System Console](#-live-developer--diagnostic-system-console)
9. [⌨️ Keyboard Shortcuts Reference](#-keyboard-shortcuts-reference)
10. [🏛️ Technology Stack](#-technology-stack)
11. [📄 License & Ethics](#-license--ethics)

---

## ✨ What's New in 2.0.0

* 🎬 **Cinematic Startup Experience**: Luxury animated obsidian splash screen with drifting multi-color particle canvas, luminous gradient drawing bolt glyph, and smooth window reveal.
* 🎨 **High-Resolution Multi-Layer Windows Icons**: Custom 512x512 rounded squircle emblem with radiant rose, electric purple, and cyber cyan gradient halos across installer, uninstaller, taskbar, and portable executables.
* ⚡ **Zero-Dependency Standalone Backend**: Entire Express backend compiled into a self-contained runtime bundle with `esbuild`, starting up in `< 20ms` without external `node_modules` requirements.
* 🛡️ **Virtualized AppData Storage**: Complete isolation of write operations into `%APPDATA%\Singularity Player\server_data`, allowing seamless execution from `C:\Program Files`, portable USB sticks, or read-only environments without administrator privileges.
* 🔀 **Instant Client Hash Navigation**: Zero-latency tab switching across Library, Artists, Albums, Favorites, History, Downloads, Time Capsule, and Settings.

---

## 📦 Download Windows Executables

You can download the pre-compiled, signed Windows 64-bit binaries directly from the **[GitHub Releases](https://github.com/takedaa83/Singularity-Player/releases)** page:

| Package | Filename | Description |
| :--- | :--- | :--- |
| **Windows Installer** | `Singularity Player Setup 2.0.0.exe` | Standard Windows NSIS Setup. Creates Desktop & Start Menu shortcuts, registers file associations, and supports silent background updates. |
| **Portable Executable** | `Singularity Player 2.0.0.exe` | Zero-install standalone executable. Double-click and run directly from anywhere (Desktop, USB drive, external drive). |

---

## 🚀 Step-by-Step Local Self-Hosting Guide

Singularity Player is designed to run locally on your own machine or private home server with zero external database setup required.

### 📋 Prerequisites

* **Node.js**: `v18.0.0` or higher installed ([Download Node.js](https://nodejs.org/))
* **Git**: Installed on your system ([Download Git](https://git-scm.com/))
* **Operating System**: Windows 10/11, macOS, or Linux

### 1. Clone the Repository

```bash
git clone https://github.com/takedaa83/Singularity-Player.git
cd Singularity-Player
```

### 2. Install All Monorepo Dependencies

```bash
npm install
```

### 3. Run in Local Development Mode

Start both the Vite frontend development server (`http://localhost:5173`) and the Express API backend (`http://localhost:8000`) simultaneously:

```bash
npm run dev
```

* Open your browser and navigate to: **`http://localhost:5173`**
* Search, stream, and enjoy your music!

### 4. Run the Native Desktop App in Development

To launch the native Electron desktop application with hot module replacement:

```bash
npm run dev:desktop
```

### 5. Build Standalone Production Binaries

#### Build Full Web Production App:
```bash
npm run build
```
This generates the optimized client in `client/dist` and the standalone zero-dependency backend in `server/dist/index.js`.

#### Package Standalone Windows `.exe` Installers:
```bash
npm run dist:win
```
The resulting executables (`Singularity Player Setup 2.0.0.exe` and `Singularity Player 2.0.0.exe`) will be output to the `dist-electron/` folder.

#### Run the Production Server Directly:
```bash
npm start
```
The self-hosted server will bind to `http://localhost:8000` and serve both API routes and static frontend client files.

---

## 🖥️ Native Desktop Architecture (Windows)

Singularity Player desktop operates with deep native operating system integration:

* **🎮 Discord Rich Presence (RPC)**: Automatically displays your currently playing track, artist name, cover art, elapsed playback time, and total track duration on your Discord status via local IPC pipes (`\\.\pipe\discord-ipc-0`).
* **📌 Background System Tray**: Keep music playing seamlessly with zero interruption. Minimize to the system tray, control playback with the tray context menu, and pause/skip without opening the main window.
* **⌨️ Global OS Media Keys**: Control playback (`Play/Pause`, `Next`, `Previous`, `Mute`) globally across Windows even while in full-screen games or work software.
* **🪟 Picture-in-Picture Mini-Player**: Detach a floating, always-on-top glass mini-player (`Ctrl + Shift + M`) for ambient desk listening.
* **🎥 OBS Studio Stream Integration**: Broadcast real-time track metadata and dynamic animated now-playing widgets to OBS Studio or streaming software via the local overlay server.

---

## ⚡ Singularity Master Engine v3.0

All audio streaming, telemetry, signal analysis, and queue caching are unified under the singleton **`singularityEngine`**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SINGULARITY MASTER ENGINE v3.0                    │
├──────────────────────────────┬──────────────────────────────────────────────┤
│  🏎️ ZERO-ALLOCATION FFT      │  🧠 PREDICTIVE NEURAL CACHING                │
│  • Ring-buffer typed arrays  │  • 3-track lookahead prefetching             │
│  • 60/120 FPS frame timing   │  • Zero-latency track transitions            │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  🎯 TRANSIENT & BEAT ONSET   │  🎚️ CONTINUOUS LUFS AUTO-MATCHING             │
│  • Dynamic variance detector │  • K-Weighting filter stage                  │
│  • Sub-bass energy targeting │  • Soft-knee lookahead gain normalizer       │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 1. Zero-Allocation Ring-Buffer Spectral Analysis
Pre-allocated typed arrays (`Uint8Array` / `Float32Array`) eliminate garbage collection churn during **60/120 FPS** real-time audio visualization:
$$\text{Sub-Bass (20–60Hz)} \;\vert\; \text{Bass (60–250Hz)} \;\vert\; \text{Low-Mid} \;\vert\; \text{Mid} \;\vert\; \text{High-Mid} \;\vert\; \text{Presence} \;\vert\; \text{Brilliance (8–20kHz)}$$

### 2. Real-Time Transient & Beat Onset Detector
Dynamic 43-sample history variance analysis targeting sub-bass energy spikes ($\le 180\text{Hz}$):
$$\text{Instant Energy} > \overline{E}_{\text{history}} \times 1.38 \implies \text{Beat Event Trigger}$$

### 3. Continuous LUFS Loudness Auto-Matching
Stage 1 K-Weighting pre-filter stage with continuous integrated loudness calculation:
$$\text{LUFS} = -0.691 + 20 \cdot \log_{10}(\text{RMS}_{\text{smoothed}})$$
Automatic soft-knee lookahead gain staging normalizes volume variance between track sources targeting $-14.0\text{ LUFS}$.

---

## 🎛️ Audiophile DSP & Stems Pipeline

Singularity Player includes a full 32-bit floating point WebAudio DSP graph:

```
Source -> Gain Normalizer -> 10-Band Parametric EQ -> 4-Way Linkwitz-Riley Crossover -> 3D Spatial Panner -> Master Compressor -> Speakers
                                                                 │
                                                ┌────────────────┼────────────────┐
                                                ▼                ▼                ▼
                                            [Vocals]        [Instruments]      [Drums/Bass]
```

* **4-Channel Linkwitz-Riley Crossovers ($24\text{ dB/octave}$)**: Isolates Vocals, Bass, Drums, and Melody with phase-coherent state variable biquads.
* **10-Band Parametric Studio Equalizer**: Precision sliders from $32\text{Hz}$ to $16\text{kHz}$ with audiophile presets (Bass Boost, Vocal Clarity, Electronic, Acoustic, Flat).
* **3D Binaural Spatial Audio**: Positional 3D soundfield emulation with azimuth, elevation, and room-reverb modeling.

---

## 🎤 Sub-Millisecond Syllable Lyrics

Powered by the **`SyllableInterpolator`** engine:
* **High-Precision Interpolation**: Calculates exact sub-character progress using sub-millisecond linear time mapping:
  $$\text{Progress} = \text{clamp}\left(\frac{t - t_{\text{start}}}{t_{\text{end}} - t_{\text{start}}}, 0, 1\right)$$
* **Luminous Gradient Sweep**: Active syllables reveal fluidly using CSS sub-pixel gradient masks (`linear-gradient(90deg, #ffffff X%, rgba(...) X%)`).
* **Auto-Scroll Tracking**: Smooth cubic-bezier auto-centering keeps active lyrical verses in view with zero jitter.

---

## 💻 Live Developer & Diagnostic System Console

Access the comprehensive diagnostic terminal inside **Settings $\to$ Developer & Diagnostic System Console**:

* **🔍 Real-Time Stream Capture**: Monitors all `APP`, `DSP`, `SYSTEM`, and `NETWORK` events in a high-speed rolling ring-buffer.
* **⚡ Interactive Diagnostic Utilities**:
  * `Ping Internal Server`: Instant round-trip latency probe to `http://localhost:8000/api/health`.
  * `Test DSP Audio Pipeline`: Generates a pure $440\text{Hz}$ audiophile A4 sine-wave to verify the DSP audio node graph.
  * `Export Diagnostic Log`: Downloads a formatted `.log` diagnostic snapshot for debugging and performance auditing.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>Space</kbd> | Play / Pause | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>→</kbd> | Next Track | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> | Previous Track | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>↑</kbd> | Volume Up (+5%) | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>↓</kbd> | Volume Down (-5%) | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>M</kbd> | Mute / Unmute | Global In-App |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> | Toggle Picture-in-Picture Mini-Player | Desktop App |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Focus Search Bar | Global In-App |
| <kbd>F12</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> | Toggle Chrome Developer Tools | Desktop App |
| <kbd>MediaPlayPause</kbd> | OS Global Play/Pause | System-wide |
| <kbd>MediaNextTrack</kbd> | OS Global Next Track | System-wide |
| <kbd>MediaPreviousTrack</kbd> | OS Global Previous Track | System-wide |

---

## 🏛️ Technology Stack

* **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, GSAP Animation Engine
* **Backend**: Node.js 20+, Express, `esbuild` Standalone Bundler, `music-metadata`, `undici`, `yt-dlp`
* **Desktop Platform**: Electron 43+, Electron-Builder, Windows NSIS, Discord-RPC, Windows Taskbar Thumbnails
* **Audio Core**: WebAudio API 32-bit Floating Point DSP, Linkwitz-Riley Crossovers, Linkwitz-Transform EQ

---

## 📄 License & Ethics

Singularity Player is released under the **MIT License**.

```
Copyright (c) 2026 Singularity Player Architecture Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
