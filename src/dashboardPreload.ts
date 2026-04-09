import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DashboardAPI,
  DashboardAgent,
  DashboardAgentRecord,
  DashboardAgentRemoval,
  DashboardOpenOptions,
} from '../public/dashboard/shared.js';

type Cleanup = () => void;
type DashboardTupleArg = string | number;

function listen<T>(channel: string, callback: (data: T) => void): Cleanup {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function listenTuple<T extends DashboardTupleArg[]>(channel: string, callback: (...args: T) => void): Cleanup {
  const listener = (_event: IpcRendererEvent, ...args: T) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function requestResponse<T>(requestChannel: string, responseChannel: string): Promise<T> {
  ipcRenderer.send(requestChannel);
  return new Promise((resolve) => {
    const listener = (_event: IpcRendererEvent, data: T) => {
      ipcRenderer.removeListener(responseChannel, listener);
      resolve(data);
    };
    ipcRenderer.on(responseChannel, listener);
  });
}

const dashboardAPI: DashboardAPI = {
  getInitialAgents: () => requestResponse<DashboardAgent[]>('get-dashboard-agents', 'dashboard-agents-response'),
  onInitialData: (callback: (data: DashboardAgent[]) => void) => listen('dashboard-initial-data', callback),
  onAgentAdded: (callback: (data: DashboardAgent) => void) => listen('dashboard-agent-added', callback),
  onAgentUpdated: (callback: (data: DashboardAgent) => void) => listen('dashboard-agent-updated', callback),
  onAgentRemoved: (callback: (data: DashboardAgentRemoval) => void) => listen('dashboard-agent-removed', callback),
  focusAgent: (agentId: string) => ipcRenderer.invoke('focus-terminal', agentId),
  togglePip: () => ipcRenderer.invoke('toggle-pip'),
  onPipStateChanged: (callback: (isOpen: boolean) => void) => listen('pip-state-changed', callback),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  onOverlayStateChanged: (callback: (isOpen: boolean) => void) => listen('overlay-state-changed', callback),
  createRegisteredAgent: (data: Partial<DashboardAgentRecord> & { name: string; projectPath: string }) => ipcRenderer.invoke('registry:create', data),
  inspectWorkspaceRepo: (repoPath: string) => ipcRenderer.invoke('workspace:inspect-repo', repoPath),
  createWorkspaceAgent: (data) => ipcRenderer.invoke('workspace:create', data),
  mergeWorkspaceAgent: (registryId: string) => ipcRenderer.invoke('workspace:merge-cleanup', registryId),
  removeWorkspaceAgent: (registryId: string) => ipcRenderer.invoke('workspace:remove', registryId),
  listRegisteredAgents: () => ipcRenderer.invoke('registry:list'),
  listArchivedAgents: () => ipcRenderer.invoke('registry:list-archived'),
  listArchivedWorkspaceAgents: () => ipcRenderer.invoke('registry:list-archived-workspaces'),
  updateRegisteredAgent: (id: string, fields: Partial<DashboardAgentRecord>) =>
    ipcRenderer.invoke('registry:update', id, fields),
  toggleRegisteredAgent: (id: string, enabled: boolean) => ipcRenderer.invoke('registry:toggle', id, enabled),
  archiveRegisteredAgent: (id: string) => ipcRenderer.invoke('registry:archive', id),
  deleteRegisteredAgent: (id: string) => ipcRenderer.invoke('registry:delete', id),
  clearInactiveUnregisteredAgents: () => ipcRenderer.invoke('agents:clear-inactive-unregistered'),
  getSessionHistory: (registryId: string) => ipcRenderer.invoke('registry:session-history', registryId),
  getConversation: (registryId: string, sessionId: string, options?: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke('registry:conversation', registryId, sessionId, options),
  resumeSession: (registryId: string, sessionId: string) =>
    ipcRenderer.invoke('registry:resume-session', registryId, sessionId),
  setNickname: (agentId: string, nickname: string) => ipcRenderer.invoke('nickname:set', agentId, nickname),
  getNickname: (agentId: string) => ipcRenderer.invoke('nickname:get', agentId),
  removeNickname: (agentId: string) => ipcRenderer.invoke('nickname:remove', agentId),
  getTerminalProfiles: () => ipcRenderer.invoke('terminal:profiles'),
  setDefaultTerminalProfile: (profileId: string) => ipcRenderer.invoke('terminal:default-profile:set', profileId),
  createTerminal: (agentId: string, options?: DashboardOpenOptions) =>
    ipcRenderer.invoke('terminal:create', agentId, options),
  writeTerminal: (agentId: string, data: string) => ipcRenderer.invoke('terminal:write', agentId, data),
  resizeTerminal: (agentId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', agentId, cols, rows),
  destroyTerminal: (agentId: string) => ipcRenderer.invoke('terminal:destroy', agentId),
  onTerminalData: (callback: (agentId: string, data: string) => void) =>
    listenTuple('terminal:data', callback),
  onTerminalExit: (callback: (agentId: string, exitCode: number) => void) =>
    listenTuple('terminal:exit', callback),
  onPsPolicyBlocked: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('powershell:policy-blocked', listener);
    return () => ipcRenderer.removeListener('powershell:policy-blocked', listener);
  },
  openPsPolicyTerminal: () => ipcRenderer.invoke('powershell:open-policy-terminal'),
};

contextBridge.exposeInMainWorld('dashboardAPI', dashboardAPI);
