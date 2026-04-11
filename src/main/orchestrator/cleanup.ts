// @ts-nocheck

function cleanupTaskRuntime(orchestrator, taskId) {
  const idleTimer = orchestrator.idleTimers.get(taskId);
  if (idleTimer) {
    clearTimeout(idleTimer);
    orchestrator.idleTimers.delete(taskId);
  }
  orchestrator.taskOutputBytes.delete(taskId);
  orchestrator._exitSent?.delete(taskId);

  const fns = orchestrator.cleanupFns.get(taskId);
  if (fns) {
    for (const fn of fns) {
      try { fn(); } catch {}
    }
    orchestrator.cleanupFns.delete(taskId);
  }
  orchestrator.outputParsers.delete(taskId);
}

function cleanupTaskWorktree(orchestrator, taskId) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task || !task.workspacePath) return;

  if (task.terminalId && orchestrator.terminalManager.hasTerminal(task.terminalId)) {
    orchestrator.terminalManager.destroyTerminal(task.terminalId);
  }

  const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
  let repoRoot;
  try {
    repoRoot = orchestrator.workspaceManager.resolveRepositoryRoot(task.repositoryPath);
  } catch (e) {
    orchestrator.debugLog(`[Orchestrator] Cannot resolve repo root for ${taskId.slice(0, 8)}: ${e.message}`);
    return;
  }

  const attemptRemove = (attempt) => {
    try {
      orchestrator.workspaceManager.runGit(repoRoot, ['worktree', 'remove', '--force', task.workspacePath]);
    } catch (e) {
      if (attempt < 3) {
        orchestrator.debugLog(`[Workspace] Remove attempt ${attempt + 1} failed, retrying in ${(attempt + 1) * 3}s...`);
        setTimeout(() => attemptRemove(attempt + 1), (attempt + 1) * 3000);
        return;
      }
      orchestrator.debugLog(`[Workspace] Remove failed after ${attempt + 1} attempts: ${e.message}`);
      return;
    }
    try {
      orchestrator.workspaceManager.runGit(repoRoot, ['branch', '-D', branchName]);
    } catch {}
    orchestrator.debugLog(`[Orchestrator] Cleaned up worktree for ${taskId.slice(0, 8)}`);
  };

  setTimeout(() => attemptRemove(0), process.platform === 'win32' ? 3000 : 500);
}

async function withRepoLock(orchestrator, repoPath, fn) {
  const existing = orchestrator.repoLocks.get(repoPath) || Promise.resolve();
  const next = existing.then(fn, fn);
  orchestrator.repoLocks.set(repoPath, next);
  await next;
}

module.exports = { cleanupTaskRuntime, cleanupTaskWorktree, withRepoLock };
