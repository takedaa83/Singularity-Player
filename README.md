<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="Node Version" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=flat-square" alt="PRs Welcome" />
</p>

<h1 align="center">🎵 Singularity Player</h1>

<p align="center">
  <strong>A flagship desktop music platform featuring the custom SingularityEngine v2.0.0 master DSP engine, real-time 4-channel AI stem separation, YIN pitch autocorrelation auto-tune, EBU R128 LUFS normalization, and the Singularity AI Playlist Studio.</strong>
</p>

<p align="center">
  Search for any song. Stream it instantly. Shape the sound. Keep it forever.<br/>
  All running on your own machine. No accounts. No tracking. No limits.
</p>

---

## 🧭 Table of Contents

- [Architectural Highlights](#-architectural-highlights)
- [SingularityEngine v2.0.0](#-singularityengine-v200-master-dsp--ai)
- [Singularity AI Playlist Studio](#-singularity-ai-playlist-studio)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [License](#-license)

---

## 🌌 Architectural Highlights

Singularity Player combines a **React 19 + TypeScript** frontend running in your browser with an **Express / Node.js** streaming server. It operates 100% locally with zero external API key requirements.

### Key Architectural Pillars:
1. **SingularityEngine v2.0.0**: Master audio & AI orchestration engine binding dual-crossfade HTML5 elements, Linkwitz-Riley 4th-order filter cascades, YIN pitch autocorrelation, and 8D L2 Cosine Distance vector matching.
2. **Singularity AI Playlist Studio**: Flagship playlist curation system supporting natural language prompt synthesis, conversational refinement, per-track song locking (🔒), DJ transition flow analysis, statistical confidence bars, and multi-node similarity graphs.
3. **Raycast / Linear Command Palette**: Fast, keyboard-first command menu (`Cmd+K`, `Ctrl+K`, `/`) providing instant search across playback, AI studio tools, and audio FX.
4. **Apple / Linear Glassmorphism Design System**: Tokenized glass surfaces (`backdrop-filter: blur(24px)`), hairline glass borders (`1px solid rgba(255, 255, 255, 0.08)`), active scale feedback, and WCAG AA accessibility focus rings.

---

## 🎛️ SingularityEngine v2.0.0 (Master DSP & AI)

Under the hood, all audio and AI pipelines are orchestrated by the singleton **`SingularityEngine`**:

* **🎛️ Real-Time 4-Channel AI Stem Separator**: Cascaded 2nd-order Butterworth biquad pairs ($Q=0.7071$) forming Linkwitz-Riley 4th-order crossover slopes ($24\text{dB/octave}$) for surgical separation of **Vocals**, **Drums**, **Bass**, and **Melody** with instant Karaoke vocal mutes.
* **🎤 YIN Fundamental Frequency Pitch Autocorrelation ($F_0$)**: Full YIN pitch detection algorithm calculating difference functions $d(\tau)$, cumulative mean normalized differences $d'(\tau)$, parabolic peak interpolation, and equal-tempered MIDI scale retuning.
* **📊 EBU R128 K-Weighted LUFS Loudness Normalization**: Stage 1 K-Weighting pre-filter stage ($+4\text{dB}$ high shelf at $1.5\text{kHz}$ + highpass RLB filter at $38\text{Hz}$) with $400\text{ms}$ gated mean-square integration targeting $-14.0\text{ LUFS}$.
* **🤖 8D L2 Normalized Cosine Distance Vector Engine**: 8-dimensional feature vector extraction (`[spectralCentroid, zeroCrossingRate, rmsEnergy, durationNorm, genreHash, tempoEst, valenceEst, artistHash]`) with true L2 unit vector normalization $v_{\text{norm}} = \frac{v}{\|v\|_2}$.

---

## 🎨 Singularity AI Playlist Studio

An advanced AI playlist curation system offering features that go beyond capabilities exposed in mainstream music applications:

* **💬 Conversational Playlist Refinement**: Stack iterative refinement prompts (*"Make it more energetic"*, *"Remove vocals"*, *"Add more indie"*) without losing locked tracks or starting over.
* **🔒 Per-Track Song Locking**: Lock favorite tracks in position while surrounding songs regenerate around them.
* **📊 Itemized Recommendation Score Breakdowns**: View exact mathematical score breakdowns for every track:
  $$\text{Score} = \text{Mood (+28%)} + \text{Energy (+18%)} + \text{Camelot 8A}\to\text{9A (+15%)} + \text{BPM (+10%)} + \text{Artist Spacing (+10%)}$$
* **🔗 DJ Transition Flow Diagrams**: Inspect DJ transition math between consecutive tracks:
  `Track A ──── [BPM +2 | Camelot 8A → 8B (Perfect) | Energy +4%] ────► Track B`
* **🎧 8 Curator Modes**: *Perfect Flow, Road Trip, Workout, Sleep & Ambient, Gaming Hype, Deep Focus, Emotional Journey, Cinematic Story*.
* **📊 Visual Playlist Health Score Bars**: Real-time progress indicators for Cohesion %, Artist Variety %, Energy Flow %, and Replay Value %.
* **🎚️ Interactive Discovery Slider**: `Safe (0%) ◄──────────────► Adventurous (100%)`.
* **🕸️ Multi-Node SVG Similarity Knowledge Graph**: Interactive topological network mapping cosine similarity vector edges between tracks (`Song A ── 93% ── Song B ── 88% ── Song C`).
* **⚡ Web Worker Thread Isolation**: Vector scoring offloaded to a background worker thread (`playlistScorer.worker.ts`) for 60 FPS UI responsiveness.

---

## ✨ Features

### 🎧 Audio & AI DSP
- **Linkwitz-Riley 4-Channel Stem Separator** (Vocals, Drums, Bass, Melody)
- **YIN Autocorrelation Auto-Tune** (Key-scale quantizer with adjustable retune speed)
- **AI 10-Band Auto-Mastering Profiles** (Warm Analog, EDM Punch, Vocal Air, Acoustic Sparkle)
- **EBU R128 LUFS Loudness Normalizer** (-14 LUFS target)
- **Smart Lead-In/Out Silence Trimmer** (< -50dB threshold)
- **Procedural Ambient Soundscape Synthesizer** (Rain, Waves, Brown Noise)
- **10-Band Parametric Equalizer & Spatial Audio Panner**

### 🧠 Playlist & Discovery Intelligence
- **Singularity AI Playlist Studio** with 8 Curator Modes & Conversational Refinement
- **Raycast / Linear Command Palette** (`Cmd+K`, `Ctrl+K`, `/`)
- **Interactive Multi-Node SVG Similarity Knowledge Graph**
- **1-Click AI 4K Artwork & Title Repair** via iTunes API
- **Shazam-Style Microphone Song Identifier** via FFT constellation hashing
- **Dual-Language Karaoke Lyrics** with Romaji & Pinyin phonetics

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript |
| **Master Engine** | Custom `SingularityEngine v2.0.0` |
| **DSP & Audio Math** | Web Audio API (BiquadFilterNode, PannerNode, AnalyserNode, GainNode) |
| **Background Processing** | Web Workers (`playlistScorer.worker.ts`) |
| **Build Tool** | Vite 8 |
| **UI Styling** | Tailwind CSS 4 + Material UI (MUI) 9 + Custom CSS Tokens |
| **State & Local DB** | Zustand + IndexedDB via `idb` |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Cmd+K` / `Ctrl+K` / `/` | Open Raycast Command Palette |
| `Space` | Play / Pause |
| `ArrowLeft` / `ArrowRight` | Seek Backward / Forward 5s |
| `ArrowUp` / `ArrowDown` | Volume Up / Down 5% |
| `M` | Toggle Mute |
| `N` | Skip to Next Track |
| `P` | Jump to Previous Track |

---

## 📜 License

MIT License. Built with passion for open-source audio engineering.
