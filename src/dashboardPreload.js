"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function listen(channel, callback) {
    const listener = (_event, data) => callback(data);
    electron_1.ipcRenderer.on(channel, listener);
    return () => electron_1.ipcRenderer.removeListener(channel, listener);
}
function listenTuple(channel, callback) {
    const listener = (_event, ...args) => callback(...args);
    electron_1.ipcRenderer.on(channel, listener);
    return () => electron_1.ipcRenderer.removeListener(channel, listener);
}
function requestResponse(requestChannel, responseChannel) {
    electron_1.ipcRenderer.send(requestChannel);
    return new Promise((resolve) => {
        const listener = (_event, data) => {
            electron_1.ipcRenderer.removeListener(responseChannel, listener);
            resolve(data);
        };
        electron_1.ipcRenderer.on(responseChannel, listener);
    });
}
electron_1.contextBridge.exposeInMainWorld('dashboardAPI', {
    getInitialAgents: () => requestResponse('get-dashboard-agents', 'dashboard-agents-response'),
    onInitialData: (callback) => listen('dashboard-initial-data', callback),
    onAgentAdded: (callback) => listen('dashboard-agent-added', callback),
    onAgentUpdated: (callback) => listen('dashboard-agent-updated', callback),
    onAgentRemoved: (callback) => listen('dashboard-agent-removed', callback),
    focusAgent: (agentId) => {
        electron_1.ipcRenderer.send('dashboard-focus-agent', agentId);
    },
    togglePip: () => electron_1.ipcRenderer.invoke('toggle-pip'),
    onPipStateChanged: (callback) => listen('pip-state-changed', callback),
    createRegisteredAgent: (data) => electron_1.ipcRenderer.invoke('registry:create', data),
    inspectWorkspaceRepo: (repoPath) => electron_1.ipcRenderer.invoke('workspace:inspect-repo', repoPath),
    createWorkspaceAgent: (data) => electron_1.ipcRenderer.invoke('workspace:create', data),
    mergeWorkspaceAgent: (registryId) => electron_1.ipcRenderer.invoke('workspace:merge-cleanup', registryId),
    removeWorkspaceAgent: (registryId) => electron_1.ipcRenderer.invoke('workspace:remove', registryId),
    listRegisteredAgents: () => electron_1.ipcRenderer.invoke('registry:list'),
    listArchivedAgents: () => electron_1.ipcRenderer.invoke('registry:list-archived'),
    listArchivedWorkspaceAgents: () => electron_1.ipcRenderer.invoke('registry:list-archived-workspaces'),
    updateRegisteredAgent: (id, fields) => electron_1.ipcRenderer.invoke('registry:update', id, fields),
    toggleRegisteredAgent: (id, enabled) => electron_1.ipcRenderer.invoke('registry:toggle', id, enabled),
    archiveRegisteredAgent: (id) => electron_1.ipcRenderer.invoke('registry:archive', id),
    deleteRegisteredAgent: (id) => electron_1.ipcRenderer.invoke('registry:delete', id),
    clearInactiveUnregisteredAgents: () => electron_1.ipcRenderer.invoke('agents:clear-inactive-unregistered'),
    getSessionHistory: (registryId) => electron_1.ipcRenderer.invoke('registry:session-history', registryId),
    getConversation: (registryId, sessionId, options) => electron_1.ipcRenderer.invoke('registry:conversation', registryId, sessionId, options),
    resumeSession: (registryId, sessionId) => electron_1.ipcRenderer.invoke('registry:resume-session', registryId, sessionId),
    setNickname: (agentId, nickname) => electron_1.ipcRenderer.invoke('nickname:set', agentId, nickname),
    getNickname: (agentId) => electron_1.ipcRenderer.invoke('nickname:get', agentId),
    removeNickname: (agentId) => electron_1.ipcRenderer.invoke('nickname:remove', agentId),
    getTerminalProfiles: () => electron_1.ipcRenderer.invoke('terminal:profiles'),
    setDefaultTerminalProfile: (profileId) => electron_1.ipcRenderer.invoke('terminal:default-profile:set', profileId),
    createTerminal: (agentId, options) => electron_1.ipcRenderer.invoke('terminal:create', agentId, options),
    writeTerminal: (agentId, data) => electron_1.ipcRenderer.invoke('terminal:write', agentId, data),
    resizeTerminal: (agentId, cols, rows) => electron_1.ipcRenderer.invoke('terminal:resize', agentId, cols, rows),
    destroyTerminal: (agentId) => electron_1.ipcRenderer.invoke('terminal:destroy', agentId),
    onTerminalData: (callback) => listenTuple('terminal:data', callback),
    onTerminalExit: (callback) => listenTuple('terminal:exit', callback),
    onPsPolicyBlocked: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on('powershell:policy-blocked', listener);
        return () => electron_1.ipcRenderer.removeListener('powershell:policy-blocked', listener);
    },
    openPsPolicyTerminal: () => electron_1.ipcRenderer.invoke('powershell:open-policy-terminal'),
});
