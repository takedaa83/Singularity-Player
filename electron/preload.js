const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, typed Electron APIs to the React frontend
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback) => {
    const handler = (_, isMax) => callback(isMax);
    ipcRenderer.on('window:maximize-change', handler);
    return () => ipcRenderer.removeListener('window:maximize-change', handler);
  },

  // Media Synchronization (Taskbar, System Tray, Discord RPC, OBS)
  sendPlayerState: (state) => ipcRenderer.send('player:state-update', state),
  onMediaControl: (callback) => {
    const handler = (_, action) => callback(action);
    ipcRenderer.on('player:control', handler);
    return () => ipcRenderer.removeListener('player:control', handler);
  },

  // Desktop Features
  toggleMiniPlayer: () => ipcRenderer.send('miniplayer:toggle'),
  openDirectoryPicker: () => ipcRenderer.invoke('dialog:open-directory'),

  // Native In-App Auto-Updater
  downloadAndInstallUpdate: (downloadUrl) => ipcRenderer.invoke('updater:download-and-install', downloadUrl),
  onUpdateProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  restartAndInstall: () => ipcRenderer.send('updater:restart-and-install'),
});
