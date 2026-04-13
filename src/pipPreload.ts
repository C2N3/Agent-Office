/**
 * PiP Preload Script
 * Provides secure IPC bridge for PiP window
 */

const { contextBridge, ipcRenderer } = require('electron');
const { dashboardIpcChannels } = require('./shared/contracts/ipc');

contextBridge.exposeInMainWorld('pipAPI', {
  close: () => ipcRenderer.send(dashboardIpcChannels.pipClose),
  backToDashboard: () => ipcRenderer.send(dashboardIpcChannels.pipBackToDashboard),
});
