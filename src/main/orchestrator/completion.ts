import { cleanupTaskRuntime, cleanupTaskWorktree } from './cleanup.js';
import { autoCommitTaskChanges } from './output.js';

export function handleTaskSuccess(orchestrator, taskId) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task) return;

  autoCommitTaskChanges(orchestrator, task);

  orchestrator.taskStore.updateTask(taskId, {
    status: 'succeeded',
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });

  if (task.autoMergeOnSuccess && task.agentRegistryId) {
    try {
      const regAgent = orchestrator.agentRegistry.getAgent(task.agentRegistryId);
      if (regAgent?.workspace) {
        orchestrator.workspaceManager.mergeWorkspace(regAgent.workspace);
        orchestrator.debugLog(`[Orchestrator] Auto-merged task ${taskId}`);
      }
    } catch (e) {
      orchestrator.debugLog(`[Orchestrator] Auto-merge failed for ${taskId}: ${e.message}`);
    }
  }

  if (task.agentRegistryId) {
    orchestrator.agentRegistry.unlinkSession(task.agentRegistryId);
    const regAgent = orchestrator.agentRegistry.getAgent(task.agentRegistryId);
    const originalPath = regAgent?.workspace?.repositoryPath || task.repositoryPath;
    orchestrator.agentRegistry.updateAgent(task.agentRegistryId, { projectPath: originalPath });

    orchestrator.agentManager.updateAgent({
      registryId: task.agentRegistryId,
      state: 'done',
      projectPath: originalPath,
    }, 'orchestrator');
  }

  for (const candidate of orchestrator.taskStore.getAllTasks()) {
    if (candidate.status !== 'pending') continue;
    if (!candidate.dependsOn || !candidate.dependsOn.includes(taskId)) continue;
    const allDepsSucceeded = candidate.dependsOn.every((depId) => {
      const dep = orchestrator.taskStore.getTask(depId);
      return dep && dep.status === 'succeeded';
    });
    if (allDepsSucceeded) {
      orchestrator.taskStore.updateTask(candidate.id, { status: 'ready', updatedAt: Date.now() });
      orchestrator.emit('task:ready', orchestrator.taskStore.getTask(candidate.id));
    }
  }

  const updated = orchestrator.taskStore.getTask(taskId);
  orchestrator.emit('task:succeeded', updated);
  orchestrator.emit('task:updated', updated);
  orchestrator.debugLog(`[Orchestrator] Task succeeded: ${taskId}`);
}

export function handleTaskFailure(orchestrator, taskId, errorMessage) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task) return;

  if (task.attempt < task.maxAttempts - 1 && task.fallbackProviders.length > 0) {
    handleRetry(orchestrator, taskId, errorMessage);
    return;
  }

  orchestrator.taskStore.updateTask(taskId, {
    status: 'failed',
    errorMessage,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });

  cleanupTaskWorktree(orchestrator, taskId);
  if (task.agentRegistryId) {
    orchestrator.agentRegistry.unlinkSession(task.agentRegistryId);
    const regAgent = orchestrator.agentRegistry.getAgent(task.agentRegistryId);
    const originalPath = regAgent?.workspace?.repositoryPath || task.repositoryPath;
    orchestrator.agentRegistry.updateAgent(task.agentRegistryId, { projectPath: originalPath, workspace: null });
    orchestrator.agentManager.updateAgent({
      registryId: task.agentRegistryId,
      state: 'Offline',
      projectPath: originalPath,
      workspace: null,
    }, 'orchestrator');
  }

  const updated = orchestrator.taskStore.getTask(taskId);
  orchestrator.emit('task:failed', updated);
  orchestrator.emit('task:updated', updated);
  orchestrator.debugLog(`[Orchestrator] Task failed: ${taskId} — ${errorMessage}`);
}

export function handleContextExhaustion(orchestrator, taskId) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task || task.status !== 'running') return;

  cleanupTaskRuntime(orchestrator, taskId);
  const nextAttempt = task.attempt + 1;
  const nextProvider = task.fallbackProviders[task.attempt] || null;
  if (!nextProvider || nextAttempt >= task.maxAttempts) {
    handleTaskFailure(orchestrator, taskId, 'Context exhausted, no fallback available');
    return;
  }

  orchestrator.taskStore.updateTask(taskId, {
    status: 'retrying',
    attempt: nextAttempt,
    currentProvider: nextProvider,
    updatedAt: Date.now(),
  });

  const updated = orchestrator.taskStore.getTask(taskId);
  orchestrator.emit('task:retrying', updated);
  orchestrator.emit('task:updated', updated);
  orchestrator.debugLog(`[Orchestrator] Context exhausted for ${taskId}, retrying with ${nextProvider}`);
  orchestrator.taskStore.updateTask(taskId, { status: 'ready', updatedAt: Date.now() });
}

export function handleRetry(orchestrator, taskId, errorMessage) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task) return;

  const nextAttempt = task.attempt + 1;
  const nextProvider = task.fallbackProviders[task.attempt] || task.provider;
  orchestrator.taskStore.updateTask(taskId, {
    status: 'retrying',
    attempt: nextAttempt,
    currentProvider: nextProvider,
    errorMessage,
    updatedAt: Date.now(),
  });

  const updated = orchestrator.taskStore.getTask(taskId);
  orchestrator.emit('task:retrying', updated);
  orchestrator.emit('task:updated', updated);
  orchestrator.debugLog(`[Orchestrator] Retrying task ${taskId} (attempt ${nextAttempt}) with ${nextProvider}`);
  orchestrator.taskStore.updateTask(taskId, { status: 'ready', updatedAt: Date.now() });
}
