import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import EventEmitter from 'events';
import { sanitizeProjectPath } from '../../utils';
import {
  normalizePath,
  sanitizeWorkspace,
  buildSessionHistoryEntry,
  linkAgentSession,
  unlinkAgentSession,
  updateAgentTranscriptPath,
  replaceAgentSessionId,
  getAgentSessionHistory,
  findAgentSessionHistoryEntry,
  findAgentByProjectPath,
} from './shared';
import type { PersistentAgent } from './types';

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'agent-registry.json');

export class AgentRegistry extends EventEmitter {
  declare debugLog: (message: string) => void;
  declare agents: Map<string, PersistentAgent>;

  constructor(debugLog) {
    super();
    this.debugLog = debugLog || (() => {});
    /** @type {Map<string, object>} registryId → PersistentAgent */
    this.agents = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(PERSIST_FILE)) {
        const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const list = Array.isArray(data) ? data : (data.agents || []);
        let needsSave = false;
        for (const agent of list) {
          if (agent && agent.id) {
            const sanitizedProjectPath = sanitizeProjectPath(agent.projectPath);
            if ((agent.projectPath || '') !== sanitizedProjectPath) {
              agent.projectPath = sanitizedProjectPath;
              needsSave = true;
            }
            if (agent.archived && !agent.archivedAt) {
              agent.archivedAt = agent.lastActiveAt || agent.createdAt || Date.now();
              needsSave = true;
            }
            const sanitizedWorkspace = sanitizeWorkspace(agent.workspace, sanitizedProjectPath);
            const currentWorkspace = agent.workspace || null;
            if (JSON.stringify(currentWorkspace) !== JSON.stringify(sanitizedWorkspace)) {
              agent.workspace = sanitizedWorkspace;
              needsSave = true;
            }
            const normalizedCurrentRuntimeSessionId = agent.currentRuntimeSessionId || agent.currentSessionId || null;
            if (agent.currentRuntimeSessionId !== normalizedCurrentRuntimeSessionId) {
              agent.currentRuntimeSessionId = normalizedCurrentRuntimeSessionId;
              needsSave = true;
            }
            const normalizedCurrentResumeSessionId = agent.currentResumeSessionId || agent.currentSessionId || null;
            if (agent.currentResumeSessionId !== normalizedCurrentResumeSessionId) {
              agent.currentResumeSessionId = normalizedCurrentResumeSessionId;
              needsSave = true;
            }
            const normalizedHistory = Array.isArray(agent.sessionHistory)
              ? agent.sessionHistory.map((entry) => buildSessionHistoryEntry(entry))
              : [];
            if (JSON.stringify(agent.sessionHistory || []) !== JSON.stringify(normalizedHistory)) {
              agent.sessionHistory = normalizedHistory;
              needsSave = true;
            }
            this.agents.set(agent.id, agent);
          }
        }
        if (needsSave) {
          this._save();
        }
        this.debugLog(`[Registry] Loaded ${this.agents.size} agent(s)`);
      }
    } catch (e) {
      this.debugLog(`[Registry] Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(PERSIST_DIR)) {
        fs.mkdirSync(PERSIST_DIR, { recursive: true });
      }
      const list = Array.from(this.agents.values());
      const tmpPath = PERSIST_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), 'utf-8');
      fs.renameSync(tmpPath, PERSIST_FILE);
    } catch (e) {
      this.debugLog(`[Registry] Save error: ${e.message}`);
    }
  }

  createAgent({ name, role, projectPath, avatarIndex, provider, model, workspace }) {
    const sanitizedProjectPath = sanitizeProjectPath(projectPath);
    const id = crypto.randomUUID();
    const agent = {
      id,
      name: (name || 'Agent').trim(),
      role: (role || '').trim(),
      projectPath: sanitizedProjectPath,
      avatarIndex: avatarIndex != null ? avatarIndex : 0,
      enabled: true,
      createdAt: Date.now(),
      lastActiveAt: null,
      archived: false,
      archivedAt: null,
      currentSessionId: null,
      currentRuntimeSessionId: null,
      currentResumeSessionId: null,
      sessionHistory: [],
      provider: provider || null,
      model: model || null,
      workspace: sanitizeWorkspace(workspace, sanitizedProjectPath),
    };
    this.agents.set(id, agent);
    this._save();
    this.debugLog(`[Registry] Created: ${id.slice(0, 8)} "${agent.name}" path=${agent.projectPath}`);
    this.emit('agent-created', agent);
    return agent;
  }

  getAgent(registryId) {
    return this.agents.get(registryId) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getActiveAgents() {
    return this.getAllAgents().filter(a => a.enabled && !a.archived);
  }

  findActiveAgentsByRepository(rawRepositoryPath, resolveRepositoryPath) {
    if (!rawRepositoryPath || typeof resolveRepositoryPath !== 'function') return [];
    const normalizedRepositoryPath = normalizePath(rawRepositoryPath);
    if (!normalizedRepositoryPath) return [];

    return this.getActiveAgents().filter((agent) => {
      const basePath = agent.workspace?.repositoryPath || agent.projectPath;
      if (!basePath) return false;

      let candidateRepositoryPath = agent.workspace?.repositoryPath || null;
      if (!candidateRepositoryPath) {
        try {
          candidateRepositoryPath = resolveRepositoryPath(basePath);
        } catch {
          candidateRepositoryPath = basePath;
        }
      }

      return normalizePath(candidateRepositoryPath) === normalizedRepositoryPath;
    });
  }

  updateAgent(registryId, fields) {
    const agent = this.agents.get(registryId);
    if (!agent) return null;

    const allowed = ['name', 'role', 'projectPath', 'avatarIndex', 'provider', 'model'];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        agent[key] = key === 'projectPath'
          ? sanitizeProjectPath(fields[key])
          : fields[key];
      }
    }
    if (fields.workspace !== undefined) {
      const previousWorktreePath = normalizePath(agent.workspace?.worktreePath);
      const nextWorkspace = sanitizeWorkspace(fields.workspace, agent.projectPath);
      const nextWorktreePath = normalizePath(nextWorkspace?.worktreePath);
      agent.workspace = nextWorkspace;

      if (previousWorktreePath && nextWorktreePath && previousWorktreePath !== nextWorktreePath) {
        agent.currentSessionId = null;
        agent.currentRuntimeSessionId = null;
        agent.currentResumeSessionId = null;
        this.debugLog(`[Registry] Workspace moved: cleared current session for ${registryId.slice(0, 8)}`);
      }
    }
    this.agents.set(registryId, agent);
    this._save();
    this.debugLog(`[Registry] Updated: ${registryId.slice(0, 8)}`);
    this.emit('agent-updated', agent);
    return agent;
  }

  archiveAgent(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return false;
    agent.archived = true;
    agent.archivedAt = Date.now();
    agent.enabled = false;
    agent.currentSessionId = null;
    agent.currentRuntimeSessionId = null;
    agent.currentResumeSessionId = null;
    this._save();
    this.debugLog(`[Registry] Archived: ${registryId.slice(0, 8)}`);
    this.emit('agent-archived', agent);
    return true;
  }

  deleteAgent(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return false;
    this.agents.delete(registryId);
    this._save();
    this.debugLog(`[Registry] Deleted: ${registryId.slice(0, 8)}`);
    this.emit('agent-deleted', agent);
    return true;
  }

  findByProjectPath(rawPath) {
    return findAgentByProjectPath(this.agents.values(), rawPath, {
      includeArchived: false,
      requireEnabled: true,
      requireIdle: true,
    });
  }

  findAnyByProjectPath(rawPath) {
    return findAgentByProjectPath(this.agents.values(), rawPath, {
      includeArchived: false,
      requireEnabled: false,
      requireIdle: false,
    });
  }

  linkSession(registryId, sessionId, transcriptPath, options = {}) {
    const agent = this.agents.get(registryId);
    linkAgentSession(this, agent, registryId, sessionId, transcriptPath, options);
  }

  unlinkSession(registryId) {
    const agent = this.agents.get(registryId);
    unlinkAgentSession(this, agent, registryId);
  }

  /**
   * Update transcriptPath for a session in history (may arrive after linkSession)
   */
  updateSessionTranscriptPath(registryId, sessionId, transcriptPath) {
    const agent = this.agents.get(registryId);
    updateAgentTranscriptPath(this, agent, sessionId, transcriptPath);
  }

  replaceSessionId(registryId, previousSessionId, nextSessionId, transcriptPath = null, options = {}) {
    const agent = this.agents.get(registryId);
    return replaceAgentSessionId(this, agent, registryId, previousSessionId, nextSessionId, transcriptPath, options);
  }

  /**
   * Get session history for a registered agent
   */
  getSessionHistory(registryId) {
    const agent = this.agents.get(registryId);
    return getAgentSessionHistory(agent);
  }

  findSessionHistoryEntry(registryId, sessionId) {
    const agent = this.agents.get(registryId);
    return findAgentSessionHistoryEntry(agent, sessionId);
  }

  getArchivedAgents() {
    return this.getAllAgents()
      .filter((agent) => agent.archived)
      .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  }

  getArchivedWorkspaceAgents() {
    return this.getArchivedAgents()
      .filter((agent) => agent.workspace);
  }

  setEnabled(registryId, enabled) {
    const agent = this.agents.get(registryId);
    if (!agent) return;
    agent.enabled = !!enabled;
    if (!enabled) {
      agent.currentSessionId = null;
      agent.currentRuntimeSessionId = null;
      agent.currentResumeSessionId = null;
    }
    this._save();
    this.debugLog(`[Registry] ${enabled ? 'Enabled' : 'Disabled'}: ${registryId.slice(0, 8)}`);
    this.emit('agent-enabled-changed', agent);
  }
}

export { normalizePath };
