import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ElectronAPI,
  DashboardAgent,
  DashboardAgentRemoval,
  DashboardErrorContext,
  DashboardRecoveryActionResult,
  DashboardResizeRequest,
  DashboardWindowActionResult,
} from './shared/contracts/index';
import { electronIpcChannels } from './shared/contracts/index';

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

const electronAPI: ElectronAPI = {
  formatTime,
  resizeWindow: (size: DashboardResizeRequest) => ipcRenderer.send(electronIpcChannels.resizeWindow, size),
  rendererReady: () => ipcRenderer.send(electronIpcChannels.rendererReady),
  onAgentAdded: (callback: Listener<DashboardAgent>) => safeOn(electronIpcChannels.agentAdded, callback),
  onAgentUpdated: (callback: Listener<DashboardAgent>) => safeOn(electronIpcChannels.agentUpdated, callback),
  onAgentRemoved: (callback: Listener<DashboardAgentRemoval>) => safeOn(electronIpcChannels.agentRemoved, callback),
  onAgentsCleaned: (callback: Listener<DashboardAgentRemoval>) => safeOn(electronIpcChannels.agentsCleaned, callback),
  onErrorOccurred: (callback: Listener<DashboardErrorContext>) => safeOn(electronIpcChannels.errorOccurred, callback),
  getAllAgents: () => {
    ipcRenderer.send(electronIpcChannels.getAllAgents);
    return once<DashboardAgent[]>(electronIpcChannels.allAgentsResponse);
  },
  getAvatars: () => {
    ipcRenderer.send(electronIpcChannels.getAvatars);
    return once<string[]>(electronIpcChannels.avatarsResponse);
  },
  focusTerminal: (agentId: string): Promise<DashboardRecoveryActionResult> => ipcRenderer.invoke(electronIpcChannels.focusTerminal, agentId),
  openWebDashboard: (): Promise<DashboardWindowActionResult> => ipcRenderer.invoke(electronIpcChannels.openWebDashboard),
  executeRecoveryAction: (errorId: string, action: string) =>
    ipcRenderer.invoke(electronIpcChannels.executeRecoveryAction, errorId, action) as Promise<DashboardRecoveryActionResult>,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
