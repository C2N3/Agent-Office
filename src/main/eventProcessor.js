/**
 * Provider-agnostic event processor.
 * Normalizes Claude/Codex events into a shared session lifecycle model.
 */

const path = require('path');
const { calculateTokenCost, roundCost, getContextWindowSize } = require('../pricing');

function computeTokenUsage(agent, tokenUsage) {
  if (!tokenUsage) return null;

  const cur = agent.tokenUsage || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
  const directInputTokens = tokenUsage.input_tokens || 0;
  const cachedInputTokens = tokenUsage.cached_input_tokens || tokenUsage.cache_read_input_tokens || 0;
  const cacheCreationTokens = tokenUsage.cache_creation_input_tokens || 0;
  const totalInputDelta = directInputTokens + cachedInputTokens + cacheCreationTokens;
  const outputDelta = tokenUsage.output_tokens || 0;

  const inputTokens = cur.inputTokens + totalInputDelta;
  const outputTokens = cur.outputTokens + outputDelta;
  const estimatedCost = agent.model
    ? roundCost(cur.estimatedCost + calculateTokenCost({
      input: directInputTokens,
      cacheRead: cachedInputTokens,
      cacheCreate: cacheCreationTokens,
      output: outputDelta,
    }, agent.model))
    : (cur.estimatedCost || 0);

  const latestInput = totalInputDelta;
  const ctxWindow = getContextWindowSize(agent.model);
  const contextPercent = ctxWindow > 0 ? Math.min(100, Math.round((latestInput / ctxWindow) * 100)) : 0;

  return { inputTokens, outputTokens, estimatedCost, contextPercent };
}

function handlePidReconnect({
  agentManager,
  sessionPids,
  sessionId,
  toolName,
  toolInput,
  transcriptPath,
  debugLog,
  detectPidByTranscript,
  logPrefix,
  updateSource,
}) {
  if (typeof detectPidByTranscript !== 'function') return;
  if (toolName !== 'Bash' || !toolInput) return;
  if (!/echo\s+\$(\$|PPID)/.test(toolInput.command || '')) return;

  const agent = agentManager && agentManager.getAgent(sessionId);
  const jsonlPath = (agent && agent.jsonlPath) || transcriptPath || null;
  debugLog(`[${logPrefix}] PID reconnect trigger: ${sessionId.slice(0, 8)} (echo detected)`);

  if (agent && !sessionPids.has(sessionId)) {
    agentManager.updateAgent({ ...agent, firstSeen: Date.now() }, updateSource);
  }

  detectPidByTranscript(jsonlPath, (result) => {
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

function createEventProcessor({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  detectPidByTranscript,
  logPrefix = 'Event',
  createSource = 'event',
  updateSource = 'event',
}) {
  const pendingSessionStarts = [];
  const firstToolUseDone = new Map();
  const sessionToRegistry = new Map(); // sessionId → registryId

  /** Resolve a sessionId to a registryId if linked, else return sessionId */
  function resolveAgentId(sessionId) {
    return sessionToRegistry.get(sessionId) || sessionId;
  }

  function processEvent(event) {
    if (!event) return;

    const sessionId = event.sessionId;
    const rawType = event.rawType || event.type;
    if (!sessionId) return;

    debugLog(`[${logPrefix}] ${rawType} session=${sessionId.slice(0, 8)}`);

    // Update transcriptPath in registry if it arrived late
    if (event.transcriptPath && agentRegistry) {
      const regId = sessionToRegistry.get(sessionId);
      if (regId) {
        agentRegistry.updateSessionTranscriptPath(regId, sessionId, event.transcriptPath);
      }
    }

    if (agentManager && event.type !== 'session.start' && event.type !== 'session.end') {
      const agentKey = resolveAgentId(sessionId);
      const existing = agentManager.getAgent(agentKey);
      if (!existing) {
        debugLog(`[${logPrefix}] Auto-create from ${rawType}: ${sessionId.slice(0, 8)}`);
        handleSessionStart(sessionId, event.cwd || '', event.pid || 0, {
          isTeammate: !!event.isTeammate,
          isSubagent: !!event.isSubagent,
          initialState: 'Waiting',
          parentId: event.parentId || null,
          meta: {
            provider: event.provider || null,
            jsonlPath: event.transcriptPath || null,
            model: event.model || null,
            permissionMode: event.permissionMode || null,
            source: event.source || null,
            agentType: event.agentType || null,
            teammateName: event.teammateName || null,
            teamName: event.teamName || null,
          }
        });
      }
    }

    switch (event.type) {
      case 'session.start': {
        const sessionSource = event.source || 'startup';
        const sessionMeta = {
          provider: event.provider || null,
          jsonlPath: event.transcriptPath || null,
          model: event.model || null,
          permissionMode: event.permissionMode || null,
          source: sessionSource,
          agentType: event.agentType || null,
        };

        if (sessionSource !== 'startup' && agentManager) {
          const existing = agentManager.getAgent(resolveAgentId(sessionId));
          if (existing) {
            const compactUpdate = {
              ...existing,
              sessionId,
              state: 'Waiting',
              jsonlPath: sessionMeta.jsonlPath || existing.jsonlPath,
              model: sessionMeta.model || existing.model,
              source: sessionSource,
              provider: sessionMeta.provider || existing.provider || null,
            };
            if (sessionSource === 'compact') {
              compactUpdate.tokenUsage = { ...(existing.tokenUsage || {}), contextPercent: 0 };
            }
            agentManager.updateAgent(compactUpdate, updateSource);
            debugLog(`[${logPrefix}] SessionStart (${sessionSource}) -> updated existing agent ${sessionId.slice(0, 8)}`);
            break;
          }
        }

        handleSessionStart(sessionId, event.cwd || '', event.pid || 0, {
          isTeammate: !!event.isTeammate,
          isSubagent: !!event.isSubagent,
          initialState: event.initialState || 'Waiting',
          parentId: event.parentId || null,
          meta: sessionMeta,
        });
        break;
      }

      case 'session.end':
        if (event.reason) {
          debugLog(`[${logPrefix}] SessionEnd reason: ${event.reason} for ${sessionId.slice(0, 8)}`);
        }
        handleSessionEnd(sessionId);
        break;

      case 'prompt.submit':
        firstToolUseDone.delete(sessionId);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking' }, updateSource);
          }
        }
        break;

      case 'turn.complete':
        firstToolUseDone.delete(sessionId);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            const updatedUsage = computeTokenUsage(agent, event.tokenUsage);
            agentManager.updateAgent({
              ...agent,
              sessionId,
              state: 'Done',
              currentTool: null,
              lastMessage: event.lastAssistantMessage !== undefined ? event.lastAssistantMessage : agent.lastMessage,
              ...(updatedUsage && { tokenUsage: updatedUsage }),
            }, updateSource);
          }
        }
        break;

      case 'usage.update':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            const updatedUsage = computeTokenUsage(agent, event.tokenUsage);
            if (updatedUsage) {
              agentManager.updateAgent({
                ...agent,
                sessionId,
                tokenUsage: updatedUsage,
              }, updateSource);
            }
          }
        }
        break;

      case 'message':
        if (agentManager && event.text !== undefined) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, lastMessage: event.text }, updateSource);
          }
        }
        break;

      case 'tool.start':
        if (!firstToolUseDone.has(sessionId)) {
          firstToolUseDone.set(sessionId, true);
          if (event.suppressIfFirst) {
            debugLog(`[${logPrefix}] Tool start ignored (first = session init)`);
            break;
          }
        }
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: 'Working', currentTool: event.toolName || null }, updateSource);
          }
        }
        break;

      case 'tool.end':
        if (agentManager && firstToolUseDone.has(sessionId)) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            const updatedUsage = computeTokenUsage(agent, event.tokenUsage);
            agentManager.updateAgent({
              ...agent,
              sessionId,
              state: 'Thinking',
              currentTool: null,
              ...(updatedUsage && { tokenUsage: updatedUsage }),
            }, updateSource);
          }
        }

        handlePidReconnect({
          agentManager,
          sessionPids,
          sessionId,
          toolName: event.toolName,
          toolInput: event.toolInput,
          transcriptPath: event.transcriptPath,
          debugLog,
          detectPidByTranscript,
          logPrefix,
          updateSource,
        });
        break;

      case 'tool.error':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: 'Error', currentTool: event.toolName || null }, updateSource);
          }
        }
        break;

      case 'help':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: 'Help', currentTool: event.toolName || null }, updateSource);
          }
        }
        break;

      case 'notification':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: event.state || 'Waiting' }, updateSource);
          }
        }
        break;

      case 'subagent.start':
        if (event.subagentId) {
          handleSessionStart(event.subagentId, event.cwd || '', 0, {
            isTeammate: false,
            isSubagent: true,
            initialState: event.initialState || 'Working',
            parentId: sessionId,
            meta: {
              provider: event.provider || null,
              jsonlPath: event.transcriptPath || null,
              agentType: event.agentType || null,
            }
          });
          debugLog(`[${logPrefix}] SubagentStart: ${event.subagentId.slice(0, 8)} type=${event.agentType || 'unknown'} parent=${sessionId.slice(0, 8)}`);
        }
        break;

      case 'subagent.end':
        if (event.subagentId) {
          if (event.lastAssistantMessage && agentManager) {
            const subAgent = agentManager.getAgent(event.subagentId);
            if (subAgent) {
              agentManager.updateAgent({ ...subAgent, lastMessage: event.lastAssistantMessage, state: 'Done' }, updateSource);
            }
          }
          handleSessionEnd(event.subagentId);
        }
        break;

      case 'teammate.idle': {
        const teammateName = event.teammateName || null;
        const teamName = event.teamName || null;
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({
              ...agent,
              state: 'Waiting',
              isTeammate: true,
              teammateName,
              teamName,
              currentTool: null,
            }, updateSource);
          } else {
            handleSessionStart(sessionId, event.cwd || '', 0, {
              isTeammate: true,
              isSubagent: false,
              initialState: 'Waiting',
              parentId: null,
              meta: {
                provider: event.provider || null,
                jsonlPath: event.transcriptPath || null,
                teammateName,
                teamName,
              }
            });
          }
        }
        debugLog(`[${logPrefix}] TeammateIdle: ${sessionId.slice(0, 8)} name=${teammateName} team=${teamName}`);
        break;
      }

      case 'compact.start':
        debugLog(`[${logPrefix}] PreCompact (${event.trigger || 'unknown'}) for ${sessionId.slice(0, 8)}`);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId));
          if (agent) {
            agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking', firstSeen: Date.now() }, updateSource);
          }
        }
        break;

      case 'meta':
        debugLog(`[${logPrefix}] Meta info: ${rawType} for ${sessionId.slice(0, 8)}`);
        break;

      case 'unknown':
      default:
        debugLog(`[${logPrefix}] Unknown: ${rawType} -> ${JSON.stringify(event.raw || {}).slice(0, 150)}`);
        break;
    }
  }

  function handleSessionStart(sessionId, cwd, pid = 0, options = {}) {
    const {
      isTeammate = false,
      isSubagent = false,
      initialState = 'Waiting',
      parentId = null,
      meta = {},
    } = options;

    if (!agentManager) {
      pendingSessionStarts.push({ sessionId, cwd, pid, isTeammate, isSubagent, initialState, parentId, meta });
      debugLog(`[${logPrefix}] SessionStart queued: ${sessionId.slice(0, 8)}`);
      return;
    }

    // Check if this session matches a registered agent
    const registeredAgent = agentRegistry ? agentRegistry.findByProjectPath(cwd) : null;
    if (registeredAgent) {
      // Link session to registered agent
      agentRegistry.linkSession(registeredAgent.id, sessionId, meta.jsonlPath || null);
      sessionToRegistry.set(sessionId, registeredAgent.id);

      agentManager.updateAgent({
        registryId: registeredAgent.id,
        sessionId,
        projectPath: cwd,
        displayName: registeredAgent.name,
        role: registeredAgent.role,
        avatarIndex: registeredAgent.avatarIndex,
        isRegistered: true,
        state: initialState,
        provider: meta.provider || null,
        jsonlPath: meta.jsonlPath || null,
        model: meta.model || null,
        permissionMode: meta.permissionMode || null,
        source: meta.source || null,
        agentType: meta.agentType || null,
        isTeammate,
        isSubagent,
        parentId,
      }, createSource);
      debugLog(`[${logPrefix}] SessionStart -> registered agent: ${registeredAgent.id.slice(0, 8)} "${registeredAgent.name}" ← session ${sessionId.slice(0, 8)}`);
    } else {
      // Ephemeral agent (no registry match)
      const displayName = cwd ? path.basename(cwd) : 'Agent';
      agentManager.updateAgent({
        sessionId,
        projectPath: cwd,
        displayName,
        state: initialState,
        provider: meta.provider || null,
        jsonlPath: meta.jsonlPath || null,
        model: meta.model || null,
        permissionMode: meta.permissionMode || null,
        source: meta.source || null,
        agentType: meta.agentType || null,
        teammateName: meta.teammateName || null,
        teamName: meta.teamName || null,
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

    if (typeof detectPidByTranscript !== 'function') {
      return;
    }

    detectPidByTranscript(meta.jsonlPath || null, (result) => {
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

  function cleanupAgentResources(sessionId) {
    firstToolUseDone.delete(sessionId);
    sessionPids.delete(sessionId);
    debugLog(`[Cleanup] Resources cleared for ${sessionId.slice(0, 8)}`);
  }

  function handleSessionEnd(sessionId) {
    const registryId = sessionToRegistry.get(sessionId);
    const agentKey = registryId || sessionId;

    cleanupAgentResources(sessionId);
    sessionToRegistry.delete(sessionId);

    if (!agentManager) return;
    const agent = agentManager.getAgent(agentKey);
    if (!agent) {
      debugLog(`[${logPrefix}] SessionEnd for unknown agent ${sessionId.slice(0, 8)}`);
      return;
    }

    if (registryId && agentRegistry) {
      // Registered agent: accumulate stats, transition to Offline
      agentRegistry.accumulateTokens(registryId, agent.tokenUsage);
      agentRegistry.unlinkSession(registryId);
      agentManager.transitionToOffline(agentKey);
      debugLog(`[${logPrefix}] SessionEnd -> registered agent ${registryId.slice(0, 8)} → Offline`);
    } else {
      // Ephemeral agent: remove as before
      debugLog(`[${logPrefix}] SessionEnd -> removing ephemeral agent ${sessionId.slice(0, 8)}`);
      agentManager.removeAgent(agentKey);
    }
  }

  function flushPendingStarts() {
    while (pendingSessionStarts.length > 0) {
      const entry = pendingSessionStarts.shift();
      handleSessionStart(entry.sessionId, entry.cwd, entry.pid, entry);
    }
  }

  function cleanup() {
    firstToolUseDone.clear();
    pendingSessionStarts.length = 0;
  }

  return {
    processEvent,
    handleSessionStart,
    handleSessionEnd,
    flushPendingStarts,
    cleanup,
    get firstToolUseDone() { return firstToolUseDone; },
  };
}

module.exports = { createEventProcessor };
