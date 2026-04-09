"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function safeOn(channel, callback) {
    electron_1.ipcRenderer.removeAllListeners(channel);
    electron_1.ipcRenderer.on(channel, (_event, data) => callback(data));
}
function once(channel) {
    return new Promise((resolve) => {
        electron_1.ipcRenderer.once(channel, (_event, data) => resolve(data));
    });
}
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    formatTime,
    resizeWindow: (size) => electron_1.ipcRenderer.send('resize-window', size),
    rendererReady: () => electron_1.ipcRenderer.send('renderer-ready'),
    onAgentAdded: (callback) => safeOn('agent-added', callback),
    onAgentUpdated: (callback) => safeOn('agent-updated', callback),
    onAgentRemoved: (callback) => safeOn('agent-removed', callback),
    onAgentsCleaned: (callback) => safeOn('agents-cleaned', callback),
    onErrorOccurred: (callback) => safeOn('error-occurred', callback),
    getAllAgents: () => {
        electron_1.ipcRenderer.send('get-all-agents');
        return once('all-agents-response');
    },
    getAvatars: () => {
        electron_1.ipcRenderer.send('get-avatars');
        return once('avatars-response');
    },
    focusTerminal: (agentId) => electron_1.ipcRenderer.invoke('focus-terminal', agentId),
    openWebDashboard: () => electron_1.ipcRenderer.invoke('open-web-dashboard'),
    executeRecoveryAction: (errorId, action) => electron_1.ipcRenderer.invoke('execute-recovery-action', errorId, action),
});
