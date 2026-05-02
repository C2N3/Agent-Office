export function autoCommitTaskChanges(orchestrator, task) {
  if (!task || !task.workspacePath || !orchestrator.workspaceManager) return;
  try {
    const status = orchestrator.workspaceManager.runGit(task.workspacePath, ['status', '--porcelain']);
    if (!status || !status.trim()) return;
    orchestrator.workspaceManager.runGit(task.workspacePath, ['add', '-A']);
    const title = (task.title || 'task').replace(/"/g, '\\"');
    orchestrator.workspaceManager.runGit(task.workspacePath, [
      'commit',
      '-m', `task: ${title} (auto-commit)`,
    ]);
    orchestrator.debugLog(`[Orchestrator] Auto-committed leftover changes for ${task.id.slice(0, 8)}`);
  } catch (e) {
    orchestrator.debugLog(`[Orchestrator] Auto-commit failed for ${task.id.slice(0, 8)}: ${e.message}`);
  }
}
