import { contextBridge, ipcRenderer } from 'electron';

type Listener<T> = (data: T) => void;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeOn<T>(channel: string, callback: Listener<T>): void {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_event, data: T) => callback(data));
}

function once<T>(channel: string): Promise<T> {
  return new Promise((resolve) => {
    ipcRenderer.once(channel, (_event, data: T) => resolve(data));
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  formatTime,
  resizeWindow: (size: Record<string, unknown>) => ipcRenderer.send('resize-window', size),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  onAgentAdded: (callback: Listener<unknown>) => safeOn('agent-added', callback),
  onAgentUpdated: (callback: Listener<unknown>) => safeOn('agent-updated', callback),
  onAgentRemoved: (callback: Listener<unknown>) => safeOn('agent-removed', callback),
  onAgentsCleaned: (callback: Listener<unknown>) => safeOn('agents-cleaned', callback),
  onErrorOccurred: (callback: Listener<unknown>) => safeOn('error-occurred', callback),
  getAllAgents: () => {
    ipcRenderer.send('get-all-agents');
    return once<unknown[]>('all-agents-response');
  },
  getAvatars: () => {
    ipcRenderer.send('get-avatars');
    return once<string[]>('avatars-response');
  },
  focusTerminal: (agentId: string) => ipcRenderer.invoke('focus-terminal', agentId),
  openWebDashboard: () => ipcRenderer.invoke('open-web-dashboard'),
  executeRecoveryAction: (errorId: string, action: string) =>
    ipcRenderer.invoke('execute-recovery-action', errorId, action),
});
