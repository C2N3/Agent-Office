// @ts-nocheck
// -nocheck
/**
 * Agent Registry
 * Persistent role-based agent management.
 * Agents survive sessions and auto-reconnect when matching sessions start.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { sanitizeProjectPath } = require('../utils');

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'agent-registry.json');

function convertWslPathToWindowsDrivePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath) return rawPath;

  const normalized = rawPath.replace(/\\/g, '/');
  const directMountMatch = normalized.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/);
  if (directMountMatch) {
    const [, driveLetter, rest = ''] = directMountMatch;
    return `${driveLetter.toUpperCase()}:/${rest}`;
  }

  const uncMountMatch = normalized.match(/^\/\/wsl(?:\.localhost)?\/[^/]+\/mnt\/([a-zA-Z])(?:\/(.*))?$/i);
  if (uncMountMatch) {
    const [, driveLetter, rest = ''] = uncMountMatch;
    return `${driveLetter.toUpperCase()}:/${rest}`;
  }

  return rawPath;
}

function normalizePath(p) {
  const sanitizedPath = sanitizeProjectPath(p);
  if (!sanitizedPath) return '';

  const isWindows = process.platform === 'win32';
  const pathForResolution = isWindows
    ? convertWslPathToWindowsDrivePath(sanitizedPath)
    : sanitizedPath;

  let norm = isWindows
    ? path.win32.resolve(pathForResolution)
    : path.resolve(pathForResolution);
  if (isWindows) {
    norm = norm.replace(/\\/g, '/').toLowerCase();
  }
  return norm.replace(/\/+$/, '');
}

function sanitizePathList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => sanitizeProjectPath(entry))
    .filter(Boolean);
}

function sanitizeWorkspace(workspace, fallbackProjectPath = '') {
  if (!workspace || typeof workspace !== 'object') return null;

  const repositoryPath = sanitizeProjectPath(workspace.repositoryPath);
  const worktreePath = sanitizeProjectPath(workspace.worktreePath || fallbackProjectPath);
  const workspaceParent = sanitizeProjectPath(workspace.workspaceParent);
  const branch = String(workspace.branch || '').trim();
  const startPoint = String(workspace.startPoint || '').trim();
  const baseBranch = String(workspace.baseBranch || '').trim();
  const bootstrapCommand = String(workspace.bootstrapCommand || '').trim();

  if (!repositoryPath && !worktreePath && !branch) {
    return null;
  }

  return {
    type: workspace.type || 'git-worktree',
    repositoryPath,
    repositoryName: String(workspace.repositoryName || (repositoryPath ? path.basename(repositoryPath) : '')).trim(),
    worktreePath,
    workspaceParent,
    branch,
    startPoint,
    baseBranch,
    copyPaths: sanitizePathList(workspace.copyPaths),
    symlinkPaths: sanitizePathList(workspace.symlinkPaths),
    bootstrapCommand,
  };
}

function buildSessionHistoryEntry(entry = {}) {
  const runtimeSessionId = entry.runtimeSessionId || entry.sessionId || null;
  const resumeSessionId = entry.resumeSessionId || entry.sessionId || null;
  const sessionId = entry.sessionId || resumeSessionId || runtimeSessionId || null;

  return {
    sessionId,
    runtimeSessionId,
    resumeSessionId,
    transcriptPath: entry.transcriptPath || null,
    startedAt: entry.startedAt ?? null,
    endedAt: entry.endedAt || null,
  };
}

function sessionEntryMatches(entry, sessionId) {
  if (!entry || !sessionId) return false;
  return entry.sessionId === sessionId
    || entry.runtimeSessionId === sessionId
    || entry.resumeSessionId === sessionId;
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
      cumulativeTokens: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, sessionCount: 0 },
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
        agent[key] = key === 'projectPath'
          ? sanitizeProjectPath(fields[key])
          : fields[key];
      }
    }
    if (fields.workspace !== undefined) {
      agent.workspace = sanitizeWorkspace(fields.workspace, agent.projectPath);
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
    agent.archivedAt = Date.now();
    agent.enabled = false;
    agent.currentSessionId = null;
    agent.currentRuntimeSessionId = null;
    agent.currentResumeSessionId = null;
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
      if (normalizePath(agent.projectPath) !== normalized) continue;
      if (!agent.currentSessionId) {
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

  linkSession(registryId, sessionId, transcriptPath, options = {}) {
    const agent = this.agents.get(registryId);
    if (!agent) return;
    const runtimeSessionId = options.runtimeSessionId !== undefined
      ? options.runtimeSessionId
      : sessionId;
    const resumeSessionId = options.resumeSessionId !== undefined
      ? options.resumeSessionId
      : sessionId;
    const resolvedSessionId = sessionId || resumeSessionId || runtimeSessionId || null;

    agent.currentSessionId = resolvedSessionId;
    agent.currentRuntimeSessionId = runtimeSessionId || null;
    agent.currentResumeSessionId = resumeSessionId || null;
    agent.lastActiveAt = Date.now();

    // Ensure sessionHistory array exists (backward compat with old data)
    if (!Array.isArray(agent.sessionHistory)) {
      agent.sessionHistory = [];
    }

    // Add to history if not already present
    const existing = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, resolvedSessionId)
      || sessionEntryMatches(entry, runtimeSessionId)
      || sessionEntryMatches(entry, resumeSessionId));
    if (!existing) {
      agent.sessionHistory.push(buildSessionHistoryEntry({
        sessionId: resolvedSessionId,
        runtimeSessionId,
        resumeSessionId,
        transcriptPath,
        startedAt: Date.now(),
      }));
    } else {
      existing.sessionId = existing.sessionId || resolvedSessionId;
      existing.runtimeSessionId = existing.runtimeSessionId || runtimeSessionId || resolvedSessionId;
      existing.resumeSessionId = existing.resumeSessionId || resumeSessionId || resolvedSessionId;
      if (transcriptPath && !existing.transcriptPath) {
        existing.transcriptPath = transcriptPath;
      }
    }

    this._save();
    this.debugLog(`[Registry] Linked session: ${registryId.slice(0, 8)} ← ${(resolvedSessionId || '').slice(0, 8)}`);
  }

  unlinkSession(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return;

    // Mark current session as ended in history
    if (agent.currentSessionId && Array.isArray(agent.sessionHistory)) {
      const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, agent.currentSessionId)
        || sessionEntryMatches(item, agent.currentRuntimeSessionId)
        || sessionEntryMatches(item, agent.currentResumeSessionId));
      if (entry && !entry.endedAt) {
        entry.endedAt = Date.now();
      }
    }

    agent.currentSessionId = null;
    agent.currentRuntimeSessionId = null;
    agent.currentResumeSessionId = null;
    agent.lastActiveAt = Date.now();
    this._save();
    this.debugLog(`[Registry] Unlinked session: ${registryId.slice(0, 8)}`);
  }

  /**
   * Update transcriptPath for a session in history (may arrive after linkSession)
   */
  updateSessionTranscriptPath(registryId, sessionId, transcriptPath) {
    const agent = this.agents.get(registryId);
    if (!agent || !Array.isArray(agent.sessionHistory)) return;
    const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, sessionId));
    if (entry && !entry.transcriptPath && transcriptPath) {
      entry.transcriptPath = transcriptPath;
      this._save();
    }
  }

  replaceSessionId(registryId, previousSessionId, nextSessionId, transcriptPath = null, options = {}) {
    const agent = this.agents.get(registryId);
    if (!agent || !previousSessionId || !nextSessionId) return false;
    const runtimeSessionId = options.runtimeSessionId !== undefined
      ? options.runtimeSessionId
      : previousSessionId;
    const resumeSessionId = options.resumeSessionId !== undefined
      ? options.resumeSessionId
      : nextSessionId;
    const resolvedSessionId = nextSessionId || resumeSessionId || runtimeSessionId || previousSessionId;
    if (previousSessionId === nextSessionId) {
      if (transcriptPath) {
        this.updateSessionTranscriptPath(registryId, nextSessionId, transcriptPath);
      }
      if (agent.currentRuntimeSessionId == null) agent.currentRuntimeSessionId = runtimeSessionId || null;
      if (agent.currentResumeSessionId == null) agent.currentResumeSessionId = resumeSessionId || null;
      return true;
    }

    if (!Array.isArray(agent.sessionHistory)) {
      agent.sessionHistory = [];
    }

    const previousEntry = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, previousSessionId)) || null;
    const nextEntry = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, nextSessionId)) || null;

    if (agent.currentSessionId === previousSessionId || agent.currentSessionId === runtimeSessionId) {
      agent.currentSessionId = resolvedSessionId;
    }
    agent.currentRuntimeSessionId = agent.currentRuntimeSessionId || runtimeSessionId || previousSessionId;
    agent.currentResumeSessionId = resumeSessionId || nextSessionId || agent.currentResumeSessionId || null;

    if (previousEntry && nextEntry && previousEntry !== nextEntry) {
      nextEntry.sessionId = nextEntry.sessionId || resolvedSessionId;
      nextEntry.runtimeSessionId = nextEntry.runtimeSessionId || previousEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
      nextEntry.resumeSessionId = nextEntry.resumeSessionId || previousEntry.resumeSessionId || resumeSessionId || nextSessionId;
      nextEntry.transcriptPath = nextEntry.transcriptPath || previousEntry.transcriptPath || transcriptPath || null;
      nextEntry.startedAt = Math.min(nextEntry.startedAt || Infinity, previousEntry.startedAt || Infinity);
      if (!Number.isFinite(nextEntry.startedAt)) nextEntry.startedAt = previousEntry.startedAt || null;
      nextEntry.endedAt = nextEntry.endedAt || previousEntry.endedAt || null;
      agent.sessionHistory = agent.sessionHistory.filter((entry) => entry !== previousEntry);
    } else if (previousEntry) {
      previousEntry.sessionId = resolvedSessionId;
      previousEntry.runtimeSessionId = previousEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
      previousEntry.resumeSessionId = resumeSessionId || nextSessionId || previousEntry.resumeSessionId || null;
      previousEntry.transcriptPath = previousEntry.transcriptPath || transcriptPath || null;
    } else if (!nextEntry) {
      agent.sessionHistory.push(buildSessionHistoryEntry({
        sessionId: resolvedSessionId,
        runtimeSessionId,
        resumeSessionId,
        transcriptPath,
        startedAt: Date.now(),
      }));
    } else {
      nextEntry.sessionId = nextEntry.sessionId || resolvedSessionId;
      nextEntry.runtimeSessionId = nextEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
      nextEntry.resumeSessionId = nextEntry.resumeSessionId || resumeSessionId || nextSessionId;
      nextEntry.transcriptPath = nextEntry.transcriptPath || transcriptPath || null;
    }

    this._save();
    this.debugLog(`[Registry] Session rekeyed: ${previousSessionId.slice(0, 8)} → ${nextSessionId.slice(0, 8)}`);
    return true;
  }

  /**
   * Get session history for a registered agent
   */
  getSessionHistory(registryId) {
    const agent = this.agents.get(registryId);
    if (!agent) return [];
    return Array.isArray(agent.sessionHistory)
      ? agent.sessionHistory.map((entry) => buildSessionHistoryEntry(entry))
      : [];
  }

  findSessionHistoryEntry(registryId, sessionId) {
    const agent = this.agents.get(registryId);
    if (!agent || !Array.isArray(agent.sessionHistory) || !sessionId) return null;
    const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, sessionId));
    return entry ? buildSessionHistoryEntry(entry) : null;
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
      agent.currentRuntimeSessionId = null;
      agent.currentResumeSessionId = null;
    }
    this._save();
    this.debugLog(`[Registry] ${enabled ? 'Enabled' : 'Disabled'}: ${registryId.slice(0, 8)}`);
  }
}

module.exports = { AgentRegistry, normalizePath };
