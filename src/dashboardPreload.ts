import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DashboardAPI,
  DashboardAgent,
  DashboardAgentRecord,
  DashboardAgentRemoval,
  DashboardOpenOptions,
} from './shared/contracts/index';
import { dashboardIpcChannels } from './shared/contracts/index';

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
  platform: process.platform,
  getInitialAgents: () => requestResponse<DashboardAgent[]>(
    dashboardIpcChannels.getDashboardAgents,
    dashboardIpcChannels.dashboardAgentsResponse,
  ),
  onInitialData: (callback: (data: DashboardAgent[]) => void) => listen(dashboardIpcChannels.dashboardInitialData, callback),
  onAgentAdded: (callback: (data: DashboardAgent) => void) => listen(dashboardIpcChannels.dashboardAgentAdded, callback),
  onAgentUpdated: (callback: (data: DashboardAgent) => void) => listen(dashboardIpcChannels.dashboardAgentUpdated, callback),
  onAgentRemoved: (callback: (data: DashboardAgentRemoval) => void) => listen(dashboardIpcChannels.dashboardAgentRemoved, callback),
  focusAgent: (agentId: string) => ipcRenderer.invoke(dashboardIpcChannels.focusTerminal, agentId),
  togglePip: () => ipcRenderer.invoke(dashboardIpcChannels.togglePip),
  onPipStateChanged: (callback: (isOpen: boolean) => void) => listen(dashboardIpcChannels.pipStateChanged, callback),
  toggleOverlay: () => ipcRenderer.invoke(dashboardIpcChannels.toggleOverlay),
  onOverlayStateChanged: (callback: (isOpen: boolean) => void) => listen(dashboardIpcChannels.overlayStateChanged, callback),
  createRegisteredAgent: (data: Partial<DashboardAgentRecord> & { name: string; projectPath: string }) =>
    ipcRenderer.invoke(dashboardIpcChannels.registryCreate, data),
  pickDirectory: (options) => ipcRenderer.invoke(dashboardIpcChannels.dialogPickDirectory, options),
  inspectWorkspaceRepo: (repoPath: string) => ipcRenderer.invoke(dashboardIpcChannels.workspaceInspectRepo, repoPath),
  resolveWorkspaceRegistration: (data) => ipcRenderer.invoke(dashboardIpcChannels.workspaceResolveRegistration, data),
  createWorkspaceAgent: (data) => ipcRenderer.invoke(dashboardIpcChannels.workspaceCreate, data),
  createAgentFromPath: (data) => ipcRenderer.invoke(dashboardIpcChannels.workspaceCreateFromPath, data),
  mergeWorkspaceAgent: (registryId: string) => ipcRenderer.invoke(dashboardIpcChannels.workspaceMergeCleanup, registryId),
  removeWorkspaceAgent: (registryId: string) => ipcRenderer.invoke(dashboardIpcChannels.workspaceRemove, registryId),
  listRegisteredAgents: () => ipcRenderer.invoke(dashboardIpcChannels.registryList),
  listArchivedAgents: () => ipcRenderer.invoke(dashboardIpcChannels.registryListArchived),
  listArchivedWorkspaceAgents: () => ipcRenderer.invoke(dashboardIpcChannels.registryListArchivedWorkspaces),
  updateRegisteredAgent: (id: string, fields: Partial<DashboardAgentRecord>) =>
    ipcRenderer.invoke(dashboardIpcChannels.registryUpdate, id, fields),
  toggleRegisteredAgent: (id: string, enabled: boolean) => ipcRenderer.invoke(dashboardIpcChannels.registryToggle, id, enabled),
  archiveRegisteredAgent: (id: string) => ipcRenderer.invoke(dashboardIpcChannels.registryArchive, id),
  deleteRegisteredAgent: (id: string) => ipcRenderer.invoke(dashboardIpcChannels.registryDelete, id),
  terminateAgentSession: (agentId: string) => ipcRenderer.invoke(dashboardIpcChannels.agentTerminateSession, agentId),
  clearInactiveUnregisteredAgents: () => ipcRenderer.invoke(dashboardIpcChannels.agentsClearInactiveUnregistered),
  getSessionHistory: (registryId: string) => ipcRenderer.invoke(dashboardIpcChannels.registrySessionHistory, registryId),
  getConversation: (registryId: string, sessionId: string, options?: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke(dashboardIpcChannels.registryConversation, registryId, sessionId, options),
  resumeSession: (registryId: string, sessionId: string) =>
    ipcRenderer.invoke(dashboardIpcChannels.registryResumeSession, registryId, sessionId),
  setNickname: (agentId: string, nickname: string) => ipcRenderer.invoke(dashboardIpcChannels.nicknameSet, agentId, nickname),
  getNickname: (agentId: string) => ipcRenderer.invoke(dashboardIpcChannels.nicknameGet, agentId),
  removeNickname: (agentId: string) => ipcRenderer.invoke(dashboardIpcChannels.nicknameRemove, agentId),
  getTerminalProfiles: () => ipcRenderer.invoke(dashboardIpcChannels.terminalProfiles),
  setDefaultTerminalProfile: (profileId: string) => ipcRenderer.invoke(dashboardIpcChannels.terminalDefaultProfileSet, profileId),
  createTerminal: (agentId: string, options?: DashboardOpenOptions) =>
    ipcRenderer.invoke(dashboardIpcChannels.terminalCreate, agentId, options),
  writeTerminal: (agentId: string, data: string) => ipcRenderer.invoke(dashboardIpcChannels.terminalWrite, agentId, data),
  resizeTerminal: (agentId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(dashboardIpcChannels.terminalResize, agentId, cols, rows),
  destroyTerminal: (agentId: string) => ipcRenderer.invoke(dashboardIpcChannels.terminalDestroy, agentId),
  onTerminalData: (callback: (agentId: string, data: string) => void) =>
    listenTuple(dashboardIpcChannels.terminalData, callback),
  onTerminalExit: (callback: (agentId: string, exitCode: number) => void) =>
    listenTuple(dashboardIpcChannels.terminalExit, callback),
  onPsPolicyBlocked: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(dashboardIpcChannels.powershellPolicyBlocked, listener);
    return () => ipcRenderer.removeListener(dashboardIpcChannels.powershellPolicyBlocked, listener);
  },
  openPsPolicyTerminal: () => ipcRenderer.invoke(dashboardIpcChannels.powershellOpenPolicyTerminal),
  openTaskChatWindow: (params) => ipcRenderer.invoke(dashboardIpcChannels.taskChatOpen, params),
  closeTaskChatWindow: (taskId: string) => ipcRenderer.send(dashboardIpcChannels.taskChatClose, taskId),
};

contextBridge.exposeInMainWorld('dashboardAPI', dashboardAPI);
