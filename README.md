<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.5.0--FLAGSHIP-fa2d55?style=for-the-badge&logo=apple-music&logoColor=white" alt="Release Badge" />
  <img src="https://img.shields.io/badge/Desktop-Native%20Windows%20x64-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows Native" />
  <img src="https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord RPC" />
  <img src="https://img.shields.io/badge/DSP-Master--Engine%20v3.0-10b981?style=for-the-badge&logo=speedtest&logoColor=white" alt="DSP Architecture" />
  <img src="https://img.shields.io/badge/UI-Titanium%20Obsidian-0a0b0f?style=for-the-badge&logo=figma&logoColor=white" alt="Design System" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=for-the-badge" alt="License" />
</p>

<h1 align="center">🌌 Singularity Player (v1.5.0 Flagship)</h1>

<p align="center">
  <strong>The Enterprise-Grade, Audiophile Music Streaming, Desktop & Intelligence Platform</strong><br/>
  Powered by the custom <strong>Singularity Master Engine v3.0</strong>, Native Windows Desktop & Electron architecture, Discord Rich Presence, sub-millisecond Better Lyrics syllable interpolation, real-time 4-channel Linkwitz-Riley stem demixing, continuous EBU R128 LUFS loudness staging, and the luxury <strong>Titanium Obsidian & Radiant Rose</strong> design system.
</p>

<p align="center">
  <em>Search any song across global networks. Stream in lossless fidelity. Demix stems in real-time. Broadcast to Discord. Inspect live system telemetry. All local, private, and zero subscription fees.</em>
</p>

---

## 🧭 Table of Contents

1. [Architectural Master Pillars](#-architectural-master-pillars)
2. [Native Desktop Application (Windows)](#-native-desktop-application-windows)
3. [Singularity Master Engine v3.0](#-singularity-master-engine-v30-flagship-edition)
4. [Live Developer & Diagnostic Console](#-live-developer--diagnostic-system-console)
5. [Sub-Millisecond Lyrics Highlighting Engine](#-sub-millisecond-lyrics-highlighting-engine)
6. [Audiophile DSP & Stems Pipeline](#-audiophile-dsp--stems-pipeline)
7. [Desktop vs Web Feature Matrix](#-desktop-vs-web-feature-matrix)
8. [Installation & Getting Started](#-installation--getting-started)
9. [Keyboard Shortcuts](#-keyboard-shortcuts)
10. [License & Ethics](#-license--ethics)

---

## 🏛️ Architectural Master Pillars

Singularity Player is engineered with the rigor of industry-leading software teams (Apple Music, Spotify, Linear, and Figma), operating entirely locally with zero external API key requirements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SINGULARITY PLAYER v1.5.0                         │
├──────────────────────────────┬──────────────────────────────────────────────┤
│  🖥️ DESKTOP NATIVE (ELECTRON) │  🌌 DSP & INTELLIGENCE ENGINE                │
│  • Discord Rich Presence RPC │  • Zero-Allocation Ring-Buffer Spectral FFT  │
│  • Background System Tray    │  • 7-Band Parametric Energy Metering         │
│  • Global OS Media Keys      │  • Transient & Beat Onset Detection          │
│  • Floating Mini-Player (PiP)│  • Continuous K-Weighted LUFS Auto-Matching  │
│  • OBS Studio Overlay Engine │  • Predictive Multi-Track Neural Caching     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  🎨 PRESENTATION & STAGE     │  🎛️ REAL-TIME STEM DEMIXING & FX             │
│  • Titanium Obsidian Canvas  │  • 4-Channel Linkwitz-Riley Crossovers       │
│  • Frosted Glass (40px blur) │  • YIN Pitch Autocorrelation Auto-Tune       │
│  • Radiant Rose (#fa2d55)    │  • 10-Band Parametric Studio Equalizer       │
│  • Fluid Easing (0.16,1,0.3) │  • 3D Binaural Spatial Audio Panner          │
│  • Sub-Pixel Gradient Masks  │  • Live Diagnostic Terminal Console          │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

---

## 🖥️ Native Desktop Application (Windows)

Singularity Player now runs as a **high-performance, standalone 64-bit Windows desktop application** with deep operating system integration:

* **🎮 Discord Rich Presence (RPC)**: Automatically displays your currently playing track, artist, album art, elapsed time, and total duration on your Discord profile in real time via local IPC pipes (`\\.\pipe\discord-ipc-0`).
* **📌 Background System Tray**: Keep music playing seamlessly in the background. Minimize to tray, control playback, skip tracks, and adjust volume without cluttering your taskbar.
* **⌨️ Global OS Media Keys**: Control playback (`Play/Pause`, `Next`, `Previous`, `Mute`) globally across Windows even while playing games or working in fullscreen applications.
* **🪟 Picture-in-Picture Mini-Player**: Detach a floating, always-on-top glass mini-player (`Ctrl + Shift + M`) for quick track control and visual feedback.
* **🎥 OBS Studio Stream Integration**: Broadcast real-time track metadata and dynamic animated now-playing widgets to OBS Studio or streaming software via the local overlay server.

---

## ⚡ Singularity Master Engine v3.0 (Flagship Edition)

Under the hood, all audio streaming, signal analysis, telemetry, and queue caching are unified under the singleton **`singularityEngine`**:

### 1. 🏎️ Zero-Allocation Ring-Buffer Spectral Analysis
- Pre-allocated typed arrays (`Uint8Array` / `Float32Array`) eliminate garbage collection churn during **60/120 FPS** real-time audio visualization and rendering.
- **7-Band Parametric Spectral Distribution**:
  $$\text{Sub-Bass (20–60Hz)} \;\vert\; \text{Bass (60–250Hz)} \;\vert\; \text{Low-Mid} \;\vert\; \text{Mid} \;\vert\; \text{High-Mid} \;\vert\; \text{Presence} \;\vert\; \text{Brilliance (8–20kHz)}$$

### 2. 🎯 Real-Time Transient & Beat Onset Detector
- Dynamic 43-sample history variance analysis targeting sub-bass energy spikes ($\le 180\text{Hz}$):
  $$\text{Instant Energy} > \overline{E}_{\text{history}} \times 1.38 \implies \text{Beat Event}$$

### 3. 🎚️ Continuous LUFS Loudness Auto-Matching
- Stage 1 K-Weighting pre-filter stage with continuous integrated loudness calculation:
  $$\text{LUFS} = -0.691 + 20 \cdot \log_{10}(\text{RMS}_{\text{smoothed}})$$
- Automatic soft-knee lookahead gain staging normalizes volume variance between track sources targeting $-14.0\text{ LUFS}$.

### 4. 🧠 Predictive Multi-Track Neural Caching
- Pre-fetches stream audio URLs, album art, and metadata for the **next 3 tracks in queue** in background worker threads, achieving **0ms latency transitions** and zero buffering upon track skip.

---

## 💻 Live Developer & Diagnostic System Console

Access a full terminal inside the **Settings** view to monitor system health and run diagnostics:

* **Real-time Log Stream**: Rolling buffer of 1,500 events capturing audio engine state, stream resolution, and Discord RPC events.
* **Instant Category Filters**: `All Logs`, `Audio & DSP`, `Network & API`, `Server Engine`, `Desktop & Discord`, and `Database & Cache`.
* **Diagnostic Actions**:
  - 📡 **Ping Server**: Probes backend `/api/health` and logs round-trip latency in milliseconds.
  - 🎵 **Test DSP Audio**: Validates WebAudio Context, sample rate, gain stages, and render FPS.
  - 📋 **Copy to Clipboard**: Copies formatted logs with ISO timestamps.
  - 💾 **Export `.log`**: Generates a downloadable diagnostic report (`singularity_diagnostics.log`).

---

## 🎤 Sub-Millisecond Lyrics Highlighting Engine

* **Syllable-by-Syllable Precision**: Evaluates exact word timing progression continuously without artificial step delays:
  $$\text{Progress} = \text{clamp}\left(0, \frac{\text{currentTime} - \text{word.start}}{\text{word.end} - \text{word.start}}, 1\right)$$
* **Sub-Pixel Text Gradient Sweep**: Luminous white text sweep (`-webkit-background-clip: text`) with crisp edge feathering.
* **Apple Music TTML & LRC Syllable Cascade**: Natively parses `ttml:span` millisecond tags, backing vocal tracks (`role="x-bg"`), and multi-vocalist lines.
* **Dual-Language Phonetic Subtitles**: Real-time Japanese (Kana $\to$ Romaji), Korean (Hangul $\to$ RR), and translated subtitles.
* **Ambient Album Aura Backdrop**: Optical 100px frosted glass dynamic stage reacting organically to low-frequency beats.

---

## 🎛️ Audiophile DSP & Stems Pipeline

1. **Linkwitz-Riley 4th Order Crossovers ($24\text{ dB/octave}$)**: Phase-aligned 4-channel frequency splitting separating Vocals, Bass, Drums, and Melody in real-time.
2. **YIN Pitch Autocorrelation & Auto-Tune**: Sub-harmonic pitch extraction correcting vocal pitch deviation to the nearest chromatic scale degree.
3. **10-Band Parametric Studio Equalizer**: Precision graphic filters with customized audiophile presets (Acoustic, Bass Boost, Club, Electronic, Vocal Boost, Flat).
4. **3D Binaural Spatial Audio**: WebAudio PannerNode positioning sound sources in simulated 3D acoustic environments.

---

## 📊 Desktop vs Web Feature Matrix

| Feature | Desktop App (.exe) | Web Player (Browser) |
| :--- | :---: | :---: |
| **Discord Rich Presence (RPC)** | ✅ **Native** | ❌ (Browser Sandbox) |
| **System Tray Background Playback** | ✅ **Native** | ❌ |
| **Global OS Media Keys (In-Game)** | ✅ **Native** | ⚠️ (Browser Active Only) |
| **Floating Mini-Player Window** | ✅ **Always-on-Top** | ⚠️ (Standard PiP) |
| **Zero-Configuration In-Process Server** | ✅ **Built-in** | ⚠️ (Requires Server Host) |
| **Lossless Audio Streaming & DSP** | ✅ **Full Engine** | ✅ **Full Engine** |
| **Syllable-by-Syllable Lyrics** | ✅ **Full Engine** | ✅ **Full Engine** |
| **Real-Time Stem Demixing & FX** | ✅ **Full Engine** | ✅ **Full Engine** |
| **Live Developer Diagnostic Console** | ✅ **Full Engine** | ✅ **Full Engine** |
| **IndexedDB Offline Music Storage** | ✅ **Persistent** | ✅ **Persistent** |

---

## 🚀 Installation & Getting Started

### 📦 Option 1: Native Windows Desktop Executables (Recommended)
1. **Installer**: Double-click **`Singularity Player Setup 1.5.0.exe`** to install Singularity Player to your Windows Start Menu and Desktop.
2. **Portable**: Double-click **`Singularity Player Portable.exe`** for zero-install, instant portable playback anywhere.

### 🛠️ Option 2: 1-Click Interactive Batch Launcher
Double-click **`Start Singularity Player.bat`** in the repository root and choose:
* `[1]` Launch Native Desktop App
* `[2]` Start Local Web Player + Server
* `[3]` Build Windows Installer Executables (.exe)

### 💻 Option 3: Developer Setup (Node.js 18+)
```bash
# 1. Clone the repository
git clone https://github.com/takedaa83/Singularity-Player.git
cd Singularity-Player

# 2. Install all dependencies
npm install

# 3. Start development server & Electron app
npm run dev

# 4. Package standalone Windows executables
npm run dist:win
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Space`** | Play / Pause |
| **`J` / `←`** | Seek Backward 5 Seconds |
| **`L` / `→`** | Seek Forward 5 Seconds |
| **`K`** | Toggle Play / Pause |
| **`Shift + N`** | Next Track |
| **`Shift + P`** | Previous Track |
| **`↑` / `↓`** | Adjust Volume $\pm 5\%$ |
| **`M`** | Toggle Mute |
| **`F`** | Toggle Fullscreen Mode |
| **`Ctrl + K` / `⌘K`** | Open Command Palette / Global Search |
| **`Ctrl + Shift + M`** | Toggle Floating Mini-Player (Desktop) |
| **`F12`** | Toggle Developer Tools (Desktop) |

---

## 📜 License & Ethics

Singularity Player is distributed under the **MIT License**. It does not store user data remotely, tracks zero analytics, requires no user account or subscription, and is designed purely for private, local audiophile music enjoyment.
