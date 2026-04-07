/**
 * Dashboard Dashboard Preload Script
 * Provides secure IPC bridge for Dashboard window
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to Dashboard window
contextBridge.exposeInMainWorld('dashboardAPI', {
  // Request initial agents
  getInitialAgents: () => {
    ipcRenderer.send('get-dashboard-agents');
    return new Promise(resolve => {
      const listener = (event, data) => {
        ipcRenderer.removeListener('dashboard-agents-response', listener);
        resolve(data);
      };
      ipcRenderer.on('dashboard-agents-response', listener);
    });
  },

  // Listen for initial data
  onInitialData: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dashboard-initial-data', listener);
    return () => ipcRenderer.removeListener('dashboard-initial-data', listener);
  },

  // Agent event listeners
  onAgentAdded: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dashboard-agent-added', listener);
    return () => ipcRenderer.removeListener('dashboard-agent-added', listener);
  },

  onAgentUpdated: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dashboard-agent-updated', listener);
    return () => ipcRenderer.removeListener('dashboard-agent-updated', listener);
  },

  onAgentRemoved: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dashboard-agent-removed', listener);
    return () => ipcRenderer.removeListener('dashboard-agent-removed', listener);
  },

  // Send commands to Agent-Office
  focusAgent: (agentId) => {
    ipcRenderer.send('dashboard-focus-agent', agentId);
  },

  // PiP
  togglePip: () => ipcRenderer.invoke('toggle-pip'),
  onPipStateChanged: (callback) => {
    const listener = (event, isOpen) => callback(isOpen);
    ipcRenderer.on('pip-state-changed', listener);
    return () => ipcRenderer.removeListener('pip-state-changed', listener);
  },

  // ─── Agent Registry ───
  createRegisteredAgent: (data) => ipcRenderer.invoke('registry:create', data),
  listRegisteredAgents: () => ipcRenderer.invoke('registry:list'),
  updateRegisteredAgent: (id, fields) => ipcRenderer.invoke('registry:update', id, fields),
  toggleRegisteredAgent: (id, enabled) => ipcRenderer.invoke('registry:toggle', id, enabled),
  archiveRegisteredAgent: (id) => ipcRenderer.invoke('registry:archive', id),
  deleteRegisteredAgent: (id) => ipcRenderer.invoke('registry:delete', id),

  // ─── Nickname ───
  setNickname: (agentId, nickname) => ipcRenderer.invoke('nickname:set', agentId, nickname),
  getNickname: (agentId) => ipcRenderer.invoke('nickname:get', agentId),
  removeNickname: (agentId) => ipcRenderer.invoke('nickname:remove', agentId),

  // ─── Terminal ───
  createTerminal: (agentId, options) => ipcRenderer.invoke('terminal:create', agentId, options),
  writeTerminal: (agentId, data) => ipcRenderer.invoke('terminal:write', agentId, data),
  resizeTerminal: (agentId, cols, rows) => ipcRenderer.invoke('terminal:resize', agentId, cols, rows),
  destroyTerminal: (agentId) => ipcRenderer.invoke('terminal:destroy', agentId),
  onTerminalData: (callback) => {
    const listener = (event, agentId, data) => callback(agentId, data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback) => {
    const listener = (event, agentId, exitCode) => callback(agentId, exitCode);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },

});
