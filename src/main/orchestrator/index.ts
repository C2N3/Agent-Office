// @ts-nocheck
const EventEmitter = require('events');
const { transitionTask } = require('./taskStateMachine');
const {
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
} = require('./runtime');

const TICK_INTERVAL_MS = 2000;
const MAX_CONCURRENT_TASKS = 5;
const MAX_CONCURRENT_TEAM_TASKS = 5; // Separate pool for team subtasks

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
    this.teamCoordinator = null; // Set after TeamCoordinator is created
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
    const allRunning = this.taskStore.getRunningTasks()
      .concat(this.taskStore.getTasksByStatus('provisioning'));

    // Split into team vs regular tasks using separate concurrency pools
    const teamRunning = allRunning.filter(t => t.parentTaskId).length;
    const regularRunning = allRunning.filter(t => !t.parentTaskId).length;

    const ready = this.taskStore.getReadyTasks();
    const teamReady = ready.filter(t => t.parentTaskId);
    const regularReady = ready.filter(t => !t.parentTaskId);

    const dispatchBatch = [];

    // Regular tasks: own pool
    const regularAvailable = this.maxConcurrentTasks - regularRunning;
    if (regularAvailable > 0) {
      dispatchBatch.push(...regularReady.slice(0, regularAvailable));
    }

    // Team tasks: separate pool
    const teamAvailable = MAX_CONCURRENT_TEAM_TASKS - teamRunning;
    if (teamAvailable > 0) {
      dispatchBatch.push(...teamReady.slice(0, teamAvailable));
    }

    for (const task of dispatchBatch) {
      this._dispatchTask(task).catch((e) => {
        this.debugLog(`[Orchestrator] Dispatch error for ${task.id}: ${e.message}`);
        this.taskStore.updateTask(task.id, {
          status: 'failed',
          errorMessage: e.message,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Restore agent state so a failed dispatch doesn't leave the agent stuck in "Working".
        // Without this, the agent stays in Working and never accepts another task until restart.
        const failedTask = this.taskStore.getTask(task.id);
        const registryId = failedTask?.agentRegistryId;
        if (registryId && this.agentManager) {
          try {
            const existingAgent = this.agentRegistry?.getAgent?.(registryId);
            this.agentManager.updateAgent({
              registryId,
              displayName: existingAgent?.name,
              role: existingAgent?.role,
              state: 'Error',
              lastError: e.message,
            }, 'orchestrator');
          } catch (agentErr) {
            this.debugLog(`[Orchestrator] Agent state restore failed for ${task.id}: ${agentErr.message}`);
          }
        }

        this.emit('task:failed', failedTask);
        this.emit('task:updated', failedTask);
      });
    }
  }

  async _dispatchTask(task) {
    return dispatchTask(this, task);
  }

  _handleTaskOutput(taskId, data, outputParser) {
    return handleTaskOutput(this, taskId, data, outputParser);
  }

  _resetIdleTimer(taskId) {
    return resetIdleTimer(this, taskId);
  }

  _handleTaskExit(taskId, exitCode) {
    return handleTaskExit(this, taskId, exitCode);
  }

  _handleTaskSuccess(taskId) {
    return handleTaskSuccess(this, taskId);
  }

  _handleTaskFailure(taskId, errorMessage) {
    return handleTaskFailure(this, taskId, errorMessage);
  }

  _handleContextExhaustion(taskId) {
    return handleContextExhaustion(this, taskId);
  }

  _handleRetry(taskId, errorMessage) {
    return handleRetry(this, taskId, errorMessage);
  }

  // === Output Capture ===

  _saveTaskOutput(taskId) {
    return saveTaskOutput(this, taskId);
  }

  // === Cleanup ===

  _cleanupTaskRuntime(taskId) {
    return cleanupTaskRuntime(this, taskId);
  }

  /**
   * Remove the git worktree and branch created for a task.
   * Kills the terminal process first, then retries removal on Windows
   * where file handles may linger after process exit.
   */
  _cleanupTaskWorktree(taskId) {
    return cleanupTaskWorktree(this, taskId);
  }

  // === Repo Lock ===

  async _withRepoLock(repoPath, fn) {
    return withRepoLock(this, repoPath, fn);
  }
}

module.exports = { Orchestrator };
