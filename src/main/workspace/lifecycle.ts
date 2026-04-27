import fs from 'fs';
import path from 'path';
import { sanitizeProjectPath } from '../../utils.js';
import type { DashboardWorkspace } from '../../shared/contracts/index.js';

export function mergeWorkspace(manager, workspace: DashboardWorkspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw new Error('Workspace metadata is required');
  }

  const repoRoot = manager.resolveRepositoryRoot(workspace.repositoryPath || workspace.worktreePath);
  const worktreePath = path.resolve(sanitizeProjectPath(workspace.worktreePath || ''));
  const branchName = String(workspace.branch || '').trim();
  const targetBranch = manager.resolveBaseBranch(repoRoot, workspace.baseBranch);

  if (!worktreePath || !branchName) {
    throw new Error('Workspace branch metadata is incomplete');
  }
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Workspace path does not exist: ${worktreePath}`);
  }

  manager.ensureClean(worktreePath, 'Workspace');
  manager.ensureClean(repoRoot, 'Repository');

  const originalBranch = manager.getCurrentBranch(repoRoot);
  const shouldRestore = originalBranch && originalBranch !== 'HEAD' && originalBranch !== targetBranch;
  let targetCheckedOut = false;

  try {
    if (originalBranch !== targetBranch) {
      manager.runGit(repoRoot, ['checkout', targetBranch]);
      targetCheckedOut = true;
    }

    manager.runGit(repoRoot, ['merge', '--no-edit', branchName]);
    manager.runGit(repoRoot, ['worktree', 'remove', worktreePath]);
    manager.runGit(repoRoot, ['branch', '-D', branchName]);

    if (shouldRestore) {
      manager.runGit(repoRoot, ['checkout', originalBranch]);
    }

    manager.debugLog(`[Workspace] Merged ${branchName} into ${targetBranch} and removed ${worktreePath}`);
    return {
      repositoryPath: repoRoot,
      targetBranch,
      mergedBranch: branchName,
      worktreePath,
    };
  } catch (error) {
    try {
      manager.runGit(repoRoot, ['merge', '--abort']);
    } catch {}

    if (shouldRestore && targetCheckedOut) {
      try {
        manager.runGit(repoRoot, ['checkout', originalBranch]);
      } catch {}
    }

    throw error;
  }
}

export function removeWorkspace(manager, workspace: DashboardWorkspace, options: { deleteBranch?: boolean } = {}) {
  if (!workspace || typeof workspace !== 'object') {
    throw new Error('Workspace metadata is required');
  }

  const repoRoot = manager.resolveRepositoryRoot(workspace.repositoryPath || workspace.worktreePath);
  const worktreePath = path.resolve(sanitizeProjectPath(workspace.worktreePath || ''));
  const branchName = String(workspace.branch || '').trim();
  const deleteBranch = options.deleteBranch !== false;

  if (!worktreePath || !branchName) {
    throw new Error('Workspace branch metadata is incomplete');
  }
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Workspace path does not exist: ${worktreePath}`);
  }

  manager.ensureClean(worktreePath, 'Workspace');
  manager.runGit(repoRoot, ['worktree', 'remove', worktreePath]);
  if (deleteBranch) {
    manager.runGit(repoRoot, ['branch', '-D', branchName]);
  }

  manager.debugLog(`[Workspace] Removed ${worktreePath} (${branchName})`);
  return {
    repositoryPath: repoRoot,
    removedBranch: deleteBranch ? branchName : null,
    worktreePath,
  };
}
