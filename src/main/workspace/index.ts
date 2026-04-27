const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sanitizeProjectPath } = require('../../utils');
const {
  mergeWorkspace: mergeWorkspaceLifecycle,
  removeWorkspace: removeWorkspaceLifecycle,
} = require('./lifecycle');
const {
  GLOBAL_WORKTREE_DIR,
  buildSuggestedBranchName,
  slugifyBranchName,
  normalizePathList,
  mergePathLists,
  detectDependencySymlinkPaths,
  formatCommandError,
  inspectWorkspacePath,
  copyIntoWorkspace,
  symlinkIntoWorkspace,
} = require('./helpers');

type WorkspaceManagerOptions = {
  debugLog?: (message: string) => void;
};

type WorkspaceCreateOptions = {
  name?: string;
  repoPath?: string;
  projectPath?: string;
  branchName?: string;
  baseBranch?: string;
  startPoint?: string;
  workspaceParent?: string;
  workspacePath?: string;
  copyPaths?: string[];
  symlinkPaths?: string[];
  autoDependencySymlinks?: boolean;
  bootstrapCommand?: string;
};

class WorkspaceManager {
  declare debugLog: (message: string) => void;

  constructor({ debugLog }: WorkspaceManagerOptions = {}) {
    this.debugLog = debugLog || (() => {});
  }

  runGit(repoPath, args) {
    try {
      return execFileSync('git', ['-c', `safe.directory=${repoPath}`, '-C', repoPath, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (error) {
      throw new Error(formatCommandError(error));
    }
  }

  resolveRepositoryRoot(repoPath) {
    const sanitizedPath = sanitizeProjectPath(repoPath);
    if (!sanitizedPath) {
      throw new Error('Repository path is required');
    }

    if (!fs.existsSync(sanitizedPath) || !fs.statSync(sanitizedPath).isDirectory()) {
      throw new Error(`Repository path does not exist: ${sanitizedPath}`);
    }

    // Use --git-common-dir to always resolve to the main repository root,
    // even when called from within a git worktree (--show-toplevel returns worktree path).
    const gitCommonDir = this.runGit(sanitizedPath, ['rev-parse', '--git-common-dir']);
    const absGitDir = path.resolve(sanitizedPath, gitCommonDir);
    return path.resolve(absGitDir, '..');
  }

  localBranchExists(repoPath, branchName) {
    try {
      this.runGit(repoPath, ['rev-parse', '--verify', `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  getCurrentBranch(repoPath) {
    try {
      return this.runGit(repoPath, ['branch', '--show-current']) || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  refExists(repoPath, ref) {
    if (!ref) return false;
    try {
      // Using `<ref>^{commit}` forces resolution to a commit object, so a dangling
      // HEAD in a repo with no commits is correctly reported as non-existent.
      this.runGit(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  getDefaultRemoteBranch(repoPath) {
    try {
      const head = this.runGit(repoPath, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
      const match = head && head.match(/refs\/remotes\/origin\/(.+)$/);
      if (match) return match[1].trim();
    } catch {}
    return null;
  }

  // Resolves a usable base branch ref for operations like worktree add / merge-base.
  // Resolution order:
  //   1. explicit hint — trusted; returned as-is (caller-intent wins)
  //   2. current branch, only if its ref actually resolves
  //   3. origin/HEAD's target branch, only if it actually resolves
  //   4. 'main' or 'master' if either actually resolves
  //   5. 'HEAD' as final fallback
  // Existence checks on auto-detected candidates avoid the `fatal: invalid reference: master`
  // case where `git branch --show-current` reports a name whose ref has been pruned.
  resolveBaseBranch(repoPath, hint) {
    const trimmedHint = typeof hint === 'string' ? hint.trim() : '';
    if (trimmedHint) return trimmedHint;

    const current = this.getCurrentBranch(repoPath);
    if (current && current !== 'HEAD' && this.refExists(repoPath, current)) return current;

    const remoteDefault = this.getDefaultRemoteBranch(repoPath);
    if (remoteDefault && this.refExists(repoPath, remoteDefault)) return remoteDefault;

    for (const candidate of ['main', 'master']) {
      if (this.refExists(repoPath, candidate)) return candidate;
    }
    return 'HEAD';
  }

  listLocalBranches(repoPath) {
    const output = this.runGit(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    return output
      .split(/\r?\n/)
      .map((branch) => branch.trim())
      .filter(Boolean);
  }

  inspectRepository(repoPath) {
    const repositoryPath = this.resolveRepositoryRoot(repoPath);
    const currentBranch = this.getCurrentBranch(repositoryPath);
    const branches = this.listLocalBranches(repositoryPath);

    return {
      repositoryPath,
      repositoryName: path.basename(repositoryPath),
      currentBranch,
      branches,
    };
  }

  inspectWorkspacePath(inputPath, options = {}) {
    return inspectWorkspacePath(this, inputPath, options);
  }

  ensureClean(repoPath, label) {
    const status = this.runGit(repoPath, ['status', '--porcelain']);
    if (status) {
      throw new Error(`${label} has uncommitted changes`);
    }
  }

  copyIntoWorkspace(repoRoot, workspacePath, relativePath) {
    return copyIntoWorkspace(repoRoot, workspacePath, relativePath);
  }

  symlinkIntoWorkspace(repoRoot, workspacePath, relativePath) {
    return symlinkIntoWorkspace(repoRoot, workspacePath, relativePath);
  }

  createWorkspace(options: WorkspaceCreateOptions = {}) {
    const name = String(options.name || '').trim();
    if (!name) {
      throw new Error('Workspace name is required');
    }

    const repoRoot = this.resolveRepositoryRoot(options.repoPath || options.projectPath);
    const repositoryName = path.basename(repoRoot);
    const branchName = slugifyBranchName(options.branchName || name);
    const explicitBaseBranch = typeof options.baseBranch === 'string' && options.baseBranch.trim().length > 0;
    const baseBranch = this.resolveBaseBranch(repoRoot, options.baseBranch);
    const startPointHint = String(options.startPoint || '').trim();
    const startPoint = startPointHint && this.refExists(repoRoot, startPointHint) ? startPointHint : baseBranch;

    // When we auto-detected the start point and it still doesn't resolve to a commit
    // (empty repo, dangling HEAD, pruned branches), fail fast with a clear error instead
    // of letting `git worktree add` bubble up a cryptic `fatal: invalid reference: HEAD`.
    // Explicit user-provided baseBranch is trusted as-is; git will surface its own error.
    if (!explicitBaseBranch && !startPointHint && !this.refExists(repoRoot, startPoint)) {
      throw new Error(
        `Cannot create worktree in ${repoRoot}: no valid base commit to branch from. `
        + `The repository appears to have no commits yet, or HEAD is detached/broken. `
        + `Create an initial commit in the repository, or pass an explicit baseBranch that `
        + `resolves to a commit.`,
      );
    }
    const defaultParent = path.join(GLOBAL_WORKTREE_DIR, repositoryName);
    const workspaceParent = path.resolve(sanitizeProjectPath(options.workspaceParent) || defaultParent);
    const workspacePath = path.resolve(sanitizeProjectPath(options.workspacePath) || path.join(workspaceParent, branchName));
    const copyPaths = normalizePathList(options.copyPaths);
    const dependencySymlinkPaths = options.autoDependencySymlinks === false
      ? []
      : detectDependencySymlinkPaths(repoRoot).filter((entry) => !copyPaths.includes(entry));
    const symlinkPaths = mergePathLists(
      normalizePathList(options.symlinkPaths),
      dependencySymlinkPaths,
    );
    const bootstrapCommand = String(options.bootstrapCommand || '').trim();

    if (fs.existsSync(workspacePath)) {
      const stats = fs.statSync(workspacePath);
      if (!stats.isDirectory()) {
        throw new Error(`Workspace path is not a directory: ${workspacePath}`);
      }
      if (fs.readdirSync(workspacePath).length > 0) {
        throw new Error(`Workspace path is not empty: ${workspacePath}`);
      }
    }

    fs.mkdirSync(workspaceParent, { recursive: true });

    let worktreeCreated = false;
    const branchAlreadyExists = this.localBranchExists(repoRoot, branchName);
    try {
      if (branchAlreadyExists) {
        this.runGit(repoRoot, ['worktree', 'add', workspacePath, branchName]);
      } else {
        this.runGit(repoRoot, ['worktree', 'add', '-b', branchName, workspacePath, startPoint]);
      }
      worktreeCreated = true;

      copyPaths.forEach((entry) => this.copyIntoWorkspace(repoRoot, workspacePath, entry));
      symlinkPaths.forEach((entry) => this.symlinkIntoWorkspace(repoRoot, workspacePath, entry));

      const workspace = {
        type: 'git-worktree',
        repositoryPath: repoRoot,
        repositoryName,
        worktreePath: workspacePath,
        workspaceParent,
        branch: branchName,
        startPoint,
        baseBranch,
        copyPaths,
        symlinkPaths,
        bootstrapCommand,
      };

      this.debugLog(`[Workspace] Created ${workspacePath} from ${repoRoot} (${branchName})`);
      return {
        workspacePath,
        branchName,
        bootstrapCommand,
        workspace,
      };
    } catch (error) {
      if (worktreeCreated) {
        try {
          this.runGit(repoRoot, ['worktree', 'remove', '--force', workspacePath]);
        } catch (cleanupError) {
          this.debugLog(`[Workspace] Cleanup failed for ${workspacePath}: ${cleanupError.message}`);
        }
        if (!branchAlreadyExists) {
          try {
            this.runGit(repoRoot, ['branch', '-D', branchName]);
          } catch (cleanupError) {
            this.debugLog(`[Workspace] Branch cleanup failed for ${branchName}: ${cleanupError.message}`);
          }
        }
      }
      throw error;
    }
  }

  mergeWorkspace(workspace) {
    return mergeWorkspaceLifecycle(this, workspace);
  }

  removeWorkspace(workspace, options: { deleteBranch?: boolean } = {}) {
    return removeWorkspaceLifecycle(this, workspace, options);
  }
}

export {
  WorkspaceManager,
  slugifyBranchName,
  buildSuggestedBranchName,
  normalizePathList,
  detectDependencySymlinkPaths,
};

module.exports = {
  WorkspaceManager,
  slugifyBranchName,
  buildSuggestedBranchName,
  normalizePathList,
  detectDependencySymlinkPaths,
};
