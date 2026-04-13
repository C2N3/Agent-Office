const { createCLIAdapter } = require('./cliAdapter');
const { OutputParser } = require('./outputParser');
const { isTerminalStatus } = require('./taskStateMachine');
const { cleanupTaskRuntime, cleanupTaskWorktree, withRepoLock } = require('./cleanup');
const { saveTaskOutput } = require('./output');
const {
  handleContextExhaustion,
  handleRetry,
  handleTaskFailure,
  handleTaskSuccess,
} = require('./completion');

const STDIN_READY_TIMEOUT_MS = 8000;
const STDIN_POST_READY_MS = 400;
const IDLE_EXIT_MS = 30000;
const TEAM_IDLE_EXIT_MS = 120000; // 2 minutes for team subtasks (complex work needs longer thinking)
const IDLE_ARM_BYTES = 500;
const CLAUDE_READY_MARKER = /[❯⏵]|bypass permissions/;

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
    // Wait for Windows to release process handles after kill
    if (process.platform === 'win32') {
      await new Promise(r => setTimeout(r, 1000));
    }
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

  // Fast exit: if we already sent the prompt (substantial output) and
  // the TUI shows the ready marker again, Claude has finished responding.
  // Send /exit immediately instead of waiting for the idle timeout.
  if (newBytes >= 2000 && CLAUDE_READY_MARKER.test(data)) {
    if (!orchestrator._exitSent?.has(taskId)) {
      const t = orchestrator.taskStore.getTask(taskId);
      if (t && t.status === 'running' && t.terminalId && orchestrator.terminalManager.hasTerminal(t.terminalId)) {
        orchestrator.debugLog(`[Orchestrator] Ready marker detected after response, sending /exit: ${taskId.slice(0, 8)}`);
        orchestrator.terminalManager.writeToTerminal(t.terminalId, '/exit\r');
        if (!orchestrator._exitSent) orchestrator._exitSent = new Set();
        orchestrator._exitSent.add(taskId);
        return;
      }
    }
  }

  if (newBytes >= IDLE_ARM_BYTES) {
    resetIdleTimer(orchestrator, taskId);
  }
}

function resetIdleTimer(orchestrator, taskId) {
  if (orchestrator._exitSent?.has(taskId)) return;

  const existing = orchestrator.idleTimers.get(taskId);
  if (existing) clearTimeout(existing);

  // Use longer timeout for team tasks (subtasks involve complex analysis)
  const task = orchestrator.taskStore.getTask(taskId);
  const isTeamTask = task && task.parentTaskId;
  const timeout = isTeamTask ? TEAM_IDLE_EXIT_MS : IDLE_EXIT_MS;

  const timer = setTimeout(() => {
    orchestrator.idleTimers.delete(taskId);
    const t = orchestrator.taskStore.getTask(taskId);
    if (!t || t.status !== 'running') return;
    if (t.terminalId && orchestrator.terminalManager.hasTerminal(t.terminalId)) {
      orchestrator.debugLog(`[Orchestrator] Idle timeout for ${taskId.slice(0, 8)}, sending /exit`);
      orchestrator.terminalManager.writeToTerminal(t.terminalId, '/exit\r');
      if (!orchestrator._exitSent) orchestrator._exitSent = new Set();
      orchestrator._exitSent.add(taskId);
    }
  }, timeout);

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
