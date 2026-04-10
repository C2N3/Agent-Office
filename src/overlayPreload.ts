// @ts-nocheck
/**
 * Overlay Preload Script
 * Provides secure IPC bridge for overlay window
 */

const { contextBridge, ipcRenderer } = require('electron');
const { dashboardIpcChannels } = require('./shared/contracts/ipc');

contextBridge.exposeInMainWorld('overlayAPI', {
  close: () => ipcRenderer.send(dashboardIpcChannels.overlayClose),
  backToDashboard: () => ipcRenderer.send(dashboardIpcChannels.overlayBackToDashboard),
  resize: (width, height) => ipcRenderer.send(dashboardIpcChannels.overlayResize, { width, height }),
});
