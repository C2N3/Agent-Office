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
const { sharedSessionAllowlist } = require('./sessionAllowlist');

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

  const resolvedBaseBranch = workspaceMetadata?.baseBranch || task.baseBranch || null;
  orchestrator.taskStore.updateTask(task.id, {
    workspacePath,
    currentProvider: provider,
    ...(resolvedBaseBranch ? { baseBranch: resolvedBaseBranch } : {}),
  });

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

  // Spawn headless process via processManager (no PTY/ConPTY)
  const taskCwd = workspacePath || task.repositoryPath;
  const { pid, stdout, stderr, stdin, exitPromise } = await orchestrator.processManager.spawn(
    task.id,
    {
      command: spawnConfig.command,
      args: spawnConfig.args,
      cwd: taskCwd,
      env: spawnConfig.env,
      executionEnvironment: task.executionEnvironment || 'auto',
    },
  );

  // Register with the session allowlist so provider gates (hook server,
  // codex session monitor, liveness) only accept events from this task.
  sharedSessionAllowlist.register({
    taskId: task.id,
    pid,
    cwd: taskCwd,
    provider,
  });

  // Deliver prompt via stdin pipe immediately (no TUI ready-marker detection needed)
  if (adapter.buildStdinPrompt) {
    stdin.write(adapter.buildStdinPrompt(task.prompt));
  }
  stdin.end();

  // Set up output parsing with the correct format
  const outputParser = new OutputParser(adapter, spawnConfig.outputFormat);
  orchestrator.outputParsers.set(task.id, outputParser);

  // Stream stdout
  stdout.setEncoding('utf8');
  stdout.on('data', (chunk) => {
    const events = outputParser.feedStdout(chunk);
    handleTaskOutput(orchestrator, task.id, events, outputParser);
    // Broadcast parsed events to dashboard with type info for chat UI
    if (orchestrator.broadcastTaskOutput) {
      for (const evt of events) {
        if (evt.message) {
          orchestrator.broadcastTaskOutput(task.id, JSON.stringify({
            text: evt.message,
            type: evt.type || 'text',
            toolName: evt.toolName || null,
            merge: evt.merge !== false,
          }), 'stdout');
        }
      }
    }
  });

  // Stream stderr
  stderr.setEncoding('utf8');
  stderr.on('data', (chunk) => {
    const stderrEvents = outputParser.feedStderr(chunk);
    // Broadcast parsed stderr to dashboard
    if (orchestrator.broadcastTaskOutput) {
      for (const evt of stderrEvents) {
        if (evt.message) {
          orchestrator.broadcastTaskOutput(task.id, evt.message, 'stderr');
        }
      }
    }
  });

  // Handle exit via exitPromise (replaces terminalManager.tapExit)
  exitPromise.then((exitCode) => {
    handleTaskExit(orchestrator, task.id, exitCode);
  });

  orchestrator.taskStore.updateTask(task.id, {
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  orchestrator.emit('task:running', orchestrator.taskStore.getTask(task.id));
  orchestrator.emit('task:updated', orchestrator.taskStore.getTask(task.id));
  orchestrator.debugLog(`[Orchestrator] Task running: ${task.id} provider=${provider} pid=${pid}`);
}

function handleTaskOutput(orchestrator, taskId, events, outputParser) {
  const task = orchestrator.taskStore.getTask(taskId);
  if (!task || task.status !== 'running') return;

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
}

// No-op kept for backward compatibility with any external callers; idle-based
// auto-exit was removed in favor of provider completion events.
function resetIdleTimer(_orchestrator, _taskId) {}

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
