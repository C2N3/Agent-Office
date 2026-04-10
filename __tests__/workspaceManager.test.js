const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const { execFileSync } = require('child_process');
const {
  WorkspaceManager,
  buildSuggestedBranchName,
  slugifyBranchName,
} = require('../src/main/workspaceManager');

describe('WorkspaceManager', () => {
  let tempRoot;
  let repoRoot;
  let manager;

  function mockGit({
    currentBranch = 'main',
    branches = ['main'],
    branchExists = false,
    dirtyPath = null,
    nonGitPaths = new Set(),
  } = {}) {
    execFileSync.mockImplementation((command, args) => {
      if (command !== 'git') {
        throw new Error(`Unexpected command: ${command}`);
      }

      const workingTree = args[3];
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--git-common-dir') {
        if (nonGitPaths.has(path.resolve(workingTree))) {
          const error = new Error('not a git repository');
          error.stderr = Buffer.from('fatal: not a git repository');
          throw error;
        }
        return '.git\n';
      }

      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return `${currentBranch}\n`;
      }

      if (gitArgs[0] === 'for-each-ref') {
        return `${branches.join('\n')}\n`;
      }

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--verify') {
        if (branchExists) {
          return 'abc123\n';
        }
        const error = new Error('missing branch');
        error.stderr = Buffer.from('fatal: Needed a single revision');
        throw error;
      }

      if (gitArgs[0] === 'status' && gitArgs[1] === '--porcelain') {
        return dirtyPath && path.resolve(workingTree) === path.resolve(dirtyPath)
          ? ' M index.js\n'
          : '';
      }

      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
        const workspacePath = gitArgs.includes('-b') ? gitArgs[4] : gitArgs[2];
        fs.mkdirSync(workspacePath, { recursive: true });
        return '';
      }

      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
        fs.rmSync(gitArgs[gitArgs.length - 1], { recursive: true, force: true });
        return '';
      }

      return '';
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-workspace-'));
    repoRoot = path.join(tempRoot, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.env.local'), 'API_KEY=test\n', 'utf8');
    fs.mkdirSync(path.join(repoRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'node_modules', 'dep.txt'), 'shared dependency\n', 'utf8');

    mockGit({ branches: ['main', 'release/1.0'] });
    manager = new WorkspaceManager({ debugLog: jest.fn() });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('slugifies branch names for workspace creation', () => {
    expect(slugifyBranchName('Feature Agent #1')).toBe('feature-agent-1');
  });

  test('builds provider-aware branch suggestions', () => {
    expect(buildSuggestedBranchName({ name: 'Feature Agent', provider: 'codex' }))
      .toBe('workspace/codex/feature-agent');
  });

  test('creates a worktree and syncs copy/symlink paths', () => {
    const result = manager.createWorkspace({
      name: 'Feature Agent',
      repoPath: repoRoot,
      workspaceParent: path.join(tempRoot, 'managed-worktrees'),
      copyPaths: ['.env.local'],
      symlinkPaths: ['node_modules'],
      bootstrapCommand: 'npm install',
    });

    expect(result.branchName).toBe('feature-agent');
    expect(result.workspace.repositoryName).toBe('repo');
    expect(result.workspace.baseBranch).toBe('main');
    expect(result.bootstrapCommand).toBe('npm install');

    const copiedEnv = path.join(result.workspacePath, '.env.local');
    const linkedModules = path.join(result.workspacePath, 'node_modules');

    expect(fs.readFileSync(copiedEnv, 'utf8')).toContain('API_KEY=test');
    expect(fs.lstatSync(linkedModules).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(linkedModules)).toBe(path.join(repoRoot, 'node_modules'));
  });

  test('inspects a repository and lists local branches', () => {
    mockGit({
      currentBranch: 'develop',
      branches: ['develop', 'main', 'release/1.0'],
    });

    const result = manager.inspectRepository(repoRoot);

    expect(result).toEqual({
      repositoryPath: repoRoot,
      repositoryName: 'repo',
      currentBranch: 'develop',
      branches: ['develop', 'main', 'release/1.0'],
    });
  });

  test('inspects a workspace path and returns worktree defaults for git repositories', () => {
    const result = manager.inspectWorkspacePath(repoRoot, {
      name: 'Feature Agent',
      provider: 'codex',
    });

    expect(result).toEqual(expect.objectContaining({
      normalizedPath: repoRoot,
      isGitRepository: true,
      repositoryPath: repoRoot,
      repositoryName: 'repo',
      currentBranch: 'main',
      branches: ['main', 'release/1.0'],
      worktreeDefaults: expect.objectContaining({
        branchName: 'workspace/codex/feature-agent',
        baseBranch: 'main',
        startPoint: 'main',
      }),
    }));
  });

  test('marks non-git paths as direct registration candidates', () => {
    const plainPath = path.join(tempRoot, 'plain-folder');
    fs.mkdirSync(plainPath, { recursive: true });
    mockGit({ nonGitPaths: new Set([plainPath]) });

    const result = manager.inspectWorkspacePath(plainPath, {
      name: 'Plain Folder',
      provider: 'claude',
    });

    expect(result).toEqual(expect.objectContaining({
      normalizedPath: plainPath,
      isGitRepository: false,
      repositoryPath: null,
      currentBranch: null,
      branches: [],
      worktreeDefaults: expect.objectContaining({
        branchName: 'workspace/claude/plain-folder',
      }),
    }));
  });

  test('stores explicit baseBranch and defaults startPoint to it', () => {
    const result = manager.createWorkspace({
      name: 'Feature Agent',
      repoPath: repoRoot,
      baseBranch: 'release/2026.04',
      branchName: 'workspace/claude/feature-agent',
    });

    expect(result.workspace.baseBranch).toBe('release/2026.04');
    expect(result.workspace.startPoint).toBe('release/2026.04');

    const worktreeAddCall = execFileSync.mock.calls.find(([, args]) => args.includes('worktree') && args.includes('add'));
    expect(worktreeAddCall).toBeDefined();
    expect(worktreeAddCall[1]).toEqual(expect.arrayContaining([
      'worktree',
      'add',
      '-b',
      'workspace/claude/feature-agent',
      result.workspacePath,
      'release/2026.04',
    ]));
  });

  test('uses an existing local branch without -b', () => {
    mockGit({ branchExists: true });

    manager.createWorkspace({
      name: 'existing branch',
      repoPath: repoRoot,
      branchName: 'feature/existing',
    });

    const worktreeAddCall = execFileSync.mock.calls.find(([, args]) => args.includes('worktree') && args.includes('add'));
    expect(worktreeAddCall).toBeDefined();
    expect(worktreeAddCall[1]).toEqual(expect.arrayContaining(['worktree', 'add', 'feature/existing']));
    expect(worktreeAddCall[1]).not.toContain('-b');
  });

  test('merges a workspace branch, removes the worktree, and deletes the branch', () => {
    const worktreePath = path.join(tempRoot, 'repo-worktrees', 'feature-agent');
    fs.mkdirSync(worktreePath, { recursive: true });

    const result = manager.mergeWorkspace({
      repositoryPath: repoRoot,
      worktreePath,
      branch: 'feature-agent',
      baseBranch: 'main',
    });

    expect(result.targetBranch).toBe('main');
    expect(result.mergedBranch).toBe('feature-agent');
    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  test('removes a workspace and deletes its branch without merge', () => {
    const worktreePath = path.join(tempRoot, 'repo-worktrees', 'feature-agent');
    fs.mkdirSync(worktreePath, { recursive: true });

    const result = manager.removeWorkspace({
      repositoryPath: repoRoot,
      worktreePath,
      branch: 'feature-agent',
    });

    expect(result.removedBranch).toBe('feature-agent');
    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  test('rejects merge when the workspace is dirty', () => {
    const worktreePath = path.join(tempRoot, 'repo-worktrees', 'feature-agent');
    fs.mkdirSync(worktreePath, { recursive: true });
    mockGit({ dirtyPath: worktreePath });

    expect(() => manager.mergeWorkspace({
      repositoryPath: repoRoot,
      worktreePath,
      branch: 'feature-agent',
      baseBranch: 'main',
    })).toThrow('Workspace has uncommitted changes');
  });
});
