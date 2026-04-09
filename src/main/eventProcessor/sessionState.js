function createSessionState({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  logPrefix = 'Event',
  updateSource = 'event',
}) {
  const pendingSessionStarts = [];
  const firstToolUseDone = new Map();
  const sessionToRegistry = new Map();
  const sessionContext = new Map();
  const sessionAliases = new Map();

  function resolveSessionId(sessionId) {
    if (!sessionId) return null;
    let current = sessionId;
    const seen = new Set();
    while (sessionAliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = sessionAliases.get(current);
    }
    return current;
  }

  function resolveAgentId(sessionId) {
    const canonicalSessionId = resolveSessionId(sessionId);
    return sessionToRegistry.get(canonicalSessionId) || canonicalSessionId;
  }

  function rememberSessionContext(sessionId, cwd, meta = {}) {
    const canonicalSessionId = resolveSessionId(sessionId);
    if (!canonicalSessionId) return;
    const existing = sessionContext.get(canonicalSessionId) || { cwd: '', meta: {} };
    sessionContext.set(canonicalSessionId, {
      cwd: cwd || existing.cwd || '',
      meta: {
        ...existing.meta,
        ...meta,
      },
    });
  }

  function getSessionContext(sessionId) {
    return sessionContext.get(resolveSessionId(sessionId)) || { cwd: '', meta: {} };
  }

  function canBindRegistryAgent(registryAgent) {
    if (!registryAgent || !registryAgent.id) return false;
    if (registryAgent.currentSessionId) return false;
    const existing = agentManager ? agentManager.getAgent(registryAgent.id) : null;
    if (existing && existing.isRegistered && existing.sessionId && existing.state !== 'Offline') {
      return false;
    }
    return true;
  }

  function adoptSessionIdentity(previousSessionId, nextSessionId) {
    const previousCanonical = resolveSessionId(previousSessionId);
    const nextCanonical = resolveSessionId(nextSessionId);

    if (!previousCanonical || !nextCanonical) return nextCanonical || previousCanonical || null;
    if (previousCanonical === nextCanonical) {
      if (previousSessionId !== nextCanonical) {
        sessionAliases.set(previousSessionId, nextCanonical);
      }
      return nextCanonical;
    }

    sessionAliases.set(previousSessionId, nextCanonical);
    sessionAliases.set(previousCanonical, nextCanonical);

    const previousContext = sessionContext.get(previousCanonical) || null;
    const nextContext = sessionContext.get(nextCanonical) || null;
    if (previousContext) {
      sessionContext.set(nextCanonical, {
        cwd: nextContext?.cwd || previousContext.cwd || '',
        meta: {
          ...(previousContext.meta || {}),
          ...(nextContext?.meta || {}),
        },
      });
      sessionContext.delete(previousCanonical);
    }

    if (firstToolUseDone.has(previousCanonical) && !firstToolUseDone.has(nextCanonical)) {
      firstToolUseDone.set(nextCanonical, firstToolUseDone.get(previousCanonical));
    }
    firstToolUseDone.delete(previousCanonical);

    if (sessionPids.has(previousCanonical) && !sessionPids.has(nextCanonical)) {
      sessionPids.set(nextCanonical, sessionPids.get(previousCanonical));
    }
    sessionPids.delete(previousCanonical);

    for (const pending of pendingSessionStarts) {
      if (pending.sessionId === previousCanonical) {
        pending.sessionId = nextCanonical;
      }
    }

    const registryId = sessionToRegistry.get(previousCanonical) || null;
    if (registryId) {
      sessionToRegistry.delete(previousCanonical);
      sessionToRegistry.set(nextCanonical, registryId);
      agentRegistry?.replaceSessionId(
        registryId,
        previousCanonical,
        nextCanonical,
        sessionContext.get(nextCanonical)?.meta?.jsonlPath || null,
        {
          runtimeSessionId: previousSessionId,
          resumeSessionId: nextCanonical,
        }
      );

      const registeredAgent = agentManager?.getAgent(registryId);
      if (registeredAgent) {
        agentManager.updateAgent({
          ...registeredAgent,
          sessionId: nextCanonical,
          runtimeSessionId: registeredAgent.runtimeSessionId || previousSessionId,
          resumeSessionId: nextCanonical,
        }, updateSource);
      }
    } else if (agentManager?.getAgent(previousCanonical)) {
      agentManager.rekeyAgent(previousCanonical, nextCanonical, {
        sessionId: nextCanonical,
        runtimeSessionId: previousSessionId,
        resumeSessionId: nextCanonical,
      });
    }

    debugLog(`[${logPrefix}] Session alias adopted: ${previousCanonical.slice(0, 8)} → ${nextCanonical.slice(0, 8)}`);
    return nextCanonical;
  }

  function cleanupSessionResources(sessionId) {
    const canonicalSessionId = resolveSessionId(sessionId);
    firstToolUseDone.delete(canonicalSessionId);
    sessionPids.delete(canonicalSessionId);
    for (const [alias, canonical] of Array.from(sessionAliases.entries())) {
      if (alias === canonicalSessionId || canonical === canonicalSessionId) {
        sessionAliases.delete(alias);
      }
    }
    debugLog(`[Cleanup] Resources cleared for ${canonicalSessionId.slice(0, 8)}`);
  }

  function enqueueSessionStart(entry) {
    pendingSessionStarts.push(entry);
  }

  function flushPendingStarts(handleSessionStart) {
    while (pendingSessionStarts.length > 0) {
      const entry = pendingSessionStarts.shift();
      handleSessionStart(entry.sessionId, entry.cwd, entry.pid, entry);
    }
  }

  return {
    pendingSessionStarts,
    firstToolUseDone,
    sessionToRegistry,
    resolveSessionId,
    resolveAgentId,
    adoptSessionIdentity,
    rememberSessionContext,
    getSessionContext,
    canBindRegistryAgent,
    cleanupSessionResources,
    enqueueSessionStart,
    flushPendingStarts,
  };
}

module.exports = { createSessionState };
