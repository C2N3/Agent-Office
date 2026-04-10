// @ts-nocheck

const { dialog, ipcMain } = require('electron');
const { dashboardIpcChannels } = require('../../shared/contracts/ipc');

function registerWorkspaceHandlers({
  agentManager,
  agentRegistry,
  workspaceManager,
  attachRegisteredAgent,
  debugLog,
  getDashboardSenderWindow,
}) {
  ipcMain.handle(dashboardIpcChannels.dialogPickDirectory, async (event, options = {}) => {
    const senderWindow = getDashboardSenderWindow(event);
    if (!senderWindow) {
      return { success: false, error: 'Directory picker is only available from an Agent-Office app window.' };
    }

    try {
      const result = await dialog.showOpenDialog(senderWindow, {
        title: typeof options?.title === 'string' ? options.title : 'Select folder',
        buttonLabel: typeof options?.buttonLabel === 'string' ? options.buttonLabel : 'Select',
        defaultPath: typeof options?.defaultPath === 'string' && options.defaultPath.trim()
          ? options.defaultPath.trim()
          : undefined,
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || !result.filePaths?.[0]) {
        return { success: true, canceled: true, path: null };
      }

      return { success: true, canceled: false, path: result.filePaths[0] };
    } catch (error) {
      debugLog(`[Dialog] Directory picker error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  if (!workspaceManager) {
    return;
  }

  ipcMain.handle(dashboardIpcChannels.workspaceInspectRepo, async (_event, repoPath) => {
    try {
      return { success: true, repository: workspaceManager.inspectRepository(repoPath) };
    } catch (error) {
      debugLog(`[Workspace] Inspect error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceCreate, async (_event, data) => {
    try {
      const workspaceResult = workspaceManager.createWorkspace(data);
      const agent = agentRegistry.createAgent({
        name: data.name,
        role: data.role,
        projectPath: workspaceResult.workspacePath,
        provider: data.provider,
        workspace: workspaceResult.workspace,
      });

      const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(agent) : null;
      if (!attachedSessionId) {
        agentManager.updateAgent({
          registryId: agent.id,
          displayName: agent.name,
          role: agent.role,
          projectPath: agent.projectPath,
          avatarIndex: agent.avatarIndex,
          provider: agent.provider,
          workspace: agent.workspace || null,
          isRegistered: true,
          state: 'Offline',
        }, 'workspace');
      }

      return {
        success: true,
        agent,
        workspace: workspaceResult.workspace,
        bootstrapCommand: workspaceResult.bootstrapCommand,
      };
    } catch (error) {
      debugLog(`[Workspace] Create error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceMergeCleanup, async (_event, registryId) => {
    try {
      const agent = agentRegistry.getAgent(registryId);
      if (!agent) return { success: false, error: 'Agent not found' };
      if (agent.currentSessionId) return { success: false, error: 'Stop the active session before merging this workspace.' };
      if (!agent.workspace) return { success: false, error: 'No managed workspace is attached to this agent.' };

      const result = workspaceManager.mergeWorkspace(agent.workspace);
      agentRegistry.archiveAgent(registryId);
      const existing = agentManager.getAgent(registryId);
      if (existing && existing.state === 'Offline') {
        agentManager.removeAgent(registryId);
      }

      return { success: true, result };
    } catch (error) {
      debugLog(`[Workspace] Merge cleanup error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceRemove, async (_event, registryId) => {
    try {
      const agent = agentRegistry.getAgent(registryId);
      if (!agent) return { success: false, error: 'Agent not found' };
      if (agent.currentSessionId) return { success: false, error: 'Stop the active session before removing this workspace.' };
      if (!agent.workspace) return { success: false, error: 'No managed workspace is attached to this agent.' };

      const result = workspaceManager.removeWorkspace(agent.workspace, { deleteBranch: true });
      agentRegistry.archiveAgent(registryId);
      const existing = agentManager.getAgent(registryId);
      if (existing && existing.state === 'Offline') {
        agentManager.removeAgent(registryId);
      }

      return { success: true, result };
    } catch (error) {
      debugLog(`[Workspace] Remove error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerWorkspaceHandlers,
};
