/**
 * Task Chat Preload Script
 * Provides secure IPC bridge for task chat popup windows.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { dashboardIpcChannels } from './shared/contracts/ipc';

contextBridge.exposeInMainWorld('taskChatAPI', {
  close: (agentRegistryId: string) => ipcRenderer.send(dashboardIpcChannels.taskChatClose, agentRegistryId),
  loadHistory: (agentRegistryId: string) => ipcRenderer.invoke(dashboardIpcChannels.taskChatHistory, agentRegistryId),
  appendMessage: (
    agentRegistryId: string,
    message: { id?: string; kind: string; text: string; timestamp?: number; taskId?: string | null },
  ) => ipcRenderer.invoke(dashboardIpcChannels.taskChatAppend, agentRegistryId, message),
  clearHistory: (agentRegistryId: string) => ipcRenderer.invoke(dashboardIpcChannels.taskChatClearHistory, agentRegistryId),
  mergeWorkspace: (registryId: string) => ipcRenderer.invoke(dashboardIpcChannels.workspaceMergeCleanup, registryId),
  removeWorkspace: (registryId: string) => ipcRenderer.invoke(dashboardIpcChannels.workspaceRemove, registryId),
});
