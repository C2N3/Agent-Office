import { buildAccumulatedTokenUsage, resetContextPercent } from './tokenUsage.js';

export function createProcessEventHandler(options: any) {
  const {
    agentManager,
    agentRegistry,
    debugLog,
    logPrefix,
    updateSource,
    state,
    handlePidReconnect,
    handleSessionStart,
    handleSessionEnd,
    getTaskCompletionHandler,
  } = options;

  function notifyTaskCompletion(sessionId: string, reason: string, detail: any, event: any) {
    const fn = typeof getTaskCompletionHandler === 'function' ? getTaskCompletionHandler() : null;
    if (typeof fn !== 'function') return;
    const cached = state.getSessionContext ? state.getSessionContext(sessionId) : null;
    const cwd = (event && event.cwd) || (cached && cached.cwd) || null;
    try {
      fn({
        sessionId,
        registryId: state.resolveAgentId(sessionId) || null,
        reason,
        cwd,
        detail,
      });
    } catch (err: any) {
      debugLog(`[${logPrefix}] Task completion handler error: ${err && err.message}`);
    }
  }

  const {
    resolveSessionId,
    resolveAgentId,
    rememberSessionContext,
    getSessionContext,
    firstToolUseDone,
    sessionToRegistry,
  } = state;

  return function processEvent(event: any) {
    if (!event) return;

    const sessionId = resolveSessionId(event.sessionId);
    const rawType = event.rawType || event.type;
    if (!sessionId) return;

    debugLog(`[${logPrefix}] ${rawType} session=${sessionId.slice(0, 8)}`);

    rememberSessionContext(sessionId, event.cwd || '', {
      provider: event.provider || null,
      jsonlPath: event.transcriptPath || null,
      runtimeSessionId: event.runtimeSessionId,
      resumeSessionId: event.resumeSessionId,
      model: event.model || null,
      permissionMode: event.permissionMode || null,
      source: event.source || null,
      agentType: event.agentType || null,
      teammateName: event.teammateName || null,
      teamName: event.teamName || null,
    });

    if (event.transcriptPath && agentRegistry) {
      const regId = sessionToRegistry.get(sessionId);
      if (regId) {
        agentRegistry.updateSessionTranscriptPath?.(regId, sessionId, event.transcriptPath);
      }
    }

    if (agentManager && event.type !== 'session.start' && event.type !== 'session.end') {
      const agentKey = resolveAgentId(sessionId);
      const existing = agentKey ? agentManager.getAgent(agentKey) : null;
      if (!existing) {
        debugLog(`[${logPrefix}] Auto-create from ${rawType}: ${sessionId.slice(0, 8)}`);
        const cached = getSessionContext(sessionId);
        handleSessionStart(sessionId, event.cwd || cached.cwd || '', event.pid || 0, {
          isTeammate: !!event.isTeammate,
          isSubagent: !!event.isSubagent,
          initialState: 'Waiting',
          parentId: event.parentId || null,
          meta: {
            provider: event.provider || cached.meta.provider || null,
            jsonlPath: event.transcriptPath || cached.meta.jsonlPath || null,
            runtimeSessionId: event.runtimeSessionId !== undefined ? event.runtimeSessionId : cached.meta.runtimeSessionId,
            resumeSessionId: event.resumeSessionId !== undefined ? event.resumeSessionId : cached.meta.resumeSessionId,
            model: event.model || cached.meta.model || null,
            permissionMode: event.permissionMode || cached.meta.permissionMode || null,
            source: event.source || cached.meta.source || null,
            agentType: event.agentType || cached.meta.agentType || null,
            teammateName: event.teammateName || cached.meta.teammateName || null,
            teamName: event.teamName || cached.meta.teamName || null,
          },
        });
      }
    }

    switch (event.type) {
      case 'session.start': {
        const sessionSource = event.source || 'startup';
        const sessionMeta = {
          provider: event.provider || null,
          jsonlPath: event.transcriptPath || null,
          runtimeSessionId: event.runtimeSessionId,
          resumeSessionId: event.resumeSessionId,
          model: event.model || null,
          permissionMode: event.permissionMode || null,
          source: sessionSource,
          agentType: event.agentType || null,
        };

        if (sessionSource !== 'startup' && agentManager) {
          const existing = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (existing) {
            const tokenUsage = sessionSource === 'compact'
              ? resetContextPercent(existing.tokenUsage)
              : existing.tokenUsage || null;
            agentManager.updateAgent({
              ...existing,
              sessionId,
              runtimeSessionId: event.runtimeSessionId !== undefined ? event.runtimeSessionId : existing.runtimeSessionId,
              resumeSessionId: event.resumeSessionId !== undefined ? event.resumeSessionId : existing.resumeSessionId,
              state: 'Waiting',
              jsonlPath: sessionMeta.jsonlPath || existing.jsonlPath,
              model: sessionMeta.model || existing.model,
              source: sessionSource,
              provider: sessionMeta.provider || existing.provider || null,
              tokenUsage,
            }, updateSource);
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
        notifyTaskCompletion(sessionId, 'session.end', { reason: event.reason || null }, event);
        handleSessionEnd(sessionId);
        break;
      case 'prompt.submit':
        firstToolUseDone.delete(sessionId);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking' }, updateSource);
        }
        break;
      case 'turn.complete':
        firstToolUseDone.delete(sessionId);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) {
            const tokenUsage = buildAccumulatedTokenUsage(agent, event);
            agentManager.updateAgent({
              ...agent,
              sessionId,
              state: 'Done',
              currentTool: null,
              lastMessage: event.lastAssistantMessage !== undefined ? event.lastAssistantMessage : agent.lastMessage,
              tokenUsage,
            }, updateSource);
          }
        }
        notifyTaskCompletion(sessionId, 'turn.complete', {
          lastAssistantMessage: event.lastAssistantMessage || null,
        }, event);
        break;
      case 'usage.update':
        break;
      case 'message':
        if (agentManager && event.text !== undefined) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, lastMessage: event.text }, updateSource);
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
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: 'Working', currentTool: event.toolName || null }, updateSource);
        }
        break;
      case 'tool.end':
        if (!firstToolUseDone.has(sessionId)) {
          debugLog(`[${logPrefix}] Tool end ignored (first tool start not seen)`);
          break;
        }
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) {
            const tokenUsage = buildAccumulatedTokenUsage(agent, event);
            agentManager.updateAgent({
              ...agent,
              sessionId,
              state: 'Thinking',
              currentTool: null,
              tokenUsage,
            }, updateSource);
          }
        }
        handlePidReconnect({
          sessionId,
          toolName: event.toolName,
          toolInput: event.toolInput,
          transcriptPath: event.transcriptPath,
        });
        break;
      case 'tool.error':
      case 'error':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: 'Error', currentTool: event.toolName || null }, updateSource);
        }
        break;
      case 'help':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: 'Help', currentTool: event.toolName || null }, updateSource);
        }
        break;
      case 'notification':
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: event.state || 'Waiting' }, updateSource);
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
            },
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
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
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
              },
            });
          }
        }
        debugLog(`[${logPrefix}] TeammateIdle: ${sessionId.slice(0, 8)} name=${teammateName} team=${teamName}`);
        break;
      }
      case 'compact.start':
        debugLog(`[${logPrefix}] PreCompact (${event.trigger || 'unknown'}) for ${sessionId.slice(0, 8)}`);
        if (agentManager) {
          const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
          if (agent) agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking', firstSeen: Date.now() }, updateSource);
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
  };
}
