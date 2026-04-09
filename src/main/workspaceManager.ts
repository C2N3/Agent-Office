// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sanitizeProjectPath } = require('../utils');

function slugifyBranchName(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/\/-+|-+\//g, '/')
    .replace(/^\/+|\/+$/g, '');

  const fallback = normalized || 'agent-workspace';
  return fallback.slice(0, 80).replace(/^-+|-+$/g, '') || 'agent-workspace';
}

function normalizePathList(value) {
  const rawList = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);

  return rawList
    .map((entry) => sanitizeProjectPath(entry))
    .filter(Boolean);
}

function formatCommandError(error) {
  const stderr = error?.stderr?.toString?.().trim?.();
  const stdout = error?.stdout?.toString?.().trim?.();
  return stderr || stdout || error.message || 'Command failed';
}

function ensureSafeRelativePath(rootPath, entryPath) {
  const resolved = path.resolve(rootPath, entryPath);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside the repository: ${entryPath}`);
  }
  return resolved;
}

function ensureMissingDestination(destinationPath, sourceLabel) {
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Destination already exists for ${sourceLabel}: ${destinationPath}`);
  }
}

class WorkspaceManager {
  constructor({ debugLog } = {}) {
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

    const root = this.runGit(sanitizedPath, ['rev-parse', '--show-toplevel']);
    return path.resolve(root);
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

  ensureClean(repoPath, label) {
    const status = this.runGit(repoPath, ['status', '--porcelain']);
    if (status) {
      throw new Error(`${label} has uncommitted changes`);
    }
  }

  copyIntoWorkspace(repoRoot, workspacePath, relativePath) {
    const sourcePath = ensureSafeRelativePath(repoRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Copy source does not exist: ${relativePath}`);
    }

    const destinationPath = path.join(workspacePath, relativePath);
    ensureMissingDestination(destinationPath, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.cpSync(sourcePath, destinationPath, { recursive: true, errorOnExist: true });
  }

  symlinkIntoWorkspace(repoRoot, workspacePath, relativePath) {
    const sourcePath = ensureSafeRelativePath(repoRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Symlink source does not exist: ${relativePath}`);
    }

    const destinationPath = path.join(workspacePath, relativePath);
    ensureMissingDestination(destinationPath, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

    const stats = fs.lstatSync(sourcePath);
    const linkType = process.platform === 'win32'
      ? (stats.isDirectory() ? 'junction' : 'file')
      : (stats.isDirectory() ? 'dir' : 'file');

    fs.symlinkSync(sourcePath, destinationPath, linkType);
  }

  createWorkspace(options = {}) {
    const name = String(options.name || '').trim();
    if (!name) {
      throw new Error('Workspace name is required');
    }

    const repoRoot = this.resolveRepositoryRoot(options.repoPath || options.projectPath);
    const repositoryName = path.basename(repoRoot);
    const branchName = slugifyBranchName(options.branchName || name);
    const detectedBaseBranch = this.getCurrentBranch(repoRoot);
    const baseBranch = String(options.baseBranch || detectedBaseBranch || 'HEAD').trim() || 'HEAD';
    const startPoint = String(options.startPoint || baseBranch).trim() || baseBranch;
    const defaultParent = path.join(path.dirname(repoRoot), `${repositoryName}-worktrees`);
    const workspaceParent = path.resolve(sanitizeProjectPath(options.workspaceParent) || defaultParent);
    const workspacePath = path.resolve(sanitizeProjectPath(options.workspacePath) || path.join(workspaceParent, branchName));
    const copyPaths = normalizePathList(options.copyPaths);
    const symlinkPaths = normalizePathList(options.symlinkPaths);
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
    if (!workspace || typeof workspace !== 'object') {
      throw new Error('Workspace metadata is required');
    }

    const repoRoot = this.resolveRepositoryRoot(workspace.repositoryPath || workspace.worktreePath);
    const worktreePath = path.resolve(sanitizeProjectPath(workspace.worktreePath || ''));
    const branchName = String(workspace.branch || '').trim();
    const targetBranch = String(workspace.baseBranch || this.getCurrentBranch(repoRoot) || 'main').trim();

    if (!worktreePath || !branchName) {
      throw new Error('Workspace branch metadata is incomplete');
    }
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Workspace path does not exist: ${worktreePath}`);
    }

    this.ensureClean(worktreePath, 'Workspace');
    this.ensureClean(repoRoot, 'Repository');

    const originalBranch = this.getCurrentBranch(repoRoot);
    const shouldRestore = originalBranch && originalBranch !== 'HEAD' && originalBranch !== targetBranch;
    let targetCheckedOut = false;

    try {
      if (originalBranch !== targetBranch) {
        this.runGit(repoRoot, ['checkout', targetBranch]);
        targetCheckedOut = true;
      }

      this.runGit(repoRoot, ['merge', '--no-edit', branchName]);
      this.runGit(repoRoot, ['worktree', 'remove', worktreePath]);
      this.runGit(repoRoot, ['branch', '-d', branchName]);

      if (shouldRestore) {
        this.runGit(repoRoot, ['checkout', originalBranch]);
      }

      this.debugLog(`[Workspace] Merged ${branchName} into ${targetBranch} and removed ${worktreePath}`);
      return {
        repositoryPath: repoRoot,
        targetBranch,
        mergedBranch: branchName,
        worktreePath,
      };
    } catch (error) {
      try {
        this.runGit(repoRoot, ['merge', '--abort']);
      } catch {}

      if (shouldRestore && targetCheckedOut) {
        try {
          this.runGit(repoRoot, ['checkout', originalBranch]);
        } catch {}
      }

      throw error;
    }
  }

  removeWorkspace(workspace, options = {}) {
    if (!workspace || typeof workspace !== 'object') {
      throw new Error('Workspace metadata is required');
    }

    const repoRoot = this.resolveRepositoryRoot(workspace.repositoryPath || workspace.worktreePath);
    const worktreePath = path.resolve(sanitizeProjectPath(workspace.worktreePath || ''));
    const branchName = String(workspace.branch || '').trim();
    const deleteBranch = options.deleteBranch !== false;

    if (!worktreePath || !branchName) {
      throw new Error('Workspace branch metadata is incomplete');
    }
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Workspace path does not exist: ${worktreePath}`);
    }

    this.ensureClean(worktreePath, 'Workspace');
    this.runGit(repoRoot, ['worktree', 'remove', worktreePath]);
    if (deleteBranch) {
      this.runGit(repoRoot, ['branch', '-d', branchName]);
    }

    this.debugLog(`[Workspace] Removed ${worktreePath} (${branchName})`);
    return {
      repositoryPath: repoRoot,
      removedBranch: deleteBranch ? branchName : null,
      worktreePath,
    };
  }
}

module.exports = {
  WorkspaceManager,
  slugifyBranchName,
  normalizePathList,
};
