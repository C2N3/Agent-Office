const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const { execFileSync } = require('child_process');
const { WorkspaceManager, slugifyBranchName } = require('../src/main/workspaceManager');

describe('WorkspaceManager', () => {
  let tempRoot;
  let repoRoot;
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-workspace-'));
    repoRoot = path.join(tempRoot, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.env.local'), 'API_KEY=test\n', 'utf8');
    fs.mkdirSync(path.join(repoRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'node_modules', 'dep.txt'), 'shared dependency\n', 'utf8');

    execFileSync.mockImplementation((command, args) => {
      if (command !== 'git') {
        throw new Error(`Unexpected command: ${command}`);
      }

      const workingTree = args[3];
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${workingTree}\n`;
      }

      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return 'main\n';
      }

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--verify') {
        const error = new Error('missing branch');
        error.stderr = Buffer.from('fatal: Needed a single revision');
        throw error;
      }

      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
        const workspacePath = gitArgs.includes('-b') ? gitArgs[4] : gitArgs[2];
        fs.mkdirSync(workspacePath, { recursive: true });
        return '';
      }

      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
        fs.rmSync(gitArgs[3], { recursive: true, force: true });
        return '';
      }

      return '';
    });

    manager = new WorkspaceManager({ debugLog: jest.fn() });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('slugifies branch names for workspace creation', () => {
    expect(slugifyBranchName('Feature Agent #1')).toBe('feature-agent-1');
  });

  test('creates a worktree and syncs copy/symlink paths', () => {
    const result = manager.createWorkspace({
      name: 'Feature Agent',
      repoPath: repoRoot,
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
    execFileSync.mockImplementation((command, args) => {
      const workingTree = args[3];
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${workingTree}\n`;
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return 'develop\n';
      }
      if (gitArgs[0] === 'for-each-ref') {
        return 'develop\nmain\nrelease/1.0\n';
      }
      return '';
    });

    const result = manager.inspectRepository(repoRoot);

    expect(result).toEqual({
      repositoryPath: repoRoot,
      repositoryName: 'repo',
      currentBranch: 'develop',
      branches: ['develop', 'main', 'release/1.0'],
    });
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
    execFileSync.mockImplementation((command, args) => {
      const workingTree = args[3];
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${workingTree}\n`;
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return 'main\n';
      }
      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--verify') {
        return 'abc123\n';
      }
      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
        fs.mkdirSync(gitArgs[2], { recursive: true });
        return '';
      }
      return '';
    });

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

    execFileSync.mockImplementation((command, args) => {
      const workingTree = args[3];
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${repoRoot}\n`;
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return 'main\n';
      }
      if (gitArgs[0] === 'status' && gitArgs[1] === '--porcelain') {
        return '';
      }
      if (gitArgs[0] === 'merge') {
        return 'Merge made by the ort strategy.\n';
      }
      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
        fs.rmSync(gitArgs[2], { recursive: true, force: true });
        return '';
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '-d') {
        return '';
      }
      return '';
    });

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

    execFileSync.mockImplementation((command, args) => {
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${repoRoot}\n`;
      }
      if (gitArgs[0] === 'status' && gitArgs[1] === '--porcelain') {
        return '';
      }
      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
        fs.rmSync(gitArgs[2], { recursive: true, force: true });
        return '';
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '-d') {
        return '';
      }
      return '';
    });

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

    execFileSync.mockImplementation((command, args) => {
      const gitArgs = args.slice(4);

      if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
        return `${repoRoot}\n`;
      }
      if (gitArgs[0] === 'branch' && gitArgs[1] === '--show-current') {
        return 'main\n';
      }
      if (gitArgs[0] === 'status' && gitArgs[1] === '--porcelain') {
        return workingTreeMatcher(args[3], worktreePath) ? ' M index.js\n' : '';
      }
      return '';
    });

    expect(() => manager.mergeWorkspace({
      repositoryPath: repoRoot,
      worktreePath,
      branch: 'feature-agent',
      baseBranch: 'main',
    })).toThrow('Workspace has uncommitted changes');
  });
});

function workingTreeMatcher(actual, expected) {
  return path.resolve(actual) === path.resolve(expected);
}
