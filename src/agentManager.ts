/**
 * Multi-Agent Manager
 * - P2-10: Only emit events on state changes
 * - Display name improvement: use cwd basename when slug is absent
 */

import EventEmitter from 'events';
import {
  assignAvatarIndex,
  formatDisplayName,
  getAgentWithEffectiveState,
  getStats,
  releaseAvatarIndex,
} from './agentManager/helpers.js';
import { rekeyAgent, transitionAgentToOffline } from './agentManager/identity.js';

// Sources that represent a provider CLI event pipeline (external signal).
// New agents arriving from these sources without orchestrator context
// (registryId, parentId for subagents, or teamId) are rejected — only
// task-launched sessions should produce agent characters.
const PROVIDER_SOURCES = new Set(['hook', 'http', 'codex']);

/**
 * Merge a field: entry value wins if defined, then existing, then default.
 */
function mergeField(entry, existing, key, defaultVal = null) {
  if (entry[key] !== undefined) return entry[key];
  return existing ? existing[key] : defaultVal;
}

export class AgentManager extends EventEmitter {
  static AgentManager = AgentManager;

  declare agents: Map<string, any>;
  declare _pendingEmit: Map<string, { timer: NodeJS.Timeout; state: string }>;
  declare _usedAvatarIndices: Set<number>;
  declare _nicknameStore: any;
  declare config: {
    softLimitWarning: number;
    stateDebounceMs: number;
  };

  constructor() {
    super();
    this.agents = new Map();
    this._pendingEmit = new Map(); // agentId → { timer, state } — UI emit debounce
    this._usedAvatarIndices = new Set(); // Currently used avatar indices
    this._nicknameStore = null; // Optional NicknameStore reference
    this.config = {
      softLimitWarning: 50,  // Soft warning (does not block, only logs)
      stateDebounceMs: 500,  // Working→Thinking transition debounce (ms)
    };
  }

  /**
   * Set the nickname store reference
   */
  setNicknameStore(store) {
    this._nicknameStore = store;
  }

  start() {
    // Agent cleanup is handled exclusively by the main.js liveness checker (PID-based)
    console.log('[AgentManager] Started');
  }

  stop() {
    for (const pending of this._pendingEmit.values()) {
      clearTimeout(pending.timer);
    }
    this._pendingEmit.clear();
    this._usedAvatarIndices.clear();
    this.agents.clear();
    console.log('[AgentManager] Stopped');
  }

  /**
   * Update or add an agent
   */
  updateAgent(entry, source = 'log') {
    const agentId = entry.registryId || entry.sessionId || entry.agentId || entry.uuid || 'unknown';
    const now = Date.now();
    const existingAgent = this.agents.get(agentId);

    // Task-only gate (defense in depth): reject NEW agents arriving from a
    // provider event pipeline unless they are tied to orchestrator context
    // (registryId) or are a subagent/teammate of an existing task agent.
    // Provider-level gates (hook server, codex monitor, liveness) already
    // filter non-task sessions — this is the final backstop at the agent
    // model boundary so characters only appear for Task-launched sessions.
    if (!existingAgent && PROVIDER_SOURCES.has(source)) {
      const hasOrchestratorContext = !!entry.registryId || !!entry.parentId || !!entry.teamId;
      if (!hasOrchestratorContext) {
        console.log(`[AgentManager] Rejected non-task ${source} agent (no registryId/parentId/teamId): ${agentId}`);
        return null;
      }
    }

    // Soft warning: only warn if agent count is high (does not block registration)
    if (!existingAgent && this.agents.size >= this.config.softLimitWarning) {
      console.warn(`[AgentManager] ⚠ ${this.agents.size} agents active (soft limit: ${this.config.softLimitWarning}). Consider checking for stale sessions.`);
    }

    const prevState = existingAgent ? existingAgent.state : null;
    let newState = entry.state;
    if (!newState) newState = prevState || 'Done';

    let activeStartTime = existingAgent ? existingAgent.activeStartTime : now;
    let lastDuration = existingAgent ? existingAgent.lastDuration : 0;

    // When entering active state (Done/Error/Help/Waiting -> Working/Thinking)
    const isPassive = (s) => s === 'Done' || s === 'Help' || s === 'Error' || s === 'Waiting';
    const isActive = (s) => s === 'Working' || s === 'Thinking';

    if (isActive(newState) && (isPassive(prevState) || !existingAgent)) {
      activeStartTime = now;
    }

    // When returning to Done, save the last elapsed duration
    if (newState === 'Done' && existingAgent && isActive(prevState)) {
      lastDuration = now - activeStartTime;
    }

    const m = (key, defaultVal = null) => mergeField(entry, existingAgent, key, defaultVal);

    const nickname = this._nicknameStore?.getNickname(agentId) || null;

    const registryId = entry.registryId || (existingAgent ? existingAgent.registryId : null);
    const isRegistered = !!(registryId || entry.isRegistered || (existingAgent && existingAgent.isRegistered));

    // For registered agents, prefer the entry's displayName (set from registry name)
    const resolvedDisplayName = isRegistered
      ? (entry.displayName || nickname || (existingAgent && existingAgent.displayName) || 'Agent')
      : (nickname || this.formatDisplayName(entry.slug, entry.projectPath));

    // Avatar: registered agents keep registry-provided avatar, ephemeral agents get auto-assigned
    const resolvedAvatar = (entry.avatarIndex != null)
      ? entry.avatarIndex
      : (existingAgent ? existingAgent.avatarIndex : this._assignAvatarIndex(agentId));

    const agentData = {
      id: agentId,
      registryId,
      isRegistered,
      role: entry.role || (existingAgent ? existingAgent.role : null),
      sessionId: entry.sessionId || (existingAgent ? existingAgent.sessionId : null),
      runtimeSessionId: entry.runtimeSessionId !== undefined
        ? entry.runtimeSessionId
        : (existingAgent ? existingAgent.runtimeSessionId : (entry.sessionId || null)),
      resumeSessionId: entry.resumeSessionId !== undefined
        ? entry.resumeSessionId
        : (existingAgent ? existingAgent.resumeSessionId : (entry.sessionId || null)),
      agentId: entry.agentId,
      slug: entry.slug,
      nickname,
      displayName: resolvedDisplayName,
      projectPath: entry.projectPath || (existingAgent ? existingAgent.projectPath : null),
      workspace: m('workspace'),
      provider: m('provider'),
      jsonlPath: entry.jsonlPath || (existingAgent ? existingAgent.jsonlPath : null),
      model: m('model'),
      permissionMode: m('permissionMode'),
      source: m('source'),
      agentType: m('agentType'),
      currentTool: m('currentTool'),
      lastMessage: m('lastMessage'),
      reportTaskId: m('reportTaskId'),
      reportTeamId: m('reportTeamId'),
      teamId: m('teamId'),
      endReason: m('endReason'),
      teammateName: m('teammateName'),
      teamName: m('teamName'),
      avatarIndex: resolvedAvatar,
      isSubagent: entry.isSubagent || (existingAgent ? existingAgent.isSubagent : false),
      isTeammate: entry.isTeammate || (existingAgent ? existingAgent.isTeammate : false),
      parentId: entry.parentId || (existingAgent ? existingAgent.parentId : null),
      state: newState,
      activeStartTime,
      lastDuration,
      lastActivity: now,
      timestamp: entry.timestamp || now,
      firstSeen: existingAgent ? existingAgent.firstSeen : now,
      updateCount: existingAgent ? existingAgent.updateCount + 1 : 1
    };

    this.agents.set(agentId, agentData);

    // Refresh parent state when subagent state changes
    if (agentData.parentId) {
      this.reEvaluateParentState(agentData.parentId);
    }

    if (!existingAgent) {
      this._cancelPendingEmit(agentId);
      this.emit('agent-added', this.getAgentWithEffectiveState(agentId));
      console.log(`[AgentManager] Agent added: ${agentData.displayName} (${newState})`);
    } else if (newState !== prevState) {
      this._emitWithDebounce(agentId, prevState, newState, agentData.displayName);
    } else if (existingAgent.displayName !== agentData.displayName || existingAgent.avatarIndex !== agentData.avatarIndex) {
      // Name or avatar changed — force emit without debounce
      this.emit('agent-updated', this.getAgentWithEffectiveState(agentId));
    }

    return agentData;
  }

  /**
   * State transition debounce — delays Working→Thinking transitions by 500ms to prevent flickering
   * Thinking→Working (promotion) is applied immediately, canceling any pending emit
   */
  _emitWithDebounce(agentId, prevState, newState, displayName) {
    const isDowngrade = (prevState === 'Working' && newState === 'Thinking');

    if (isDowngrade) {
      // Working→Thinking: delayed emit (canceled if Working is re-entered within 500ms)
      this._cancelPendingEmit(agentId);
      const timer = setTimeout(() => {
        this._pendingEmit.delete(agentId);
        const current = this.agents.get(agentId);
        if (current && current.state === newState) {
          this.emit('agent-updated', this.getAgentWithEffectiveState(agentId));
        }
      }, this.config.stateDebounceMs);
      this._pendingEmit.set(agentId, { timer, state: newState });
    } else {
      // Immediate emit — cancel any pending emit
      this._cancelPendingEmit(agentId);
      this.emit('agent-updated', this.getAgentWithEffectiveState(agentId));
    }
  }

  _cancelPendingEmit(agentId) {
    const pending = this._pendingEmit.get(agentId);
    if (pending) {
      clearTimeout(pending.timer);
      this._pendingEmit.delete(agentId);
    }
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this._cancelPendingEmit(agentId);
    this._releaseAvatarIndex(agent.avatarIndex);
    this.agents.delete(agentId);

    // Refresh parent state when subagent is removed
    if (agent.parentId) {
      this.reEvaluateParentState(agent.parentId);
    }

    this.emit('agent-removed', { id: agentId, displayName: agent.displayName });
    console.log(`[AgentManager] Removed: ${agent.displayName}`);
    return true;
  }

  rekeyAgent(currentId, nextId, fields = {}) {
    return rekeyAgent(this, currentId, nextId, fields);
  }

  /**
   * Transition a registered agent to Offline state instead of removing it.
   */
  transitionToOffline(agentId) {
    return transitionAgentToOffline(this, agentId);
  }

  getAllAgents(): any[] {
    return Array.from(this.agents.keys()).map(id => this.getAgentWithEffectiveState(id));
  }

  getAgentWithEffectiveState(agentId): any {
    return getAgentWithEffectiveState(this.agents, agentId);
  }

  reEvaluateParentState(parentId) {
    const parent = this.agents.get(parentId);
    if (!parent) return;
    // Force emit parent state update event so the renderer recognizes it as Working
    this.emit('agent-updated', this.getAgentWithEffectiveState(parentId));
  }
  getAgent(agentId): any { return this.agents.get(agentId) || null; }
  getAgentCount() { return this.agents.size; }
  getAgentsByActivity() {
    return this.getAllAgents().sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Determine display name
   * 1. slug (e.g., "toasty-sparking-lecun" → "Toasty Sparking Lecun")
   * 2. basename of projectPath (e.g., "agent-office-master")
   * 3. Fallback: "Agent"
   */
  formatDisplayName(slug, projectPath) {
    return formatDisplayName(slug, projectPath);
  }

  /**
   * Assign avatar index — prioritize unused avatars on hash collision
   */
  _assignAvatarIndex(agentId) {
    return assignAvatarIndex(agentId, this._usedAvatarIndices);
  }

  /**
   * Release avatar index
   */
  _releaseAvatarIndex(avatarIndex) {
    releaseAvatarIndex(avatarIndex, this._usedAvatarIndices);
  }

  getStats() {
    return getStats(this.getAllAgents());
  }
}
