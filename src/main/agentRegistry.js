/**
 * Agent Registry
 * Persistent role-based agent management.
 * Agents survive sessions and auto-reconnect when matching sessions start.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'agent-registry.json');

function normalizePath(p) {
  if (!p) return '';
  let norm = path.resolve(p);
  if (process.platform === 'win32') {
    norm = norm.replace(/\\/g, '/').toLowerCase();
  }
  return norm.replace(/\/+$/, '');
}

class AgentRegistry {
  constructor(debugLog) {
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
        for (const agent of list) {
          if (agent && agent.id) {
            this.agents.set(agent.id, agent);
          }
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

  createAgent({ name, role, projectPath, avatarIndex, provider, model }) {
    const id = crypto.randomUUID();
    const agent = {
      id,
      name: (name || 'Agent').trim(),
      role: (role || '').trim(),
      projectPath: projectPath || '',
      avatarIndex: avatarIndex != null ? avatarIndex : 0,
      enabled: true,
      createdAt: Date.now(),
      lastActiveAt: null,
      archived: false,
      cumulativeTokens: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, sessionCount: 0 },
      currentSessionId: null,
      provider: provider || null,
      model: model || null,
    };
    this.agents.set(id, agent);
    this._save();
    this.debugLog(`[Registry] Created: ${id.slice(0, 8)} "${agent.name}" path=${agent.projectPath}`);
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

  updateAgent(registryId, fields) {
    const agent = this.agents.get(registryId);
    if (!agent) return null;

    const allowed = ['name', 'role', 'projectPath', 'avatarIndex', 'provider', 'model'];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        agent[key] = fields[key];
      }
    }
    this.agents.set(registryId, agent);
    this._save();
    this.debugLog(`[Registry] Updated: ${registryId.slice(0, 8)}`);
    return agent;
  }

  archiveAgent(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return false;
    agent.archived = true;
    agent.enabled = false;
    agent.currentSessionId = null;
    this._save();
    this.debugLog(`[Registry] Archived: ${registryId.slice(0, 8)}`);
    return true;
  }

  deleteAgent(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return false;
    this.agents.delete(registryId);
    this._save();
    this.debugLog(`[Registry] Deleted: ${registryId.slice(0, 8)}`);
    return true;
  }

  /**
   * Find a registered agent by project path.
   * Skips disabled, archived, or agents with an active session.
   */
  findByProjectPath(rawPath) {
    if (!rawPath) return null;
    const normalized = normalizePath(rawPath);
    for (const agent of this.agents.values()) {
      if (!agent.enabled || agent.archived) continue;
      if (agent.currentSessionId) continue; // Already linked to a session
      if (normalizePath(agent.projectPath) === normalized) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Find registered agent by path, including those with active sessions.
   * Used for lookups that don't need to link.
   */
  findAnyByProjectPath(rawPath) {
    if (!rawPath) return null;
    const normalized = normalizePath(rawPath);
    for (const agent of this.agents.values()) {
      if (agent.archived) continue;
      if (normalizePath(agent.projectPath) === normalized) {
        return agent;
      }
    }
    return null;
  }

  linkSession(registryId, sessionId) {
    const agent = this.agents.get(registryId);
    if (!agent) return;
    agent.currentSessionId = sessionId;
    agent.lastActiveAt = Date.now();
    this._save();
    this.debugLog(`[Registry] Linked session: ${registryId.slice(0, 8)} ← ${sessionId.slice(0, 8)}`);
  }

  unlinkSession(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return;
    agent.currentSessionId = null;
    agent.lastActiveAt = Date.now();
    this._save();
    this.debugLog(`[Registry] Unlinked session: ${registryId.slice(0, 8)}`);
  }

  accumulateTokens(registryId, sessionTokenUsage) {
    const agent = this.agents.get(registryId);
    if (!agent || !sessionTokenUsage) return;
    const cum = agent.cumulativeTokens;
    cum.inputTokens += sessionTokenUsage.inputTokens || 0;
    cum.outputTokens += sessionTokenUsage.outputTokens || 0;
    cum.estimatedCost += sessionTokenUsage.estimatedCost || 0;
    cum.sessionCount += 1;
    this._save();
  }

  setEnabled(registryId, enabled) {
    const agent = this.agents.get(registryId);
    if (!agent) return;
    agent.enabled = !!enabled;
    if (!enabled) {
      agent.currentSessionId = null;
    }
    this._save();
    this.debugLog(`[Registry] ${enabled ? 'Enabled' : 'Disabled'}: ${registryId.slice(0, 8)}`);
  }
}

module.exports = { AgentRegistry, normalizePath };
