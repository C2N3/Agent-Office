// @ts-nocheck
const { createCLIAdapter } = require('./cliAdapter');
const { OutputParser } = require('./outputParser');
const { isTerminalStatus } = require('./taskStateMachine');
const { cleanupTaskRuntime, cleanupTaskWorktree, withRepoLock } = require('./cleanup');
const { autoCommitTaskChanges, saveTaskOutput } = require('./output');

const STDIN_READY_TIMEOUT_MS = 8000;
const STDIN_POST_READY_MS = 400;
const IDLE_EXIT_MS = 30000;
const IDLE_ARM_BYTES = 500;
const CLAUDE_READY_MARKER = /╰[─━]/;

async function dispatchTask(orchestrator, task) {
  orchestrator.taskStore.updateTask(task.id, { status: 'provisioning', updatedAt: Date.now() });
  orchestrator.emit('task:updated', orchestrator.taskStore.getTask(task.id));

  const provider = task.currentProvider || task.provider;
  const adapter = createCLIAdapter(provider);

  let workspacePath = task.workspacePath;
  let workspaceMetadata = null;
  if (!workspacePath && task.repositoryPath) {
    const branchName = task.branchName || `task/${task.id.slice(0, 8)}`;
    await withRepoLock(orchestrator, task.repositoryPath, async () => {
      const result = orchestrator.workspaceManager.createWorkspace({
        name: task.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40),
        repoPath: task.repositoryPath,
        branchName,
        baseBranch: task.baseBranch || undefined,
        workspaceParent: task.workspaceParent || undefined,
        copyPaths: task.copyPaths || [],
        symlinkPaths: task.symlinkPaths || [],
        bootstrapCommand: task.bootstrapCommand || '',
      });
      workspacePath = result.workspacePath;
      workspaceMetadata = result.workspace;

      if (task.parentTaskId) {
        const parent = orchestrator.taskStore.getTask(task.parentTaskId);
        if (parent && parent.workspacePath) {
          try {
            const parentBranch = parent.branchName || `task/${parent.id.slice(0, 8)}`;
            orchestrator.workspaceManager.runGit(workspacePath, ['merge', '--squash', parentBranch]);
            orchestrator.workspaceManager.runGit(workspacePath, ['commit', '-m', `Inherit changes from parent task: ${parent.title}`, '--allow-empty']);
          } catch (e) {
            orchestrator.debugLog(`[Orchestrator] Parent merge warning: ${e.message}`);
          }
        }
      }
    });
  }

  orchestrator.taskStore.updateTask(task.id, { workspacePath, currentProvider: provider });

  let agentRegistryId = task.agentRegistryId;
  if (!agentRegistryId) {
    const agent = orchestrator.agentRegistry.createAgent(
      task.title,
      'autonomous',
      workspacePath || task.repositoryPath,
      undefined,
      provider,
      task.model || null,
      null
    );
    agentRegistryId = agent.id;
    orchestrator.taskStore.updateTask(task.id, { agentRegistryId });
  }

  const existingAgent = orchestrator.agentRegistry.getAgent(agentRegistryId);
  if (agentRegistryId) {
    orchestrator.agentRegistry.updateAgent(agentRegistryId, {
      provider,
      model: task.model || null,
      workspace: workspaceMetadata || undefined,
    });
  }

  orchestrator.agentManager.updateAgent({
    registryId: agentRegistryId,
    displayName: existingAgent?.name || task.title,
    role: existingAgent?.role || 'autonomous',
    projectPath: workspacePath || task.repositoryPath,
    provider,
    isRegistered: true,
    state: 'Working',
    workspace: workspaceMetadata || undefined,
  }, 'orchestrator');

  const spawnConfig = adapter.buildSpawnConfig({
    cwd: workspacePath || task.repositoryPath,
    prompt: task.prompt,
    model: task.model || null,
    maxTurns: task.maxTurns,
  });

  const terminalId = agentRegistryId;
  if (orchestrator.terminalManager.hasTerminal(terminalId)) {
    orchestrator.terminalManager.destroyTerminal(terminalId);
  }
  const termResult = orchestrator.terminalManager.createTerminal(terminalId, {
    cwd: workspacePath || task.repositoryPath,
    command: spawnConfig.command,
    args: spawnConfig.args,
  });
  if (!termResult.success) {
    throw new Error(`Terminal spawn failed: ${termResult.error}`);
  }

  orchestrator.taskStore.updateTask(task.id, { terminalId });
  const outputParser = new OutputParser(adapter);
  orchestrator.outputParsers.set(task.id, outputParser);

  const cleanups = [];
  const stdinState = (spawnConfig.promptDelivery === 'stdin' && adapter.buildStdinPrompt)
    ? { written: false, fallbackTimer: null, postReadyTimer: null }
    : null;

  const writePromptOnce = () => {
    if (!stdinState || stdinState.written) return;
    stdinState.written = true;
    if (stdinState.fallbackTimer) {
      clearTimeout(stdinState.fallbackTimer);
      stdinState.fallbackTimer = null;
    }
    if (stdinState.postReadyTimer) {
      clearTimeout(stdinState.postReadyTimer);
      stdinState.postReadyTimer = null;
    }
    orchestrator.terminalManager.writeToTerminal(terminalId, adapter.buildStdinPrompt(task.prompt));
    orchestrator.debugLog(`[Orchestrator] Prompt delivered via stdin: ${task.id.slice(0, 8)}`);
  };

  cleanups.push(orchestrator.terminalManager.tapOutput(terminalId, (data) => {
    if (stdinState && !stdinState.written && !stdinState.postReadyTimer
        && CLAUDE_READY_MARKER.test(data)) {
      stdinState.postReadyTimer = setTimeout(writePromptOnce, STDIN_POST_READY_MS);
    }
    handleTaskOutput(orchestrator, task.id, data, outputParser);
  }));
  cleanups.push(orchestrator.terminalManager.tapExit(terminalId, (exitCode) => {
    if (stdinState) {
      if (stdinState.fallbackTimer) clearTimeout(stdinState.fallbackTimer);
      if (stdinState.postReadyTimer) clearTimeout(stdinState.postReadyTimer);
    }
    handleTaskExit(orchestrator, task.id, exitCode);
  }));
  orchestrator.cleanupFns.set(task.id, cleanups);

  if (stdinState) {
    stdinState.fallbackTimer = setTimeout(() => {
      stdinState.fallbackTimer = null;
      if (stdinState.written) return;
      orchestrator.debugLog(`[Orchestrator] TUI readiness marker not seen in ${STDIN_READY_TIMEOUT_MS}ms - writing prompt anyway: ${task.id.slice(0, 8)}`);
      writePromptOnce();
    }, STDIN_READY_TIMEOUT_MS);
  }

  orchestrator.taskStore.updateTask(task.id, {
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  orchestrator.emit('task:running', orchestrator.taskStore.getTask(task.id));
  orchestrator.emit('task:updated', orchestrator.taskStore.getTask(task.id));
  orchestrator.debugLog(`[Orchestrator] Task running: ${task.id} provider=${provider}`);
}

function handleTaskOutput(orchestrator, taskId, data, outputParser) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task || task.status !== 'running') return;

  const events = outputParser.feed(data);
  orchestrator.taskStore.updateTask(taskId, { lastOutput: outputParser.getRecentOutput(500) });

  if (outputParser.isContextExhausted()) {
    handleContextExhaustion(orchestrator, taskId);
    return;
  }
  for (const evt of events) {
    if (evt.type === 'context_exhaustion') {
      handleContextExhaustion(orchestrator, taskId);
      return;
    }
  }

  const prevBytes = orchestrator.taskOutputBytes.get(taskId) || 0;
  const newBytes = prevBytes + (data ? data.length : 0);
  orchestrator.taskOutputBytes.set(taskId, newBytes);
  if (newBytes >= IDLE_ARM_BYTES) {
    resetIdleTimer(orchestrator, taskId);
  }
}

function resetIdleTimer(orchestrator, taskId) {
  if (orchestrator._exitSent?.has(taskId)) return;

  const existing = orchestrator.idleTimers.get(taskId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    orchestrator.idleTimers.delete(taskId);
    const task = orchestrator.taskStore.getTask(taskId);
    if (!task || task.status !== 'running') return;
    if (task.terminalId && orchestrator.terminalManager.hasTerminal(task.terminalId)) {
      orchestrator.debugLog(`[Orchestrator] Idle timeout for ${taskId.slice(0, 8)}, sending /exit`);
      orchestrator.terminalManager.writeToTerminal(task.terminalId, '/exit\r');
      if (!orchestrator._exitSent) orchestrator._exitSent = new Set();
      orchestrator._exitSent.add(taskId);
    }
  }, IDLE_EXIT_MS);

  orchestrator.idleTimers.set(taskId, timer);
}

function handleTaskExit(orchestrator, taskId, exitCode) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task || isTerminalStatus(task.status)) return;

  saveTaskOutput(orchestrator, taskId);
  cleanupTaskRuntime(orchestrator, taskId);
  orchestrator.taskStore.updateTask(taskId, { exitCode });

  if (exitCode === 0) {
    handleTaskSuccess(orchestrator, taskId);
    return;
  }

  const parser = orchestrator.outputParsers.get(taskId);
  if (parser && parser.isContextExhausted()) {
    handleContextExhaustion(orchestrator, taskId);
  } else {
    handleTaskFailure(orchestrator, taskId, `CLI exited with code ${exitCode}`);
  }
}

function handleTaskSuccess(orchestrator, taskId) {
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
      reportTaskId: task.id,
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

function handleTaskFailure(orchestrator, taskId, errorMessage) {
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

function handleContextExhaustion(orchestrator, taskId) {
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

function handleRetry(orchestrator, taskId, errorMessage) {
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

module.exports = {
  cleanupTaskRuntime,
  cleanupTaskWorktree,
  dispatchTask,
  handleContextExhaustion,
  handleRetry,
  handleTaskExit,
  handleTaskFailure,
  handleTaskOutput,
  handleTaskSuccess,
  resetIdleTimer,
  saveTaskOutput,
  withRepoLock,
};
