const fs = require('fs');
const path = require('path');
const os = require('os');
const { cleanTerminalOutput } = require('./cleanOutput');

const TASK_OUTPUT_DIR = path.join(os.homedir(), '.agent-office', 'task-output');

function autoCommitTaskChanges(orchestrator, task) {
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

function saveTaskOutput(orchestrator, taskId) {
  const parser = orchestrator.outputParsers.get(taskId);
  if (!parser) return;

  try {
    const fullOutput = parser.getFullOutput();
    if (!fullOutput) return;
    const clean = cleanTerminalOutput(fullOutput);
    if (!clean) return;
    fs.mkdirSync(TASK_OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(TASK_OUTPUT_DIR, `${taskId}.txt`);
    fs.writeFileSync(outputPath, clean, 'utf-8');
    orchestrator.taskStore.updateTask(taskId, { outputPath });
    orchestrator.debugLog(`[Orchestrator] Saved task output: ${outputPath}`);
  } catch (e) {
    orchestrator.debugLog(`[Orchestrator] Failed to save task output: ${e.message}`);
  }
}

module.exports = { autoCommitTaskChanges, saveTaskOutput };
