import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DashboardAgent,
  DashboardAgentRemoval,
  DashboardErrorContext,
  DashboardRecoveryActionResult,
  DashboardResizeRequest,
  DashboardWindowActionResult,
} from '../public/dashboard/shared.js';

type Listener<T> = (data: T) => void;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeOn<T>(channel: string, callback: Listener<T>): void {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_event: IpcRendererEvent, data: T) => callback(data));
}

function once<T>(channel: string): Promise<T> {
  return new Promise((resolve) => {
    ipcRenderer.once(channel, (_event: IpcRendererEvent, data: T) => resolve(data));
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  formatTime,
  resizeWindow: (size: DashboardResizeRequest) => ipcRenderer.send('resize-window', size),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  onAgentAdded: (callback: Listener<DashboardAgent>) => safeOn('agent-added', callback),
  onAgentUpdated: (callback: Listener<DashboardAgent>) => safeOn('agent-updated', callback),
  onAgentRemoved: (callback: Listener<DashboardAgentRemoval>) => safeOn('agent-removed', callback),
  onAgentsCleaned: (callback: Listener<DashboardAgentRemoval>) => safeOn('agents-cleaned', callback),
  onErrorOccurred: (callback: Listener<DashboardErrorContext>) => safeOn('error-occurred', callback),
  getAllAgents: () => {
    ipcRenderer.send('get-all-agents');
    return once<DashboardAgent[]>('all-agents-response');
  },
  getAvatars: () => {
    ipcRenderer.send('get-avatars');
    return once<string[]>('avatars-response');
  },
  focusTerminal: (agentId: string): Promise<DashboardRecoveryActionResult> => ipcRenderer.invoke('focus-terminal', agentId),
  openWebDashboard: (): Promise<DashboardWindowActionResult> => ipcRenderer.invoke('open-web-dashboard'),
  executeRecoveryAction: (errorId: string, action: string) =>
    ipcRenderer.invoke('execute-recovery-action', errorId, action) as Promise<DashboardRecoveryActionResult>,
});
