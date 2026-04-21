const {
  applyRegistrationPreviewDefaults,
  buildCreateAgentPayload,
  buildDefaultCreateAgentFormState,
  buildFallbackBranchName,
  describeRegistrationPreview,
  getBranchModeForValue,
  isWorktreeStrategyEnabled,
} = require('../state.ts');

describe('create agent modal state helpers', () => {
  test('builds stable default form state', () => {
    expect(buildDefaultCreateAgentFormState()).toEqual(expect.objectContaining({
      branchMode: 'auto',
      openTerminal: true,
      provider: 'claude',
      strategy: 'auto',
    }));
  });

  test('normalizes fallback branch names', () => {
    expect(buildFallbackBranchName('Stock Monitor Agent', 'codex')).toBe('workspace/codex/stock-monitor-agent');
    expect(buildFallbackBranchName('', 'gemini')).toBe('workspace/gemini/agent');
  });

  test('applies registration preview defaults while preserving touched fields', () => {
    const formState = {
      ...buildDefaultCreateAgentFormState(),
      baseBranch: 'kept-base',
      branchName: '',
      name: 'Stock Monitor Agent',
      provider: 'codex',
      startPoint: 'kept-start',
      symlinkPaths: 'kept-link',
      workspaceParent: '',
    };
    const preview = {
      branches: ['main', 'dev'],
      currentBranch: 'main',
      effectiveStrategy: 'worktree',
      isGitRepository: true,
      repositoryName: 'stock-monitor',
      worktreeDefaults: {
        baseBranch: 'main',
        branchName: 'workspace/codex/stock-monitor-agent',
        symlinkPaths: ['node_modules', '.turbo'],
        workspaceParent: '/tmp/worktrees',
      },
    };

    const untouched = applyRegistrationPreviewDefaults(formState, preview, {
      baseBranch: false,
      startPoint: false,
      symlinkPaths: false,
    });

    expect(untouched).toEqual(expect.objectContaining({
      baseBranch: 'main',
      branchName: 'workspace/codex/stock-monitor-agent',
      startPoint: 'main',
      symlinkPaths: 'node_modules\n.turbo',
      workspaceParent: '/tmp/worktrees',
    }));

    const touched = applyRegistrationPreviewDefaults(formState, preview, {
      baseBranch: true,
      startPoint: true,
      symlinkPaths: true,
    });

    expect(touched).toEqual(expect.objectContaining({
      baseBranch: 'kept-base',
      startPoint: 'kept-start',
      symlinkPaths: 'kept-link',
      workspaceParent: '/tmp/worktrees',
    }));
  });

  test('describes preview and worktree strategy state', () => {
    const preview = {
      branches: ['main', 'dev'],
      currentBranch: 'main',
      effectiveStrategy: 'worktree',
      isGitRepository: true,
      repositoryInUse: true,
      repositoryName: 'stock-monitor',
    };

    expect(isWorktreeStrategyEnabled(preview, 'auto')).toBe(true);
    expect(describeRegistrationPreview(preview, 'auto')).toEqual(expect.objectContaining({
      previewStatus: 'Will create a managed git worktree because this repository is already in use',
      inspectStatus: 'Detected stock-monitor · main · 2 local branches',
    }));
  });

  test('builds create payload from controlled form state', () => {
    const formState = {
      ...buildDefaultCreateAgentFormState(),
      baseBranch: ' main ',
      bootstrapCommand: ' npm install ',
      branchName: ' feature/work ',
      copyPaths: '.env.local, config/dev.json',
      name: ' Stock Agent ',
      provider: 'unknown',
      role: ' Development ',
      startPoint: '',
      symlinkPaths: 'node_modules\n.turbo',
      workspaceParent: ' /tmp/worktrees ',
      workspacePath: ' /repo ',
    };

    expect(getBranchModeForValue('', formState, null)).toBe('auto');
    expect(buildCreateAgentPayload(formState)).toEqual({
      baseBranch: 'main',
      bootstrapCommand: 'npm install',
      branchName: 'feature/work',
      copyPaths: ['.env.local', 'config/dev.json'],
      name: 'Stock Agent',
      provider: 'claude',
      role: 'Development',
      startPoint: 'main',
      strategy: 'auto',
      symlinkPaths: ['node_modules', '.turbo'],
      workspaceParent: '/tmp/worktrees',
      workspacePath: '/repo',
    });
  });
});
