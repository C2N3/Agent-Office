jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
  },
}));

const { ipcMain } = require('electron');
import { dashboardIpcChannels } from '../src/shared/contracts/ipc';
import { registerWorkspaceHandlers } from '../src/main/ipc/workspace';

describe('workspace IPC handlers', () => {
  let handlers;
  let agentManager;
  let agentRegistry;
  let workspaceManager;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new Map();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    agentManager = {
      updateAgent: jest.fn(),
      getAllAgents: jest.fn(() => []),
    };
    agentRegistry = {
      createAgent: jest.fn(({ name, role, projectPath, provider, workspace }) => ({
        id: 'agent-1',
        name,
        role,
        projectPath,
        provider,
        workspace,
        avatarIndex: 0,
      })),
      findActiveAgentsByRepository: jest.fn(() => []),
      getAgent: jest.fn(),
      unlinkSession: jest.fn(),
      updateAgent: jest.fn(),
    };
    workspaceManager = {
      inspectWorkspacePath: jest.fn(),
      inspectRepository: jest.fn(),
      createWorkspace: jest.fn(),
      resolveRepositoryRoot: jest.fn((targetPath) => targetPath),
      mergeWorkspace: jest.fn(),
      removeWorkspace: jest.fn(),
    };

    registerWorkspaceHandlers({
      agentManager,
      agentRegistry,
      terminalManager: null,
      workspaceManager,
      attachRegisteredAgent: null,
      debugLog: jest.fn(),
      getDashboardSenderWindow: jest.fn(() => null),
    });
  });

  test('resolves a non-git path to direct registration', async () => {
    workspaceManager.inspectWorkspacePath.mockReturnValue({
      normalizedPath: '/workspace/plain',
      isGitRepository: false,
      repositoryPath: null,
      repositoryName: 'plain',
      currentBranch: null,
      branches: [],
      worktreeDefaults: {
        branchName: 'workspace/claude/plain',
        baseBranch: null,
        startPoint: null,
        workspaceParent: null,
      },
    });

    const handler = handlers.get(dashboardIpcChannels.workspaceResolveRegistration);
    const result = await handler(null, {
      workspacePath: '/workspace/plain',
      name: 'Plain',
      provider: 'claude',
      strategy: 'auto',
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      preview: expect.objectContaining({
        isGitRepository: false,
        recommendedStrategy: 'existing',
        effectiveStrategy: 'existing',
        summary: 'Not a git repository; direct registration will be used',
      }),
    }));
  });

  test('resolves a git repo already in use to managed worktree', async () => {
    workspaceManager.inspectWorkspacePath.mockReturnValue({
      normalizedPath: '/workspace/app',
      isGitRepository: true,
      repositoryPath: '/workspace/app',
      repositoryName: 'app',
      currentBranch: 'main',
      branches: ['main'],
      worktreeDefaults: {
        branchName: 'workspace/codex/feature-agent',
        baseBranch: 'main',
        startPoint: 'main',
        workspaceParent: '/tmp/worktrees/app',
      },
    });
    agentRegistry.findActiveAgentsByRepository.mockReturnValue([{ id: 'existing-agent' }]);

    const handler = handlers.get(dashboardIpcChannels.workspaceResolveRegistration);
    const result = await handler(null, {
      workspacePath: '/workspace/app',
      name: 'Feature Agent',
      provider: 'codex',
      strategy: 'auto',
    });

    expect(result.preview).toEqual(expect.objectContaining({
      repositoryInUse: true,
      recommendedStrategy: 'worktree',
      effectiveStrategy: 'worktree',
      summary: 'Will create a managed git worktree because this repository is already in use',
    }));
  });

  test('keeps explicit strategy overrides ahead of the auto recommendation', async () => {
    workspaceManager.inspectWorkspacePath.mockReturnValue({
      normalizedPath: '/workspace/app',
      isGitRepository: true,
      repositoryPath: '/workspace/app',
      repositoryName: 'app',
      currentBranch: 'main',
      branches: ['main'],
      worktreeDefaults: {
        branchName: 'workspace/codex/feature-agent',
        baseBranch: 'main',
        startPoint: 'main',
        workspaceParent: '/tmp/worktrees/app',
      },
    });
    agentRegistry.findActiveAgentsByRepository.mockReturnValue([{ id: 'existing-agent' }]);

    const handler = handlers.get(dashboardIpcChannels.workspaceResolveRegistration);
    const result = await handler(null, {
      workspacePath: '/workspace/app',
      name: 'Feature Agent',
      provider: 'codex',
      strategy: 'existing',
    });

    expect(result.preview).toEqual(expect.objectContaining({
      recommendedStrategy: 'worktree',
      effectiveStrategy: 'existing',
      summary: 'Will register this folder directly',
    }));
  });

  test('creates an exact-path agent when auto strategy resolves to direct registration', async () => {
    workspaceManager.inspectWorkspacePath.mockReturnValue({
      normalizedPath: '/workspace/app',
      isGitRepository: true,
      repositoryPath: '/workspace/app',
      repositoryName: 'app',
      currentBranch: 'main',
      branches: ['main'],
      worktreeDefaults: {
        branchName: 'workspace/claude/feature-agent',
        baseBranch: 'main',
        startPoint: 'main',
        workspaceParent: '/tmp/worktrees/app',
      },
    });

    const handler = handlers.get(dashboardIpcChannels.workspaceCreateFromPath);
    const result = await handler(null, {
      workspacePath: '/workspace/app',
      name: 'Feature Agent',
      role: 'Implementation',
      provider: 'claude',
      strategy: 'auto',
    });

    expect(workspaceManager.createWorkspace).not.toHaveBeenCalled();
    expect(agentRegistry.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Feature Agent',
      projectPath: '/workspace/app',
      workspace: null,
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      effectiveStrategy: 'existing',
      projectPath: '/workspace/app',
    }));
  });

  test('creates a managed worktree when auto strategy resolves to worktree', async () => {
    workspaceManager.inspectWorkspacePath.mockReturnValue({
      normalizedPath: '/workspace/app',
      isGitRepository: true,
      repositoryPath: '/workspace/app',
      repositoryName: 'app',
      currentBranch: 'main',
      branches: ['main'],
      worktreeDefaults: {
        branchName: 'workspace/codex/feature-agent',
        baseBranch: 'main',
        startPoint: 'main',
        workspaceParent: '/tmp/worktrees/app',
      },
    });
    agentRegistry.findActiveAgentsByRepository.mockReturnValue([{ id: 'existing-agent' }]);
    workspaceManager.createWorkspace.mockReturnValue({
      workspacePath: '/tmp/worktrees/app/workspace/codex/feature-agent',
      bootstrapCommand: 'npm install',
      workspace: {
        type: 'git-worktree',
        repositoryPath: '/workspace/app',
        repositoryName: 'app',
        worktreePath: '/tmp/worktrees/app/workspace/codex/feature-agent',
        branch: 'workspace/codex/feature-agent',
      },
    });

    const handler = handlers.get(dashboardIpcChannels.workspaceCreateFromPath);
    const result = await handler(null, {
      workspacePath: '/workspace/app',
      name: 'Feature Agent',
      role: 'Implementation',
      provider: 'codex',
      strategy: 'auto',
    });

    expect(workspaceManager.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: '/workspace/app',
      branchName: 'workspace/codex/feature-agent',
      baseBranch: 'main',
      startPoint: 'main',
      workspaceParent: '/tmp/worktrees/app',
    }));
    expect(agentRegistry.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: '/tmp/worktrees/app/workspace/codex/feature-agent',
      workspace: expect.objectContaining({ type: 'git-worktree' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      effectiveStrategy: 'worktree',
      bootstrapCommand: 'npm install',
    }));
  });
});
