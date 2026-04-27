import { dialog, ipcMain } from 'electron';
import { dashboardIpcChannels } from '../../shared/contracts/ipc';
import { createWorkspaceRegistrationService } from './workspace/registration';
import type { DashboardDirectoryPickerOptions } from '../../shared/contracts/index.js';

export function registerWorkspaceHandlers({
  agentManager,
  agentRegistry,
  terminalManager,
  workspaceManager,
  attachRegisteredAgent,
  debugLog,
  getDashboardSenderWindow,
}) {
  const { createRegisteredAgentRecord, resolveRegistrationPreview } = createWorkspaceRegistrationService({
    agentManager,
    agentRegistry,
    workspaceManager,
    attachRegisteredAgent,
  });

  ipcMain.handle(dashboardIpcChannels.dialogPickDirectory, async (event, options: DashboardDirectoryPickerOptions = {}) => {
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

  ipcMain.handle(dashboardIpcChannels.workspaceResolveRegistration, async (_event, data) => {
    try {
      return {
        success: true,
        preview: resolveRegistrationPreview(data),
      };
    } catch (error) {
      debugLog(`[Workspace] Resolve registration error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceCreate, async (_event, data) => {
    try {
      const workspaceResult = workspaceManager.createWorkspace(data);
      const agent = createRegisteredAgentRecord({
        name: data.name,
        role: data.role,
        projectPath: workspaceResult.workspacePath,
        provider: data.provider,
        workspace: workspaceResult.workspace,
      }, 'workspace');

      return {
        success: true,
        agent,
        workspace: workspaceResult.workspace,
        bootstrapCommand: workspaceResult.bootstrapCommand,
        effectiveStrategy: 'worktree',
        projectPath: agent.projectPath,
      };
    } catch (error) {
      debugLog(`[Workspace] Create error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceCreateFromPath, async (_event, data) => {
    try {
      const preview = resolveRegistrationPreview(data);

      if (preview.effectiveStrategy === 'worktree') {
        if (!preview.isGitRepository || !preview.repositoryPath) {
          throw new Error('Managed worktree creation requires a Git repository path');
        }

        // Omit workspacePath from data — it's the original repo path, not the worktree target.
        // createWorkspace will compute the correct worktree path from workspaceParent + branchName.
        const { workspacePath: _omit, ...worktreeData } = data;
        const workspaceResult = workspaceManager.createWorkspace({
          ...worktreeData,
          repoPath: preview.repositoryPath,
          branchName: String(data.branchName || '').trim() || preview.worktreeDefaults?.branchName,
          baseBranch: String(data.baseBranch || '').trim() || preview.worktreeDefaults?.baseBranch,
          workspaceParent: String(data.workspaceParent || '').trim() || preview.worktreeDefaults?.workspaceParent,
          startPoint: String(data.startPoint || '').trim()
            || String(data.baseBranch || '').trim()
            || preview.worktreeDefaults?.startPoint,
        });
        const agent = createRegisteredAgentRecord({
          name: data.name,
          role: data.role,
          projectPath: workspaceResult.workspacePath,
          provider: data.provider,
          workspace: workspaceResult.workspace,
        }, 'workspace');

        return {
          success: true,
          agent,
          workspace: workspaceResult.workspace,
          bootstrapCommand: workspaceResult.bootstrapCommand,
          effectiveStrategy: 'worktree',
          projectPath: agent.projectPath,
        };
      }

      const agent = createRegisteredAgentRecord({
        name: data.name,
        role: data.role,
        projectPath: preview.normalizedPath,
        provider: data.provider,
        workspace: null,
      }, 'workspace');

      return {
        success: true,
        agent,
        workspace: null,
        bootstrapCommand: '',
        effectiveStrategy: 'existing',
        projectPath: agent.projectPath,
      };
    } catch (error) {
      debugLog(`[Workspace] Create from path error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.workspaceMergeCleanup, async (_event, registryId) => {
    try {
      const agent = agentRegistry.getAgent(registryId);
      if (!agent) return { success: false, error: 'Agent not found' };

      // Kill terminal and clear session first
      if (terminalManager?.hasTerminal?.(registryId)) {
        terminalManager.destroyTerminal(registryId);
      }
      agentRegistry.unlinkSession(registryId);

      // If workspace was already cleaned up, just clear metadata
      if (!agent.workspace) {
        agentRegistry.updateAgent(registryId, { workspace: null });
        agentManager.updateAgent({ registryId, state: 'Offline', workspace: null }, 'workspace-merge');
        return { success: true, result: null };
      }

      if (process.platform === 'win32') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const result = workspaceManager.mergeWorkspace(agent.workspace);
      agentRegistry.updateAgent(registryId, { workspace: null });
      agentManager.updateAgent({
        registryId,
        state: 'Offline',
        workspace: null,
      }, 'workspace-merge');

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

      // Kill terminal and clear session first
      if (terminalManager?.hasTerminal?.(registryId)) {
        terminalManager.destroyTerminal(registryId);
      }
      agentRegistry.unlinkSession(registryId);

      // If workspace was already cleaned up (e.g. by orchestrator on failure), just clear metadata
      if (!agent.workspace) {
        agentRegistry.updateAgent(registryId, { workspace: null });
        agentManager.updateAgent({ registryId, state: 'Offline', workspace: null }, 'workspace-remove');
        return { success: true, result: null };
      }

      if (process.platform === 'win32') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const result = workspaceManager.removeWorkspace(agent.workspace, { deleteBranch: true });
      agentRegistry.updateAgent(registryId, { workspace: null });
      agentManager.updateAgent({
        registryId,
        state: 'Offline',
        workspace: null,
      }, 'workspace-remove');

      return { success: true, result };
    } catch (error) {
      debugLog(`[Workspace] Remove error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });
}
