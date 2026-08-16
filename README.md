<p align="center">
  <img src="https://img.shields.io/badge/Release-v3.0.0--FLAGSHIP-fa2d55?style=for-the-badge&logo=apple-music&logoColor=white" alt="Release Badge" />
  <img src="https://img.shields.io/badge/Architecture-Master--DSP-10b981?style=for-the-badge&logo=speedtest&logoColor=white" alt="DSP Architecture" />
  <img src="https://img.shields.io/badge/Design-Titanium%20Obsidian-0a0b0f?style=for-the-badge&logo=figma&logoColor=white" alt="Design System" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-3b82f6?style=for-the-badge&logo=linux&logoColor=white" alt="Platform Badge" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=for-the-badge" alt="License" />
</p>

<h1 align="center">🌌 Singularity Player</h1>

<p align="center">
  <strong>The Enterprise-Grade, Audiophile Music Streaming & Intelligence Platform</strong><br/>
  Powered by the custom <strong>Singularity Master Engine v3.0</strong>, sub-millisecond Better Lyrics syllable interpolation, real-time 4-channel Linkwitz-Riley stem demixing, YIN autocorrelation auto-tune, continuous EBU R128 LUFS loudness staging, and the luxury <strong>Titanium Obsidian & Radiant Rose</strong> design system.
</p>

<p align="center">
  <em>Search any song across global networks. Stream in lossless fidelity. Demix stems in real-time. Experience frame-perfect syllable lyrics. All local, private, and zero subscription fees.</em>
</p>

---

## 🧭 Table of Contents

1. [Architectural Master Pillars](#-architectural-master-pillars)
2. [Singularity Master Engine v3.0](#-singularity-master-engine-v30-flagship-edition)
3. [Sub-Millisecond Lyrics Highlighting Engine](#-sub-millisecond-lyrics-highlighting-engine)
4. [Titanium Obsidian & Radiant Rose Design System](#-titanium-obsidian--radiant-rose-design-system)
5. [Singularity AI Playlist Studio & DJ Harmonic Matrix](#-singularity-ai-playlist-studio--dj-harmonic-matrix)
6. [Audiophile DSP & Stems Pipeline](#-audiophile-dsp--stems-pipeline)
7. [Complete Feature Matrix](#-complete-feature-matrix)
8. [Getting Started & Installation](#-getting-started--installation)
9. [Keyboard Shortcuts](#-keyboard-shortcuts)
10. [License & Ethics](#-license--ethics)

---

## 🏛️ Architectural Master Pillars

Singularity Player is engineered with the rigor of industry-leading software teams (Apple Music, Spotify, Linear, and Figma), operating entirely locally with zero external API key requirements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SINGULARITY PLAYER v3.0                           │
├──────────────────────────────┬──────────────────────────────────────────────┤
│  🎨 PRESENTATION & STAGE     │  🌌 DSP & INTELLIGENCE ENGINE                │
│  • Titanium Obsidian Canvas  │  • Zero-Allocation Ring-Buffer Spectral FFT  │
│  • Frosted Glass (40px blur) │  • 7-Band Parametric Energy Metering         │
│  • Radiant Rose (#fa2d55)    │  • Transient & Beat Onset Detection          │
│  • Fluid Easing (0.16,1,0.3) │  • Continuous K-Weighted LUFS Auto-Matching  │
│  • Sub-Pixel Gradient Masks  │  • Predictive Multi-Track Neural Caching     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  🎤 SYLLABLE LYRICS PIPELINE │  🎛️ REAL-TIME STEM DEMIXING & FX             │
│  • Better Lyrics Tier-1 API  │  • 4-Channel Linkwitz-Riley Crossovers       │
│  • Apple Music TTML Parser   │  • YIN Pitch Autocorrelation Auto-Tune       │
│  • Background Harmonies (BG) │  • 10-Band Parametric Studio Equalizer       │
│  • Romaji & Hangul Phonetics │  • 3D Binaural Spatial Audio Panner          │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

---

## ⚡ Singularity Master Engine v3.0 (Flagship Edition)

Under the hood, all audio streaming, signal analysis, telemetry, and queue caching are unified under the singleton **`singularityEngine`**:

### 1. 🏎️ Zero-Allocation Ring-Buffer Spectral Analysis
- Pre-allocated typed arrays (`Uint8Array` / `Float32Array`) eliminate garbage collection churn during **60/120 FPS** real-time audio visualization and rendering.
- **7-Band Parametric Spectral Distribution**:
  $$\text{Sub-Bass (20–60Hz)} \;\vert\; \text{Bass (60–250Hz)} \;\vert\; \text{Low-Mid} \;\vert\; \text{Mid} \;\vert\; \text{High-Mid} \;\vert\; \text{Presence} \;\vert\; \text{Brilliance (8–20kHz)}$$

### 2. 🎯 Real-Time Transient & Beat Onset Detector
- Implements dynamic 43-sample history variance analysis targeting sub-bass energy spikes ($\le 180\text{Hz}$):
  $$\text{Instant Energy} > \overline{E}_{\text{history}} \times 1.38 \implies \text{Beat Event}$$

### 3. 🎚️ Continuous LUFS Loudness Auto-Matching
- Stage 1 K-Weighting pre-filter stage with continuous integrated loudness calculation:
  $$\text{LUFS} = -0.691 + 20 \cdot \log_{10}(\text{RMS}_{\text{smoothed}})$$
- Automatic soft-knee lookahead gain staging normalizes volume variance between track sources targeting $-14.0\text{ LUFS}$.

### 4. 🧠 Predictive Multi-Track Neural Caching
- Pre-fetches stream audio URLs, album art, and metadata for the **next 3 tracks in queue** in background worker threads, achieving **0ms latency transitions** and zero buffering upon track skip.

---

## 🎤 Sub-Millisecond Lyrics Highlighting Engine

Singularity Player features an advanced lyrics synchronization engine inspired by Apple Music and Better Lyrics:

* **Syllable-by-Syllable Precision**: Evaluates exact word timing progression continuously without artificial step delays:
  $$\text{Progress} = \text{clamp}\left(0, \frac{\text{currentTime} - \text{word.start}}{\text{word.end} - \text{word.start}}, 1\right)$$
* **Sub-Pixel Text Gradient Sweep**: Luminous white text sweep (`-webkit-background-clip: text`) with crisp edge feathering.
* **Apple Music TTML & LRC Syllable Cascade**: Natively parses `ttml:span` millisecond tags, backing vocal tracks (`role="x-bg"`), and multi-vocalist lines.
* **Dual-Language Phonetic Subtitles**: Real-time Japanese (Kana $\to$ Romaji), Korean (Hangul $\to$ RR), and translated subtitles.
* **Ambient Album Aura Backdrop**: Optical 100px frosted glass dynamic stage reacting organically to low-frequency beats.

---

## 🎨 Titanium Obsidian & Radiant Rose Design System

A cohesive, luxury design system built to eliminate visual clutter and establish aesthetic harmony:

* **Canvas Palette**:
  - **Base Canvas**: Deep Titanium Obsidian (`#0a0b0f`)
  - **Elevated Surfaces**: Frosted Titanium Glass (`#12141a` / `#191c24` / `#222631`)
  - **Signature Accent**: **Radiant Rose (`#fa2d55`)** — crisp contrast, luxury neon glow
* **Architectural Glassmorphism**:
  - `.glass-panel`: Silky `backdrop-filter: blur(32px) saturate(190%)` with top specular 1px borders (`inset 0 1px 0 0 rgba(255, 255, 255, 0.10)`).
  - `.glass-panel-strong`: `backdrop-filter: blur(40px) saturate(210%)` with deep box-shadows (`0 28px 70px rgba(0, 0, 0, 0.85)`).
* **Velvety Smooth Fluid Animations**:
  - Replaced snappy spring jumps with **`cubic-bezier(0.16, 1, 0.3, 1)`** easing curves across page transitions (`0.46s`), lyrics lines (`0.62s`), and drawers (`0.48s`).

---

## 🧠 Singularity AI Playlist Studio & DJ Harmonic Matrix

Curate bespoke track selections with natural language intelligence and acoustic mathematics:

* **💬 Conversational Refinement**: Stack iterative prompts (*"Make it more upbeat"*, *"Add dark indie synthwave"*) without losing locked tracks.
* **🔒 Per-Track Song Locking**: Pin favorite tracks while regenerating surrounding selections.
* **🎧 DJ Camelot Harmonic Mixing**:
  `Track A ──── [BPM +2 | Camelot 8A → 8B (Harmonic) | Energy +6%] ────► Track B`
* **🕸️ Multi-Node Cosine Vector Graph**: Interactive topological network mapping track affinity vectors across Tempo, Danceability, Energy, and Valence.

---

## 🎛️ Audiophile DSP & Stems Pipeline

* **4-Channel Stem Demixing**: Real-time Linkwitz-Riley 4th-order filter crossover isolation of **Vocals**, **Drums**, **Bass**, and **Melody** with instant Karaoke mutes.
* **YIN Pitch Autocorrelation**: Studio-grade pitch estimation and chromatic/modal scale quantization.
* **10-Band Parametric Equalizer**: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz with studio presets.
* **Procedural Ambience Synthesizer**: Binaural Rain, Ocean Surf, Forest Wind, and Brown Noise generator.
* **Picture-in-Picture (PiP) Floating Mini-Player**: Native browser-level video canvas mini-player with interactive album art and playback controls.

---

## 📊 Complete Feature Matrix

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Singularity Master Engine v3.0** | Real-time zero-allocation DSP, beat detection, LUFS matching | ✅ Production |
| **Better Lyrics + TTML Engine** | Sub-millisecond syllable-by-syllable word highlighting | ✅ Production |
| **Titanium Obsidian UI** | Deep slate frosted glass with Radiant Rose accent | ✅ Production |
| **Velvety Fluid Transitions** | Apple-grade cubic-bezier fluid motion across all sheets & pages | ✅ Production |
| **AI Stem Separation** | Linkwitz-Riley 4-channel demixing (Vocals/Drums/Bass/Melody) | ✅ Production |
| **YIN Auto-Tune** | Fundamental frequency pitch autocorrelation & scale quantizer | ✅ Production |
| **AI Playlist Studio** | Natural language conversational curation + DJ Camelot flow | ✅ Production |
| **Shazam Audio Identifier** | Microphone FFT constellation hashing for real-time track identification | ✅ Production |
| **Batch Offline Downloads** | Concurrent multithreaded MP3 downloader with ID3 tag writing | ✅ Production |
| **Spotify Library Importer** | Instant playlist and liked songs migration via public API | ✅ Production |

---

## 🚀 Getting Started & Installation

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **npm** or **pnpm** / **yarn**

### 1. Clone the Repository
```bash
git clone https://github.com/takedaa83/Singularity-Player---private.git
cd "Singularity-Player---private"
```

### 2. Install Dependencies
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Run Development Environment
```bash
# Terminal 1: Start Backend API & Stream Server
cd server
npm run dev

# Terminal 2: Start Frontend Application
cd client
npm run dev
```

### 4. Build for Production
```bash
# Build Server
cd server
npm run build

# Build Client
cd ../client
npm run build
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Cmd + K` / `Ctrl + K` / `/` | Open Raycast Command Palette |
| `Space` | Play / Pause Playback |
| `Arrow Left` / `Arrow Right` | Seek Backward / Forward 5s |
| `Arrow Up` / `Arrow Down` | Adjust Volume Up / Down 5% |
| `M` | Toggle Mute |
| `N` | Skip to Next Track |
| `P` | Jump to Previous Track |
| `L` | Toggle Lyrics View (Side / Fullscreen) |
| `Q` | Open Play Queue Drawer |
| `E` | Open 10-Band Studio Equalizer |

---

## 📜 License & Ethics

Singularity Player is licensed under the **MIT License**. Built with passion for open-source digital signal processing, modern web standards, and high-fidelity audio engineering.

<p align="center">
  Made with 💖 by the Singularity Engineering Team
</p>
