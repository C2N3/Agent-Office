// @ts-nocheck
/**
 * Overlay Preload Script
 * Provides secure IPC bridge for overlay window
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  close: () => ipcRenderer.send('overlay-close'),
  backToDashboard: () => ipcRenderer.send('overlay-back-to-dashboard'),
  resize: (width, height) => ipcRenderer.send('overlay-resize', { width, height }),
});
