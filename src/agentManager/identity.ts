
type AgentIdentityFields = {
  sessionId?: string | null;
  runtimeSessionId?: string | null;
  resumeSessionId?: string | null;
};

export function rekeyAgent(manager, currentId, nextId, fields: AgentIdentityFields = {}) {
  if (!currentId || !nextId) return null;

  const current = manager.agents.get(currentId);
  if (!current) return null;

  if (currentId === nextId) {
    const updated = { ...current, ...fields, id: nextId };
    manager.agents.set(nextId, updated);
    manager.emit('agent-updated', manager.getAgentWithEffectiveState(nextId));
    return updated;
  }

  manager._cancelPendingEmit(currentId);
  manager._cancelPendingEmit(nextId);

  const existingTarget = manager.agents.get(nextId) || null;
  const merged = {
    ...current,
    id: nextId,
    sessionId: fields.sessionId || current.sessionId || nextId,
    runtimeSessionId: fields.runtimeSessionId !== undefined
      ? fields.runtimeSessionId
      : (current.runtimeSessionId || current.sessionId || currentId),
    resumeSessionId: fields.resumeSessionId !== undefined
      ? fields.resumeSessionId
      : (fields.sessionId || current.resumeSessionId || current.sessionId || nextId),
  };

  if (existingTarget) {
    for (const [key, value] of Object.entries(existingTarget)) {
      if (merged[key] === undefined || merged[key] === null) {
        merged[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  manager.agents.delete(currentId);
  manager.agents.set(nextId, merged);

  for (const [agentId, agent] of manager.agents.entries()) {
    if (agent.parentId === currentId) {
      manager.agents.set(agentId, { ...agent, parentId: nextId });
    }
  }

  if (manager._nicknameStore) {
    const nickname = manager._nicknameStore.rekeyNickname(currentId, nextId);
    if (nickname) {
      merged.nickname = nickname;
      manager.agents.set(nextId, merged);
    }
  }

  manager.emit('agent-removed', { id: currentId, displayName: current.displayName });
  if (existingTarget) {
    manager.emit('agent-updated', manager.getAgentWithEffectiveState(nextId));
  } else {
    manager.emit('agent-added', manager.getAgentWithEffectiveState(nextId));
  }

  if (merged.parentId) {
    manager.reEvaluateParentState(merged.parentId);
  }

  console.log(`[AgentManager] Rekeyed: ${currentId} → ${nextId}`);
  return merged;
}

export function transitionAgentToOffline(manager, agentId) {
  const agent = manager.agents.get(agentId);
  if (!agent) return false;
  manager._cancelPendingEmit(agentId);
  const offlineAgent = {
    ...agent,
    state: 'Offline',
    currentTool: null,
    sessionId: null,
    runtimeSessionId: null,
    resumeSessionId: null,
    jsonlPath: null,
    lastActivity: Date.now(),
  };
  manager.agents.set(agentId, offlineAgent);
  manager.emit('agent-updated', manager.getAgentWithEffectiveState(agentId));
  console.log(`[AgentManager] Offline: ${agent.displayName}`);
  return true;
}
