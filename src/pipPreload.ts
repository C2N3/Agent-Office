/**
 * PiP Preload Script
 * Provides secure IPC bridge for PiP window
 */

import { contextBridge, ipcRenderer } from 'electron';
import { dashboardIpcChannels } from './shared/contracts/ipc.js';

contextBridge.exposeInMainWorld('pipAPI', {
  close: () => ipcRenderer.send(dashboardIpcChannels.pipClose),
  backToDashboard: () => ipcRenderer.send(dashboardIpcChannels.pipBackToDashboard),
});
