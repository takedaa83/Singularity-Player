# 🌌 Singularity Player 2.0.1 (Flagship Release)

> *The Enterprise-Grade, Audiophile Music Streaming, Desktop & Intelligence Platform.*

**Singularity Player 2.0.1** introduces our **Universal Online Updater System**, background startup telemetry, automated cloud CI/CD building, and custom high-DPI Windows branding.

---

## 📦 Downloads & Binaries

| Asset | Type | Description |
| :--- | :--- | :--- |
| **`Singularity Player Setup 2.0.1.exe`** | Windows Installer | Standard Windows NSIS Setup. Creates Start Menu and Desktop shortcuts, registers app protocols, and supports silent background updates. |
| **`Singularity Player 2.0.1.exe`** | Portable Standalone | Zero-installation single executable. Double-click and run directly from anywhere (Desktop, USB drive, external drive). |

---

## ✨ What's New in Version 2.0.1

### 🔄 Universal Online Updater System
* **Automated Startup Telemetry**: App silently checks for remote GitHub updates upon launch with 30-second intelligent caching to eliminate rate limits.
* **Ambient TopBar Update Pill**: A glowing animated badge appears in the top navigation bar whenever a new commit or release is detected.
* **One-Click In-App Hot-Updater**: Self-hosted and local web instances can update directly in **Settings $\to$ Software Updates** with a single click—automatically fetching latest commits, rebuilding bundles, and hot-reloading with zero terminal commands required.
* **☁️ GitHub Actions CI/CD Cloud Pipeline**: Pushing version tags automatically triggers cloud Windows runners to compile, sign, and publish setup and portable `.exe` packages.

### 🎨 High-DPI Windows Icons & Branding
* **Multi-Layer Embedded `.ico`**: Hand-crafted 512×512 to 16×16 Windows icon layers featuring the Titanium Obsidian squircle with radiant rose (`#fa2d55`), electric purple (`#8b5cf6`), and cyber cyan (`#06b6d4`) gradient borders.
* **Embedded Everywhere**: Native Windows taskbar, titlebar, NSIS installer header, and uninstaller.

### 🎬 Luxury Startup Experience
* **Spacious 660×480 Glass Canvas**: Drifting multi-color starfield particles, animated SVG vector stroke-drawn lightning bolt, and real-time boot phase telemetry (`MOUNTING AUDIO ENGINE...`, `CALIBRATING DSP...`, `READY`).
* **Fluid Transition**: 4.6-second cinematic introduction with smooth zoom/blur handoff into the main player window.

### ⚡ Zero-Dependency Standalone Backend (`esbuild`)
* Express backend compiled into a single self-contained bundle with **zero external `node_modules` required at runtime**.
* **`< 20ms` Boot Time** with user storage isolated in `%APPDATA%\Singularity Player\server_data` for 100% crash-free operation on Windows.

### 🎛️ Audiophile DSP & Intelligence Engine
* **Master Engine v3.0**: Real-time 4-channel Linkwitz-Riley stem demixing ($24\text{ dB/octave}$), continuous EBU R128 LUFS loudness staging, and sub-millisecond syllable lyrics interpolation.
* **Desktop Native Integrations**: Discord Rich Presence (RPC), Background System Tray, Global OS Media Keys, and Picture-in-Picture Mini-Player.

---

## 🛠️ Local Self-Hosting Quick Start

```bash
# Clone the repository
git clone https://github.com/takedaa83/Singularity-Player.git
cd Singularity-Player

# Install dependencies
npm install

# Start local development
npm run dev

# Or launch the Native Desktop App in development
npm run dev:desktop
```
