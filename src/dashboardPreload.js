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
  inspectWorkspaceRepo: (repoPath) => ipcRenderer.invoke('workspace:inspect-repo', repoPath),
  createWorkspaceAgent: (data) => ipcRenderer.invoke('workspace:create', data),
  mergeWorkspaceAgent: (registryId) => ipcRenderer.invoke('workspace:merge-cleanup', registryId),
  removeWorkspaceAgent: (registryId) => ipcRenderer.invoke('workspace:remove', registryId),
  listRegisteredAgents: () => ipcRenderer.invoke('registry:list'),
  listArchivedWorkspaceAgents: () => ipcRenderer.invoke('registry:list-archived-workspaces'),
  updateRegisteredAgent: (id, fields) => ipcRenderer.invoke('registry:update', id, fields),
  toggleRegisteredAgent: (id, enabled) => ipcRenderer.invoke('registry:toggle', id, enabled),
  archiveRegisteredAgent: (id) => ipcRenderer.invoke('registry:archive', id),
  deleteRegisteredAgent: (id) => ipcRenderer.invoke('registry:delete', id),

  // ─── Session History / Conversation ───
  getSessionHistory: (registryId) => ipcRenderer.invoke('registry:session-history', registryId),
  getConversation: (registryId, sessionId, options) => ipcRenderer.invoke('registry:conversation', registryId, sessionId, options),
  resumeSession: (registryId, sessionId) => ipcRenderer.invoke('registry:resume-session', registryId, sessionId),

  // ─── Nickname ───
  setNickname: (agentId, nickname) => ipcRenderer.invoke('nickname:set', agentId, nickname),
  getNickname: (agentId) => ipcRenderer.invoke('nickname:get', agentId),
  removeNickname: (agentId) => ipcRenderer.invoke('nickname:remove', agentId),

  // ─── Terminal ───
  getTerminalProfiles: () => ipcRenderer.invoke('terminal:profiles'),
  setDefaultTerminalProfile: (profileId) => ipcRenderer.invoke('terminal:default-profile:set', profileId),
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

  // ─── PowerShell Policy ───
  onPsPolicyBlocked: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('powershell:policy-blocked', listener);
    return () => ipcRenderer.removeListener('powershell:policy-blocked', listener);
  },
  openPsPolicyTerminal: () => ipcRenderer.invoke('powershell:open-policy-terminal'),

});
