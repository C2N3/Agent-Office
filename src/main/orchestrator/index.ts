// @ts-nocheck
const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { canTransition, transitionTask, isTerminalStatus } = require('./taskStateMachine');
const { createCLIAdapter } = require('./cliAdapter');
const { OutputParser } = require('./outputParser');
const { detectContextExhaustion } = require('./contextDetector');

const TASK_OUTPUT_DIR = path.join(os.homedir(), '.agent-office', 'task-output');

const TICK_INTERVAL_MS = 2000;
const STDIN_DELAY_MS = 500;
const MAX_CONCURRENT_TASKS = 5;
const IDLE_EXIT_MS = 30000; // Send /exit after 30s of no output (interactive mode)
const IDLE_ARM_BYTES = 500; // Only arm idle timer after receiving this many bytes of output

class Orchestrator extends EventEmitter {
  constructor(options) {
    super();
    this.taskStore = options.taskStore;
    this.terminalManager = options.terminalManager;
    this.workspaceManager = options.workspaceManager;
    this.agentRegistry = options.agentRegistry;
    this.agentManager = options.agentManager;
    this.debugLog = options.debugLog || (() => {});
    this.maxConcurrentTasks = options.maxConcurrentTasks || MAX_CONCURRENT_TASKS;

    // Runtime maps
    this.outputParsers = new Map();   // taskId -> OutputParser
    this.cleanupFns = new Map();      // taskId -> [cleanup functions]
    this.repoLocks = new Map();       // repoPath -> Promise
    this.idleTimers = new Map();      // taskId -> setTimeout id
    this.taskOutputBytes = new Map(); // taskId -> total bytes received

    this.tickInterval = null;
  }

  // === Lifecycle ===

  start() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.debugLog('[Orchestrator] Started');
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    // Clean up all output taps
    for (const [taskId, fns] of this.cleanupFns) {
      for (const fn of fns) {
        try { fn(); } catch {}
      }
    }
    this.cleanupFns.clear();
    this.outputParsers.clear();
    this.debugLog('[Orchestrator] Stopped');
  }

  // === Task Management API ===

  submitTask(input) {
    const task = this.taskStore.createTask(input);

    // Wire parent-child relationship
    if (task.parentTaskId) {
      const parent = this.taskStore.getTask(task.parentTaskId);
      if (parent && !parent.childTaskIds.includes(task.id)) {
        this.taskStore.updateTask(task.parentTaskId, {
          childTaskIds: [...parent.childTaskIds, task.id],
        });
      }
    }

    this.emit('task:created', task);
    this.emit('task:updated', task);
    this.debugLog(`[Orchestrator] Task submitted: ${task.id} "${task.title}"`);
    return task;
  }

  cancelTask(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (task.status === 'running' || task.status === 'provisioning') {
      this._cleanupTaskRuntime(taskId);
    }

    const updated = transitionTask(task, 'cancelled');
    this.taskStore.updateTask(taskId, updated);

    // Clear session, restore projectPath, and clean up worktree
    if (task.agentRegistryId) {
      this.agentRegistry.unlinkSession(task.agentRegistryId);
      const regAgent = this.agentRegistry.getAgent(task.agentRegistryId);
      const originalPath = regAgent?.workspace?.repositoryPath || task.repositoryPath;
      this.agentRegistry.updateAgent(task.agentRegistryId, { projectPath: originalPath, workspace: null });
      this.agentManager.updateAgent({
        registryId: task.agentRegistryId,
        state: 'Offline',
        projectPath: originalPath,
        workspace: null,
      }, 'orchestrator');
    }
    this._cleanupTaskWorktree(taskId);

    this.emit('task:cancelled', updated);
    this.emit('task:updated', updated);
    return updated;
  }

  retryTask(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const updated = transitionTask(task, 'ready', {
      attempt: 0,
      currentProvider: null,
      exitCode: null,
      errorMessage: null,
      lastOutput: null,
      completedAt: null,
    });
    this.taskStore.updateTask(taskId, updated);
    this.emit('task:updated', updated);
    return updated;
  }

  pauseTask(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const updated = transitionTask(task, 'paused');
    this.taskStore.updateTask(taskId, updated);
    this.emit('task:updated', updated);
    return updated;
  }

  resumeTask(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const updated = transitionTask(task, 'running');
    this.taskStore.updateTask(taskId, updated);
    this.emit('task:updated', updated);
    return updated;
  }

  getTask(taskId) {
    return this.taskStore.getTask(taskId);
  }

  getAllTasks() {
    return this.taskStore.getAllTasks();
  }

  getTasksByStatus(status) {
    return this.taskStore.getTasksByStatus(status);
  }

  deleteTask(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status === 'running' || task.status === 'provisioning') {
      this._cleanupTaskRuntime(taskId);
    }
    return this.taskStore.deleteTask(taskId);
  }

  // === Internal Tick Loop ===

  tick() {
    try {
      this._resolveDependencies();
      this._dispatchReadyTasks();
    } catch (e) {
      this.debugLog(`[Orchestrator] Tick error: ${e.message}`);
    }
  }

  _resolveDependencies() {
    const pending = this.taskStore.getPendingTasks();
    for (const task of pending) {
      if (!task.dependsOn || task.dependsOn.length === 0) {
        this.taskStore.updateTask(task.id, { status: 'ready', updatedAt: Date.now() });
        this.emit('task:ready', this.taskStore.getTask(task.id));
        continue;
      }

      const allDepsSucceeded = task.dependsOn.every((depId) => {
        const dep = this.taskStore.getTask(depId);
        return dep && dep.status === 'succeeded';
      });

      if (allDepsSucceeded) {
        this.taskStore.updateTask(task.id, { status: 'ready', updatedAt: Date.now() });
        this.emit('task:ready', this.taskStore.getTask(task.id));
      }
    }
  }

  _dispatchReadyTasks() {
    const runningCount = this.taskStore.getRunningTasks().length
      + this.taskStore.getTasksByStatus('provisioning').length;
    const available = this.maxConcurrentTasks - runningCount;
    if (available <= 0) return;

    const ready = this.taskStore.getReadyTasks().slice(0, available);
    for (const task of ready) {
      this._dispatchTask(task).catch((e) => {
        this.debugLog(`[Orchestrator] Dispatch error for ${task.id}: ${e.message}`);
        this.taskStore.updateTask(task.id, {
          status: 'failed',
          errorMessage: e.message,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
        this.emit('task:failed', this.taskStore.getTask(task.id));
        this.emit('task:updated', this.taskStore.getTask(task.id));
      });
    }
  }

  async _dispatchTask(task) {
    // Transition to provisioning
    this.taskStore.updateTask(task.id, { status: 'provisioning', updatedAt: Date.now() });
    this.emit('task:updated', this.taskStore.getTask(task.id));

    // Determine CLI adapter
    const provider = task.currentProvider || task.provider;
    const adapter = createCLIAdapter(provider);

    // Create worktree (if not already created from previous attempt)
    let workspacePath = task.workspacePath;
    let workspaceMetadata = null;
    if (!workspacePath && task.repositoryPath) {
      const branchName = task.branchName || `task/${task.id.slice(0, 8)}`;
      await this._withRepoLock(task.repositoryPath, async () => {
        const result = this.workspaceManager.createWorkspace({
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

        // If dependent on parent, squash-merge parent branch
        if (task.parentTaskId) {
          const parent = this.taskStore.getTask(task.parentTaskId);
          if (parent && parent.workspacePath) {
            try {
              const parentBranch = parent.branchName || `task/${parent.id.slice(0, 8)}`;
              this.workspaceManager.runGit(workspacePath, ['merge', '--squash', parentBranch]);
              this.workspaceManager.runGit(workspacePath, ['commit', '-m', `Inherit changes from parent task: ${parent.title}`, '--allow-empty']);
            } catch (e) {
              this.debugLog(`[Orchestrator] Parent merge warning: ${e.message}`);
            }
          }
        }
      });
    }

    this.taskStore.updateTask(task.id, {
      workspacePath,
      currentProvider: provider,
    });

    // Create agent in registry
    let agentRegistryId = task.agentRegistryId;
    if (!agentRegistryId) {
      const agent = this.agentRegistry.createAgent(
        task.title,
        'autonomous',
        workspacePath || task.repositoryPath,
        undefined,
        provider,
        task.model || null,
        null
      );
      agentRegistryId = agent.id;
      this.taskStore.updateTask(task.id, { agentRegistryId });
    }

    // Update agent state — preserve existing name if agent was pre-registered
    const existingAgent = this.agentRegistry.getAgent(agentRegistryId);

    // Attach workspace metadata to the registry agent so Merge/Remove buttons appear
    if (workspaceMetadata && agentRegistryId) {
      this.agentRegistry.updateAgent(agentRegistryId, { workspace: workspaceMetadata });
    }

    this.agentManager.updateAgent({
      registryId: agentRegistryId,
      displayName: existingAgent?.name || task.title,
      role: existingAgent?.role || 'autonomous',
      projectPath: workspacePath || task.repositoryPath,
      provider,
      isRegistered: true,
      state: 'Working',
      workspace: workspaceMetadata || undefined,
    }, 'orchestrator');

    // Build CLI spawn config
    const spawnConfig = adapter.buildSpawnConfig({
      cwd: workspacePath || task.repositoryPath,
      prompt: task.prompt,
      model: task.model || null,
      maxTurns: task.maxTurns,
    });

    // Spawn terminal
    const terminalId = agentRegistryId;
    if (this.terminalManager.hasTerminal(terminalId)) {
      this.terminalManager.destroyTerminal(terminalId);
    }

    const termResult = this.terminalManager.createTerminal(terminalId, {
      cwd: workspacePath || task.repositoryPath,
      command: spawnConfig.command,
      args: spawnConfig.args,
    });

    if (!termResult.success) {
      throw new Error(`Terminal spawn failed: ${termResult.error}`);
    }

    this.taskStore.updateTask(task.id, { terminalId });

    // Set up output parser and taps
    const outputParser = new OutputParser(adapter);
    this.outputParsers.set(task.id, outputParser);

    const cleanups = [];

    const untapOutput = this.terminalManager.tapOutput(terminalId, (data) => {
      this._handleTaskOutput(task.id, data, outputParser);
    });
    cleanups.push(untapOutput);

    const untapExit = this.terminalManager.tapExit(terminalId, (exitCode) => {
      this._handleTaskExit(task.id, exitCode);
    });
    cleanups.push(untapExit);

    this.cleanupFns.set(task.id, cleanups);

    // If stdin delivery, write prompt after short delay
    if (spawnConfig.promptDelivery === 'stdin' && adapter.buildStdinPrompt) {
      setTimeout(() => {
        const stdinData = adapter.buildStdinPrompt(task.prompt);
        this.terminalManager.writeToTerminal(terminalId, stdinData);
      }, STDIN_DELAY_MS);
    }

    // Transition to running
    this.taskStore.updateTask(task.id, {
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.emit('task:running', this.taskStore.getTask(task.id));
    this.emit('task:updated', this.taskStore.getTask(task.id));
    this.debugLog(`[Orchestrator] Task running: ${task.id} provider=${provider}`);
  }

  _handleTaskOutput(taskId, data, outputParser) {
    const task = this.taskStore.getTask(taskId);
    if (!task || task.status !== 'running') return;

    const events = outputParser.feed(data);

    // Update lastOutput
    this.taskStore.updateTask(taskId, {
      lastOutput: outputParser.getRecentOutput(500),
    });

    // Check for context exhaustion
    if (outputParser.isContextExhausted()) {
      this._handleContextExhaustion(taskId);
      return;
    }

    // Process parsed events
    for (const evt of events) {
      if (evt.type === 'context_exhaustion') {
        this._handleContextExhaustion(taskId);
        return;
      }
    }

    // Track total output bytes and arm idle timer only after substantial output.
    // This prevents the timer from firing during Claude's initial API call.
    const prevBytes = this.taskOutputBytes.get(taskId) || 0;
    const newBytes = prevBytes + (data ? data.length : 0);
    this.taskOutputBytes.set(taskId, newBytes);

    if (newBytes >= IDLE_ARM_BYTES) {
      this._resetIdleTimer(taskId);
    }
  }

  _resetIdleTimer(taskId) {
    // If we already sent /exit, stop resetting — avoid spamming /exit repeatedly.
    if (this._exitSent?.has(taskId)) return;

    const existing = this.idleTimers.get(taskId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.idleTimers.delete(taskId);
      const task = this.taskStore.getTask(taskId);
      if (!task || task.status !== 'running') return;
      if (task.terminalId && this.terminalManager.hasTerminal(task.terminalId)) {
        this.debugLog(`[Orchestrator] Idle timeout for ${taskId.slice(0, 8)}, sending /exit`);
        this.terminalManager.writeToTerminal(task.terminalId, '/exit\r');
        if (!this._exitSent) this._exitSent = new Set();
        this._exitSent.add(taskId);
      }
    }, IDLE_EXIT_MS);

    this.idleTimers.set(taskId, timer);
  }

  _handleTaskExit(taskId, exitCode) {
    const task = this.taskStore.getTask(taskId);
    if (!task || isTerminalStatus(task.status)) return;

    // Save full output before cleanup destroys the parser
    this._saveTaskOutput(taskId);

    this._cleanupTaskRuntime(taskId);
    this.taskStore.updateTask(taskId, { exitCode });

    if (exitCode === 0) {
      this._handleTaskSuccess(taskId);
    } else {
      // Check if context exhaustion was the cause
      const parser = this.outputParsers.get(taskId);
      if (parser && parser.isContextExhausted()) {
        this._handleContextExhaustion(taskId);
      } else {
        this._handleTaskFailure(taskId, `CLI exited with code ${exitCode}`);
      }
    }
  }

  _handleTaskSuccess(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task) return;

    this.taskStore.updateTask(taskId, {
      status: 'succeeded',
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Auto-merge if configured
    if (task.autoMergeOnSuccess && task.agentRegistryId) {
      try {
        const regAgent = this.agentRegistry.getAgent(task.agentRegistryId);
        if (regAgent && regAgent.workspace) {
          this.workspaceManager.mergeWorkspace(regAgent.workspace);
          this.debugLog(`[Orchestrator] Auto-merged task ${taskId}`);
        }
      } catch (e) {
        this.debugLog(`[Orchestrator] Auto-merge failed for ${taskId}: ${e.message}`);
      }
    }

    // Transition agent to done with report, clear session, restore original projectPath
    if (task.agentRegistryId) {
      this.agentRegistry.unlinkSession(task.agentRegistryId);
      const regAgent = this.agentRegistry.getAgent(task.agentRegistryId);
      const originalPath = regAgent?.workspace?.repositoryPath || task.repositoryPath;
      this.agentRegistry.updateAgent(task.agentRegistryId, { projectPath: originalPath });
      this.agentManager.updateAgent({
        registryId: task.agentRegistryId,
        state: 'done',
        projectPath: originalPath,
        reportTaskId: task.id,
      }, 'orchestrator');
    }

    // Auto-chain: check dependent tasks
    const allTasks = this.taskStore.getAllTasks();
    for (const candidate of allTasks) {
      if (candidate.status !== 'pending') continue;
      if (!candidate.dependsOn || !candidate.dependsOn.includes(taskId)) continue;

      const allDepsSucceeded = candidate.dependsOn.every((depId) => {
        const dep = this.taskStore.getTask(depId);
        return dep && dep.status === 'succeeded';
      });

      if (allDepsSucceeded) {
        this.taskStore.updateTask(candidate.id, { status: 'ready', updatedAt: Date.now() });
        this.emit('task:ready', this.taskStore.getTask(candidate.id));
      }
    }

    const updated = this.taskStore.getTask(taskId);
    this.emit('task:succeeded', updated);
    this.emit('task:updated', updated);
    this.debugLog(`[Orchestrator] Task succeeded: ${taskId}`);
  }

  _handleTaskFailure(taskId, errorMessage) {
    const task = this.taskStore.getTask(taskId);
    if (!task) return;

    // Check if we can retry with fallback
    if (task.attempt < task.maxAttempts - 1 && task.fallbackProviders.length > 0) {
      this._handleRetry(taskId, errorMessage);
      return;
    }

    this.taskStore.updateTask(taskId, {
      status: 'failed',
      errorMessage,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Clean up worktree on failure — no useful changes to preserve
    this._cleanupTaskWorktree(taskId);

    // Clear session and restore original projectPath
    if (task.agentRegistryId) {
      this.agentRegistry.unlinkSession(task.agentRegistryId);
      const regAgent = this.agentRegistry.getAgent(task.agentRegistryId);
      const originalPath = regAgent?.workspace?.repositoryPath || task.repositoryPath;
      this.agentRegistry.updateAgent(task.agentRegistryId, { projectPath: originalPath, workspace: null });
      this.agentManager.updateAgent({
        registryId: task.agentRegistryId,
        state: 'Offline',
        projectPath: originalPath,
        workspace: null,
      }, 'orchestrator');
    }

    const updated = this.taskStore.getTask(taskId);
    this.emit('task:failed', updated);
    this.emit('task:updated', updated);
    this.debugLog(`[Orchestrator] Task failed: ${taskId} — ${errorMessage}`);
  }

  _handleContextExhaustion(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task || task.status !== 'running') return;

    this._cleanupTaskRuntime(taskId);

    const nextAttempt = task.attempt + 1;
    const nextProvider = task.fallbackProviders[task.attempt] || null;

    if (!nextProvider || nextAttempt >= task.maxAttempts) {
      this._handleTaskFailure(taskId, 'Context exhausted, no fallback available');
      return;
    }

    this.taskStore.updateTask(taskId, {
      status: 'retrying',
      attempt: nextAttempt,
      currentProvider: nextProvider,
      updatedAt: Date.now(),
    });

    const updated = this.taskStore.getTask(taskId);
    this.emit('task:retrying', updated);
    this.emit('task:updated', updated);
    this.debugLog(`[Orchestrator] Context exhausted for ${taskId}, retrying with ${nextProvider}`);

    // Re-dispatch with new provider (reuse worktree)
    this.taskStore.updateTask(taskId, { status: 'ready', updatedAt: Date.now() });
  }

  _handleRetry(taskId, errorMessage) {
    const task = this.taskStore.getTask(taskId);
    if (!task) return;

    const nextAttempt = task.attempt + 1;
    const nextProvider = task.fallbackProviders[task.attempt] || task.provider;

    this.taskStore.updateTask(taskId, {
      status: 'retrying',
      attempt: nextAttempt,
      currentProvider: nextProvider,
      errorMessage,
      updatedAt: Date.now(),
    });

    const updated = this.taskStore.getTask(taskId);
    this.emit('task:retrying', updated);
    this.emit('task:updated', updated);
    this.debugLog(`[Orchestrator] Retrying task ${taskId} (attempt ${nextAttempt}) with ${nextProvider}`);

    // Queue for re-dispatch
    this.taskStore.updateTask(taskId, { status: 'ready', updatedAt: Date.now() });
  }

  // === Output Capture ===

  _saveTaskOutput(taskId) {
    const parser = this.outputParsers.get(taskId);
    if (!parser) return;

    try {
      const fullOutput = parser.getFullOutput();
      if (!fullOutput) return;

      // Strip ANSI escape codes for readable output
      const clean = fullOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

      fs.mkdirSync(TASK_OUTPUT_DIR, { recursive: true });
      const outputPath = path.join(TASK_OUTPUT_DIR, `${taskId}.txt`);
      fs.writeFileSync(outputPath, clean, 'utf-8');
      this.taskStore.updateTask(taskId, { outputPath });
      this.debugLog(`[Orchestrator] Saved task output: ${outputPath}`);
    } catch (e) {
      this.debugLog(`[Orchestrator] Failed to save task output: ${e.message}`);
    }
  }

  // === Cleanup ===

  _cleanupTaskRuntime(taskId) {
    // Clear idle timer and output tracking
    const idleTimer = this.idleTimers.get(taskId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(taskId);
    }
    this.taskOutputBytes.delete(taskId);
    this._exitSent?.delete(taskId);

    // Remove output taps
    const fns = this.cleanupFns.get(taskId);
    if (fns) {
      for (const fn of fns) {
        try { fn(); } catch {}
      }
      this.cleanupFns.delete(taskId);
    }
    this.outputParsers.delete(taskId);

    // Don't destroy the terminal here — let the process exit naturally
    // so the frontend terminal tab can show the full output and exit message.
    // The terminal will be cleaned up when the user closes the tab.
  }

  /**
   * Remove the git worktree and branch created for a task.
   * Kills the terminal process first, then retries removal on Windows
   * where file handles may linger after process exit.
   */
  _cleanupTaskWorktree(taskId) {
    const task = this.taskStore.getTask(taskId);
    if (!task || !task.workspacePath) return;

    // Kill the terminal process first so it releases the worktree directory.
    if (task.terminalId && this.terminalManager.hasTerminal(task.terminalId)) {
      this.terminalManager.destroyTerminal(task.terminalId);
    }

    const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
    let repoRoot;
    try {
      repoRoot = this.workspaceManager.resolveRepositoryRoot(task.repositoryPath);
    } catch (e) {
      this.debugLog(`[Orchestrator] Cannot resolve repo root for ${taskId.slice(0, 8)}: ${e.message}`);
      return;
    }

    const attemptRemove = (attempt) => {
      try {
        this.workspaceManager.runGit(repoRoot, ['worktree', 'remove', '--force', task.workspacePath]);
      } catch (e) {
        if (attempt < 3) {
          this.debugLog(`[Workspace] Remove attempt ${attempt + 1} failed, retrying in ${(attempt + 1) * 3}s...`);
          setTimeout(() => attemptRemove(attempt + 1), (attempt + 1) * 3000);
          return;
        }
        this.debugLog(`[Workspace] Remove failed after ${attempt + 1} attempts: ${e.message}`);
        return;
      }
      try {
        this.workspaceManager.runGit(repoRoot, ['branch', '-D', branchName]);
      } catch {}
      this.debugLog(`[Orchestrator] Cleaned up worktree for ${taskId.slice(0, 8)}`);
    };

    // First attempt after delay to let file handles release
    setTimeout(() => attemptRemove(0), process.platform === 'win32' ? 3000 : 500);
  }

  // === Repo Lock ===

  async _withRepoLock(repoPath, fn) {
    const existing = this.repoLocks.get(repoPath) || Promise.resolve();
    const next = existing.then(fn, fn);
    this.repoLocks.set(repoPath, next);
    await next;
  }
}

module.exports = { Orchestrator };
