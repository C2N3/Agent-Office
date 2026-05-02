/**
 * Overlay Preload Script
 * Provides secure IPC bridge for overlay window
 */

import { contextBridge, ipcRenderer } from 'electron';
import { dashboardIpcChannels } from './shared/contracts/ipc';

contextBridge.exposeInMainWorld('overlayAPI', {
  close: () => ipcRenderer.send(dashboardIpcChannels.overlayClose),
  backToDashboard: () => ipcRenderer.send(dashboardIpcChannels.overlayBackToDashboard),
  resize: (width, height) => ipcRenderer.send(dashboardIpcChannels.overlayResize, { width, height }),
});
