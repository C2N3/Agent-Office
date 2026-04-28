import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { normalizeProvider } from '../providers/registry';
import type { TaskDefinition } from './types';

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'task-queue.json');

export class TaskStore {
  declare debugLog: (message: string) => void;
  declare tasks: Map<string, TaskDefinition>;

  constructor(debugLog) {
    this.debugLog = debugLog || (() => {});
    this.tasks = new Map();
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.tasks)) {
        for (const task of parsed.tasks) {
          this.tasks.set(task.id, task);
        }
        this.debugLog(`[TaskStore] Loaded ${this.tasks.size} task(s)`);
      }
    } catch (e) {
      this.debugLog(`[TaskStore] Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(PERSIST_DIR)) {
        fs.mkdirSync(PERSIST_DIR, { recursive: true });
      }
      const data = {
        version: 1,
        tasks: Array.from(this.tasks.values()),
      };
      const tmpPath = PERSIST_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, PERSIST_FILE);
    } catch (e) {
      this.debugLog(`[TaskStore] Save error: ${e.message}`);
    }
  }

  createTask(input) {
    const provider = normalizeProvider(input.provider, input.provider ? null : undefined);
    if (!provider) {
      throw new Error(`Unknown CLI provider: ${input.provider}`);
    }

    const task: TaskDefinition = {
      id: crypto.randomUUID(),
      title: input.title || 'Untitled Task',
      prompt: input.prompt || '',
      provider: provider as TaskDefinition['provider'],
      fallbackProviders: input.fallbackProviders || [],
      executionEnvironment: input.executionEnvironment || 'auto',
      model: input.model || null,
      maxTurns: input.maxTurns || 30,

      parentTaskId: input.parentTaskId || null,
      childTaskIds: input.childTaskIds || [],
      dependsOn: input.dependsOn || [],

      repositoryPath: input.repositoryPath || '',
      branchName: input.branchName || null,
      baseBranch: input.baseBranch || null,
      workspaceParent: input.workspaceParent || null,
      copyPaths: input.copyPaths || [],
      symlinkPaths: input.symlinkPaths || [],
      bootstrapCommand: input.bootstrapCommand || '',

      agentRegistryId: input.agentRegistryId || null,
      priority: input.priority || 'normal',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      completedAt: null,

      status: input.dependsOn && input.dependsOn.length > 0 ? 'pending' : 'ready',
      currentProvider: null,
      attempt: 0,
      maxAttempts: (input.fallbackProviders || []).length + 1,
      terminalId: null,
      workspacePath: null,
      exitCode: null,
      errorMessage: null,
      lastOutput: null,
      outputPath: null,

      autoMergeOnSuccess: input.autoMergeOnSuccess ?? false,
      deleteBranchOnMerge: input.deleteBranchOnMerge ?? true,
    };

    this.tasks.set(task.id, task);
    this._save();
    this.debugLog(`[TaskStore] Created task: ${task.id} "${task.title}"`);
    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  updateTask(taskId, fields) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updated = { ...task, ...fields, updatedAt: Date.now() };
    this.tasks.set(taskId, updated);
    this._save();
    return updated;
  }

  deleteTask(taskId) {
    const deleted = this.tasks.delete(taskId);
    if (deleted) this._save();
    return deleted;
  }

  getReadyTasks() {
    return this.getAllTasks()
      .filter((t) => t.status === 'ready')
      .sort((a, b) => {
        const order = { critical: 0, high: 1, normal: 2, low: 3 };
        return (order[a.priority] || 2) - (order[b.priority] || 2);
      });
  }

  getPendingTasks() {
    return this.getAllTasks().filter((t) => t.status === 'pending');
  }

  getRunningTasks() {
    return this.getAllTasks().filter((t) => t.status === 'running');
  }

  getTasksByStatus(status) {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  getChildTasks(parentTaskId) {
    return this.getAllTasks().filter((t) => t.parentTaskId === parentTaskId);
  }

  getDependentTasks(taskId) {
    return this.getAllTasks().filter((t) => t.dependsOn.includes(taskId));
  }
}
