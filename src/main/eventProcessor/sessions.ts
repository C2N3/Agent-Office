import path from 'node:path';
import { normalizePath } from '../registry/index.js';
import type { PendingSessionStart } from './sessionState.js';

export function createSessionLifecycleHandlers(options: any) {
  const {
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript,
    logPrefix,
    createSource,
    updateSource,
    state,
  } = options;

  const {
    resolveSessionId,
    resolveAgentId,
    rememberSessionContext,
    getSessionContext,
    canBindRegistryAgent,
    cleanupSessionResources,
    enqueueSessionStart,
    sessionToRegistry,
  } = state;

  function handlePidReconnect({ sessionId, toolName, toolInput, transcriptPath }: any) {
    if (typeof detectPidByTranscript !== 'function') return;
    if (toolName !== 'Bash' || !toolInput) return;
    if (!/echo\s+\$(\$|PPID)/.test(toolInput.command || '')) return;

    const agent = agentManager && agentManager.getAgent(sessionId);
    const jsonlPath = (agent && agent.jsonlPath) || transcriptPath || null;
    debugLog(`[${logPrefix}] PID reconnect trigger: ${sessionId.slice(0, 8)} (echo detected)`);

    if (agent && !sessionPids.has(sessionId)) {
      agentManager.updateAgent({ ...agent, firstSeen: Date.now() }, updateSource);
    }

    detectPidByTranscript(jsonlPath, (result: any) => {
      if (typeof result === 'number') {
        sessionPids.set(sessionId, result);
        debugLog(`[${logPrefix}] PID reconnected: ${sessionId.slice(0, 8)} -> pid=${result}`);
      } else if (Array.isArray(result)) {
        const registeredPids = new Set(sessionPids.values());
        const newPid = result.find((pid) => !registeredPids.has(pid));
        if (newPid) {
          sessionPids.set(sessionId, newPid);
          debugLog(`[${logPrefix}] PID reconnected (fallback): ${sessionId.slice(0, 8)} -> pid=${newPid}`);
        }
      }
    });
  }

  function handleSessionStart(sessionId: string, cwd: string, pid = 0, options: Partial<PendingSessionStart> = {}) {
    sessionId = resolveSessionId(sessionId) as string;
    const { isTeammate = false, isSubagent = false, initialState = 'Waiting', parentId = null, meta = {} } = options;

    if (!agentManager) {
      enqueueSessionStart({ sessionId, cwd, pid, isTeammate, isSubagent, initialState, parentId, meta });
      debugLog(`[${logPrefix}] SessionStart queued: ${sessionId.slice(0, 8)}`);
      return;
    }

    const cached = getSessionContext(sessionId);
    const resolvedCwd = cwd || cached.cwd || '';
    const resolvedMeta = { ...cached.meta, ...meta };
    rememberSessionContext(sessionId, resolvedCwd, resolvedMeta);

    const registeredAgent = agentRegistry?.findByProjectPath?.(resolvedCwd) || null;
    if (registeredAgent && canBindRegistryAgent(registeredAgent)) {
      agentRegistry?.linkSession?.(registeredAgent.id as string, sessionId, (resolvedMeta.jsonlPath as string | null) || null, {
        runtimeSessionId: resolvedMeta.runtimeSessionId,
        resumeSessionId: resolvedMeta.resumeSessionId,
      });
      sessionToRegistry.set(sessionId, registeredAgent.id as string);

      agentManager.updateAgent({
        registryId: registeredAgent.id,
        sessionId,
        runtimeSessionId: resolvedMeta.runtimeSessionId !== undefined ? resolvedMeta.runtimeSessionId : sessionId,
        resumeSessionId: resolvedMeta.resumeSessionId,
        projectPath: resolvedCwd,
        displayName: registeredAgent.name,
        role: registeredAgent.role,
        avatarIndex: registeredAgent.avatarIndex,
        workspace: registeredAgent.workspace || null,
        isRegistered: true,
        state: initialState,
        provider: resolvedMeta.provider || null,
        jsonlPath: resolvedMeta.jsonlPath || null,
        model: resolvedMeta.model || null,
        permissionMode: resolvedMeta.permissionMode || null,
        source: resolvedMeta.source || null,
        agentType: resolvedMeta.agentType || null,
        isTeammate,
        isSubagent,
        parentId,
      }, createSource);
      debugLog(`[${logPrefix}] SessionStart -> registered agent: ${(registeredAgent.id as string).slice(0, 8)} "${registeredAgent.name}" ← session ${sessionId.slice(0, 8)}`);
    } else if (agentRegistry && !isSubagent && !isTeammate) {
      debugLog(`[${logPrefix}] SessionStart -> skipped unregistered session: ${sessionId.slice(0, 8)} (${resolvedCwd ? path.basename(resolvedCwd) : 'unknown'})`);
      return;
    } else {
      const displayName = resolvedCwd ? path.basename(resolvedCwd) : 'Agent';
      agentManager.updateAgent({
        sessionId,
        runtimeSessionId: resolvedMeta.runtimeSessionId !== undefined ? resolvedMeta.runtimeSessionId : sessionId,
        resumeSessionId: resolvedMeta.resumeSessionId,
        projectPath: resolvedCwd,
        displayName,
        state: initialState,
        provider: resolvedMeta.provider || null,
        jsonlPath: resolvedMeta.jsonlPath || null,
        model: resolvedMeta.model || null,
        permissionMode: resolvedMeta.permissionMode || null,
        source: resolvedMeta.source || null,
        agentType: resolvedMeta.agentType || null,
        teammateName: resolvedMeta.teammateName || null,
        teamName: resolvedMeta.teamName || null,
        isTeammate,
        isSubagent,
        parentId,
      }, createSource);
      debugLog(`[${logPrefix}] SessionStart -> ephemeral agent: ${sessionId.slice(0, 8)} (${displayName}) ${isTeammate ? '[Team]' : ''} ${isSubagent ? '[Sub]' : ''} (Parent: ${parentId ? parentId.slice(0, 8) : 'none'})`);
    }

    if (pid > 0) {
      sessionPids.set(sessionId, pid);
      return;
    }
    if (typeof detectPidByTranscript !== 'function') return;

    detectPidByTranscript((resolvedMeta.jsonlPath as string | null) || null, (result: any) => {
      if (!result) return;
      if (typeof result === 'number') {
        sessionPids.set(sessionId, result);
        debugLog(`[${logPrefix}] SessionStart PID via transcript: ${sessionId.slice(0, 8)} -> pid=${result}`);
      } else if (Array.isArray(result)) {
        const registeredPids = new Set(sessionPids.values());
        const newPid = result.find((pidCandidate) => !registeredPids.has(pidCandidate));
        if (newPid) {
          sessionPids.set(sessionId, newPid);
          debugLog(`[${logPrefix}] SessionStart PID via fallback: ${sessionId.slice(0, 8)} -> pid=${newPid}`);
        }
      }
    });
  }

  function handleSessionEnd(sessionId: string) {
    sessionId = resolveSessionId(sessionId) as string;
    const registryId = sessionToRegistry.get(sessionId);
    const agentKey = registryId || sessionId;

    cleanupSessionResources(sessionId);
    sessionToRegistry.delete(sessionId);

    if (!agentManager) return;
    const agent = agentManager.getAgent(agentKey);
    if (!agent) {
      debugLog(`[${logPrefix}] SessionEnd for unknown agent ${sessionId.slice(0, 8)}`);
      return;
    }

    if (registryId && agentRegistry) {
      agentRegistry.unlinkSession?.(registryId);
      // Don't force Offline if the agent is part of an active team (Waiting/Working on team subtasks).
      // The TeamCoordinator manages their final state.
      const currentState = agent.state;
      const isTeamActive = currentState === 'Waiting' || (agent.teamId && currentState !== 'Offline');
      if (!isTeamActive && agentManager.transitionToOffline) {
        agentManager.transitionToOffline(agentKey);
      }
      debugLog(`[${logPrefix}] SessionEnd -> registered agent ${registryId.slice(0, 8)} ${isTeamActive ? '→ kept (team active)' : '→ Offline'}`);
    } else {
      debugLog(`[${logPrefix}] SessionEnd -> removing ephemeral agent ${sessionId.slice(0, 8)}`);
      agentManager.removeAgent?.(agentKey);
    }
  }

  function attachRegisteredAgent(registryAgent: any) {
    if (!agentManager || !agentRegistry || !registryAgent || !registryAgent.id) return null;
    if (!canBindRegistryAgent(registryAgent)) return null;

    const targetPath = normalizePath(registryAgent.projectPath);
    if (!targetPath) return null;

    const provider = registryAgent.provider || null;
    const candidates = (agentManager.getAllAgents ? agentManager.getAllAgents() : [])
      .filter((agent: any) => {
        if (!agent || agent.isRegistered || !agent.sessionId) return false;
        if (normalizePath(agent.projectPath) !== targetPath) return false;
        if (provider && agent.provider && agent.provider !== provider) return false;
        return true;
      })
      .sort((a: any, b: any) => (b.lastActivity || 0) - (a.lastActivity || 0));

    const matched = candidates[0] || null;
    if (!matched) return null;

    const sessionId = matched.sessionId as string;
    agentRegistry.linkSession?.(registryAgent.id, sessionId, matched.jsonlPath || null, {
      runtimeSessionId: matched.runtimeSessionId !== undefined ? matched.runtimeSessionId : matched.sessionId,
      resumeSessionId: matched.resumeSessionId,
    });
    sessionToRegistry.set(sessionId, registryAgent.id);

    if (agentManager.removeAgent) {
      agentManager.removeAgent(matched.id as string);
    }
    agentManager.updateAgent({
      ...matched,
      registryId: registryAgent.id,
      sessionId,
      runtimeSessionId: matched.runtimeSessionId !== undefined ? matched.runtimeSessionId : matched.sessionId,
      resumeSessionId: matched.resumeSessionId,
      displayName: registryAgent.name,
      role: registryAgent.role,
      projectPath: registryAgent.projectPath,
      avatarIndex: registryAgent.avatarIndex,
      workspace: registryAgent.workspace || null,
      isRegistered: true,
      provider: matched.provider || registryAgent.provider || null,
    }, updateSource);

    debugLog(`[${logPrefix}] Attached live session ${sessionId.slice(0, 8)} -> registered agent ${registryAgent.id.slice(0, 8)}`);
    return sessionId;
  }

  return {
    handlePidReconnect,
    handleSessionStart,
    handleSessionEnd,
    attachRegisteredAgent,
  };
}
