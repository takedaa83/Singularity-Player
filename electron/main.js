const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { fork, spawn } = require('child_process');
const { DiscordRpcClient } = require('./discordRpc');

// Optimize background CPU, GPU & memory consumption
app.commandLine.appendSwitch('disable-renderer-backgrounding', 'false');
app.commandLine.appendSwitch('disable-background-timer-throttling', 'false');
app.commandLine.appendSwitch('enable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

// Ensure Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let splashWindow = null;
let miniPlayerWindow = null;
let tray = null;
let serverProcess = null;
let discordRpc = null;
let powerSaveId = null;

function updatePowerSaveState(isPlaying) {
  if (isPlaying && powerSaveId === null) {
    powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!isPlaying && powerSaveId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveId)) {
      powerSaveBlocker.stop(powerSaveId);
    }
    powerSaveId = null;
  }
}
let currentTrackState = {
  title: '',
  artist: '',
  album: '',
  coverUrl: '',
  isPlaying: false,
  progress: 0,
  duration: 0
};

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = process.env.PORT || 8000;
const SERVER_URL = isDev && process.env.VITE_DEV_SERVER ? 'http://localhost:5173' : `http://localhost:${PORT}`;

/**
 * Initializes and starts the embedded Express server in production.
 */
function startInternalServer() {
  return new Promise((resolve) => {
    try {
      process.env.PORT = String(PORT);
      process.env.NODE_ENV = 'production';
      const writableDataDir = path.join(app.getPath('userData'), 'server_data');
      process.env.SINGULARITY_DATA_DIR = writableDataDir;
      if (!fs.existsSync(writableDataDir)) {
        fs.mkdirSync(writableDataDir, { recursive: true });
      }

      const candidates = [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js'),
        path.join(__dirname, '..', 'server', 'dist', 'index.js'),
        path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'server', 'dist', 'index.js'),
      ];

      const serverPath = candidates.find((p) => fs.existsSync(p));
      if (serverPath) {
        console.log('[Electron Main] Loading embedded Express server from:', serverPath);
        require(serverPath);
      } else {
        console.warn('[Electron Main] Could not find server/dist/index.js in candidates:', candidates);
      }
    } catch (err) {
      console.error('[Electron Main] Server require error:', err);
    }

    let count = 0;
    const interval = setInterval(() => {
      count++;
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          console.log(`[Electron Main] Express server health check PASSED on port ${PORT}`);
          resolve(true);
        }
      });
      req.on('error', () => {});
      req.setTimeout(200, () => req.destroy());
      if (count > 50) {
        clearInterval(interval);
        console.warn('[Electron Main] Express health check timed out after 5s');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Creates the animated Splash Screen window shown during startup.
 */
function createSplashWindow() {
  const iconCandidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'client', 'public', 'favicon.svg'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  splashWindow = new BrowserWindow({
    width: 660,
    height: 480,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

/**
 * Gracefully closes the splash screen and reveals the main window.
 */
function closeSplashAndShowMain() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    // No splash to close — just show the main window directly
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return;
  }

  // Tell splash renderer to play exit animation
  splashWindow.webContents.send('splash:close');

  // Listen for the splash renderer to signal that its exit animation is done
  ipcMain.once('splash:closed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
  });

  // Safety timeout — if the renderer never responds, force close after 2.5s
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      splashWindow.destroy();
      splashWindow = null;
    }
  }, 2500);
}

/**
 * Creates the primary Frameless BrowserWindow.
 */
function createMainWindow() {
  const iconCandidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'client', 'public', 'favicon.svg'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0c',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  mainWindow.loadURL(SERVER_URL).catch((err) => {
    console.warn('[Electron Main] loadURL failed, falling back to local file:', err);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const candidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'client', 'dist', 'index.html'),
      path.join(__dirname, '..', 'client', 'dist', 'index.html'),
      path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'client', 'dist', 'index.html'),
    ];
    const indexPath = candidates.find((p) => fs.existsSync(p));
    if (indexPath) {
      mainWindow.loadFile(indexPath);
    }
  });

  // Enable F12 / Ctrl+Shift+I for DevTools inspection
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    // Give the cinematic splash room to breathe
    const MINIMUM_SPLASH_MS = 6200;
    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, MINIMUM_SPLASH_MS - elapsed);
    setTimeout(() => {
      closeSplashAndShowMain();
      setupThumbarButtons();
    }, remaining);
  });

  // Notify renderer on maximize / unmaximize
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximize-change', false);
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Creates the optional floating Mini-Player.
 */
function toggleMiniPlayerWindow() {
  if (miniPlayerWindow) {
    if (miniPlayerWindow.isVisible()) {
      miniPlayerWindow.hide();
    } else {
      miniPlayerWindow.show();
    }
    return;
  }

  miniPlayerWindow = new BrowserWindow({
    width: 360,
    height: 140,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  miniPlayerWindow.loadURL(`${SERVER_URL}/#miniplayer`);

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null;
  });
}

/**
 * Creates and updates the System Tray icon and context menu.
 */
function setupSystemTray() {
  const iconPath = path.join(__dirname, '..', 'client', 'public', 'favicon.svg');
  if (!fs.existsSync(iconPath)) return;

  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Singularity Music Player');

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const trackLabel = currentTrackState.title 
    ? `${currentTrackState.title} - ${currentTrackState.artist || 'Unknown'}`
    : 'No Track Playing';

  const contextMenu = Menu.buildFromTemplate([
    { label: trackLabel, enabled: false },
    { type: 'separator' },
    {
      label: currentTrackState.isPlaying ? '⏸ Pause' : '▶ Play',
      click: () => sendMediaControl('play-pause')
    },
    {
      label: '⏭ Next Track',
      click: () => sendMediaControl('next')
    },
    {
      label: '⏮ Previous Track',
      click: () => sendMediaControl('previous')
    },
    { type: 'separator' },
    {
      label: '🪟 Toggle Mini-Player',
      click: () => toggleMiniPlayerWindow()
    },
    {
      label: '✨ Open Singularity Player',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Registers Windows Taskbar Thumbnail (Thumbar) buttons.
 */
function setupThumbarButtons() {
  if (process.platform !== 'win32' || !mainWindow) return;

  try {
    const isPlaying = currentTrackState.isPlaying;
    const playPauseIcon = nativeImage.createFromPath(
      path.join(__dirname, '..', 'client', 'public', 'favicon.svg')
    ).resize({ width: 16, height: 16 });

    mainWindow.setThumbarButtons([
      {
        tooltip: 'Previous Track',
        icon: playPauseIcon,
        click: () => sendMediaControl('previous')
      },
      {
        tooltip: isPlaying ? 'Pause' : 'Play',
        icon: playPauseIcon,
        click: () => sendMediaControl('play-pause')
      },
      {
        tooltip: 'Next Track',
        icon: playPauseIcon,
        click: () => sendMediaControl('next')
      }
    ]);
  } catch (err) {
    // Gracefully ignore thumbar errors on non-supported platforms
  }
}

/**
 * Registers Global OS Media Keys & Shortcuts.
 */
function registerGlobalShortcuts() {
  // Global Media Keys
  globalShortcut.register('MediaPlayPause', () => sendMediaControl('play-pause'));
  globalShortcut.register('MediaNextTrack', () => sendMediaControl('next'));
  globalShortcut.register('MediaPreviousTrack', () => sendMediaControl('previous'));
  globalShortcut.register('MediaStop', () => sendMediaControl('play-pause'));

  // Productivity Global Hotkeys
  globalShortcut.register('CommandOrControl+Alt+Space', () => sendMediaControl('play-pause'));
  globalShortcut.register('CommandOrControl+Alt+Right', () => sendMediaControl('next'));
  globalShortcut.register('CommandOrControl+Alt+Left', () => sendMediaControl('previous'));
  globalShortcut.register('CommandOrControl+Shift+M', () => toggleMiniPlayerWindow());
}

function sendMediaControl(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player:control', action);
  }
}

/**
 * Exports Now Playing data for OBS Studio / Streamlabs widgets.
 */
function exportObsNowPlaying(track) {
  try {
    const obsDir = path.join(app.getPath('userData'), 'obs');
    if (!fs.existsSync(obsDir)) {
      fs.mkdirSync(obsDir, { recursive: true });
    }

    const textContent = track.title 
      ? `${track.title} - ${track.artist}`
      : '';
    fs.writeFileSync(path.join(obsDir, 'now_playing.txt'), textContent, 'utf8');
    fs.writeFileSync(path.join(obsDir, 'now_playing.json'), JSON.stringify(track, null, 2), 'utf8');
  } catch (err) {
    // Ignore OBS file export errors
  }
}

// ----------------------------------------------------
// IPC Event Listeners from React Frontend
// ----------------------------------------------------

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('miniplayer:toggle', () => {
  toggleMiniPlayerWindow();
});

ipcMain.handle('dialog:open-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'dontAddToRecent'],
    title: 'Select Local Music Folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.on('player:state-update', (_, state) => {
  currentTrackState = { ...currentTrackState, ...state };

  // 1. Update Windows Taskbar Progress
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (state.duration && state.duration > 0) {
      const progressRatio = Math.min(Math.max((state.progress || 0) / state.duration, 0), 1);
      mainWindow.setProgressBar(state.isPlaying ? progressRatio : -1);
    } else {
      mainWindow.setProgressBar(-1);
    }
  }

  // 2. Update Power Save Blocker
  updatePowerSaveState(!!state.isPlaying);

  // 3. Update System Tray
  updateTrayMenu();

  // 4. Update Discord Rich Presence
  if (discordRpc) {
    if (state.title) {
      discordRpc.setActivity(currentTrackState);
    } else {
      discordRpc.clearActivity();
    }
  }

  // 5. Update OBS Streamer Export
  exportObsNowPlaying(currentTrackState);
});

// ----------------------------------------------------
// Native In-App Updater (Desktop)
// ----------------------------------------------------

function downloadFileWithRedirects(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    function makeRequest(currentUrl) {
      https.get(currentUrl, { headers: { 'User-Agent': 'Singularity-Player-Desktop' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            onProgress({ percent, downloadedBytes, totalBytes });
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    makeRequest(url);
  });
}

ipcMain.handle('updater:download-and-install', async (_, downloadUrl) => {
  try {
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }
    const destPath = path.join(updatesDir, 'SingularityPlayerSetup.exe');

    console.log('[Native Updater] Downloading latest release from:', downloadUrl);
    await downloadFileWithRedirects(downloadUrl, destPath, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', progress);
      }
    });

    console.log('[Native Updater] Download complete:', destPath);
    return { success: true, installerPath: destPath };
  } catch (err) {
    console.error('[Native Updater] Download failed:', err);
    throw err;
  }
});

ipcMain.on('updater:restart-and-install', () => {
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  const installerPath = path.join(updatesDir, 'SingularityPlayerSetup.exe');
  if (fs.existsSync(installerPath)) {
    console.log('[Native Updater] Launching installer and shutting down app:', installerPath);
    try {
      spawn(installerPath, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) {
      spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
    }
    app.quit();
  }
});

// ----------------------------------------------------
// App Lifecycle
// ----------------------------------------------------

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

let splashStartTime = Date.now();

app.whenReady().then(async () => {
  // Show splash screen immediately for a polished startup experience
  splashStartTime = Date.now();
  createSplashWindow();

  // Start server if needed (splash is visible during this wait)
  if (!isDev) {
    await startInternalServer();
  }

  createMainWindow();
  setupSystemTray();
  registerGlobalShortcuts();

  // Initialize Discord RPC
  try {
    discordRpc = new DiscordRpcClient('1341052185292410971'); // Singularity Discord App ID
    discordRpc.connect();
  } catch (err) {
    console.warn('[Discord RPC] Initialization skipped:', err.message);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (discordRpc) discordRpc.destroy();
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
