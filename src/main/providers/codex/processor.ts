/**
 * Codex exec --json event adapter.
 */
const { createEventProcessor } = require('../../eventProcessor');
const { createIgnoredSessionTracker } = require('./ignoredSessions');
const { getCodexSubagentInfo, getCodexWorkspacePath, normalizeCodexEvent } = require('./events');

function createCodexProcessor({ agentManager, agentRegistry, sessionPids, debugLog, detectPidByTranscript = null }) {
  let taskCompletionHandler = null;
  const processor = createEventProcessor({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript,
    logPrefix: 'Codex',
    createSource: 'codex',
    updateSource: 'codex',
    getTaskCompletionHandler: () => taskCompletionHandler,
  });
  const pendingFunctionCalls = new Map(); // callId -> { sessionId, name, args }
  const latestTokenUsageBySession = new Map();
  const ignoredSessions = createIgnoredSessionTracker({
    debugLog,
    logPrefix: 'Codex',
    resolveSessionId: (sessionId) => resolveCodexSessionId(sessionId),
  });

  function resolveCodexSessionId(sessionId) {
    return processor.resolveSessionId ? processor.resolveSessionId(sessionId) : sessionId;
  }

  function resolveCodexAgent(sessionId) {
    const canonicalSessionId = agentManager ? resolveCodexSessionId(sessionId) : null;
    if (!canonicalSessionId || !agentManager) return null;
    const agentKey = processor.resolveAgentId
      ? processor.resolveAgentId(canonicalSessionId)
      : canonicalSessionId;
    return agentKey ? agentManager.getAgent(agentKey) : null;
  }

  function dispatchEvent(event) {
    const sessionId = resolveCodexSessionId(event.sessionId || null);
    if (!sessionId || ignoredSessions.shouldSuppress(sessionId, event.type)) return;
    processor.processEvent(event);
    if (event.type === 'session.end') {
      ignoredSessions.clear(sessionId);
      return;
    }
    if (resolveCodexAgent(sessionId)) {
      ignoredSessions.clear(sessionId);
      return;
    }

    ignoredSessions.mark(sessionId, event.type === 'session.start'
      ? 'session start was rejected'
      : `session auto-create was rejected after ${event.rawType || event.type}`);
  }

  function adoptCanonicalSessionId(previousSessionId, nextSessionId) {
    const canonicalSessionId = processor.adoptSessionIdentity
      ? processor.adoptSessionIdentity(previousSessionId, nextSessionId)
      : nextSessionId;
    if (!previousSessionId || !canonicalSessionId || previousSessionId === canonicalSessionId) return canonicalSessionId;

    const previousCanonical = resolveCodexSessionId(previousSessionId);
    if (latestTokenUsageBySession.has(previousCanonical) && !latestTokenUsageBySession.has(canonicalSessionId)) {
      latestTokenUsageBySession.set(canonicalSessionId, latestTokenUsageBySession.get(previousCanonical));
    }
    latestTokenUsageBySession.delete(previousSessionId);
    latestTokenUsageBySession.delete(previousCanonical);
    ignoredSessions.adopt(previousSessionId, canonicalSessionId);

    for (const info of pendingFunctionCalls.values()) {
      if (info.sessionId === previousSessionId || info.sessionId === previousCanonical) {
        info.sessionId = canonicalSessionId;
      }
    }

    return canonicalSessionId;
  }

  function processCodexEvent(data) {
    for (const event of normalizeCodexEvent(data)) dispatchEvent(event);
  }

  function processSessionEntry(entry, context: { sessionId?: string | null; runtimeSessionId?: string | null; transcriptPath?: string | null } = {}) {
    if (!entry || !entry.type) return { sessionId: null };
    const contextSessionId = resolveCodexSessionId(context.sessionId || null);
    const transcriptPath = context.transcriptPath || null;

    switch (entry.type) {
      case 'session_meta': {
        const payload = entry.payload || {};
        const sessionId = payload.id || null;
        if (!sessionId) return { sessionId: null };
        const subagentInfo = getCodexSubagentInfo(payload);
        const parentId = subagentInfo.parentId
          ? (resolveCodexSessionId(subagentInfo.parentId) || subagentInfo.parentId)
          : null;
        dispatchEvent({
          type: 'session.start',
          rawType: 'session_meta',
          raw: entry,
          provider: 'codex',
          sessionId,
          runtimeSessionId: context.runtimeSessionId || null,
          resumeSessionId: sessionId,
          cwd: getCodexWorkspacePath(payload),
          transcriptPath,
          model: payload.model || payload.model_slug || 'codex',
          source: 'startup',
          initialState: 'Waiting',
          isSubagent: subagentInfo.isSubagent,
          parentId,
          agentType: subagentInfo.agentType,
        });
        return { sessionId };
      }

      case 'event_msg': {
        const payload = entry.payload || {};
        const canonicalFromPayload = payload.id || contextSessionId || null;
        const aliasSessionId = payload.thread_id || null;
        const sessionId = canonicalFromPayload || resolveCodexSessionId(aliasSessionId) || null;

        if (aliasSessionId && sessionId && aliasSessionId !== sessionId) adoptCanonicalSessionId(aliasSessionId, sessionId);

        switch (payload.type) {
          case 'task_started':
            if (sessionId) {
              dispatchEvent({
                type: 'prompt.submit',
                rawType: 'task_started',
                raw: entry,
                provider: 'codex',
                sessionId,
                runtimeSessionId: aliasSessionId || sessionId,
                resumeSessionId: canonicalFromPayload || contextSessionId || null,
                transcriptPath,
              });
            }
            return { sessionId };

          case 'agent_message': {
            const inferredSessionId = sessionId || findMostRecentSessionId();
            if (inferredSessionId) {
              dispatchEvent({
                type: 'message',
                rawType: 'agent_message',
                raw: entry,
                provider: 'codex',
                sessionId: inferredSessionId,
                runtimeSessionId: aliasSessionId || inferredSessionId,
                resumeSessionId: canonicalFromPayload || contextSessionId || inferredSessionId,
                transcriptPath,
                text: payload.message || '',
              });
            }
            return { sessionId: inferredSessionId };
          }

          case 'token_count': {
            const inferredSessionId = sessionId || findMostRecentSessionId();
            if (inferredSessionId && payload.info && payload.info.last_token_usage) {
              latestTokenUsageBySession.set(inferredSessionId, payload.info.last_token_usage);
            }
            return { sessionId: inferredSessionId };
          }

          case 'task_complete': {
            const inferredSessionId = sessionId || findMostRecentSessionId();
            if (inferredSessionId) {
              dispatchEvent({
                type: 'turn.complete',
                rawType: 'task_complete',
                raw: entry,
                provider: 'codex',
                sessionId: inferredSessionId,
                runtimeSessionId: aliasSessionId || inferredSessionId,
                resumeSessionId: canonicalFromPayload || contextSessionId || inferredSessionId,
                transcriptPath,
                tokenUsage: latestTokenUsageBySession.get(inferredSessionId) || null,
                lastAssistantMessage: payload.last_agent_message || null,
              });
            }
            return { sessionId: inferredSessionId };
          }

          default:
            return { sessionId: sessionId || findMostRecentSessionId() };
        }
      }

      case 'response_item': {
        const payload = entry.payload || {};
        const sessionId = contextSessionId || findMostRecentSessionId();
        if (!sessionId) return { sessionId: null };

        if (payload.type === 'function_call') {
          const parsedArgs = parseJsonMaybe(payload.arguments);
          pendingFunctionCalls.set(payload.call_id, { sessionId, name: payload.name || 'tool', args: parsedArgs });
          dispatchEvent({
            type: 'tool.start',
            rawType: 'function_call',
            raw: entry,
            provider: 'codex',
            sessionId,
            transcriptPath,
            toolName: payload.name || 'tool',
            toolInput: parsedArgs,
          });
          return { sessionId };
        }

        if (payload.type === 'function_call_output') {
          const info = pendingFunctionCalls.get(payload.call_id) || { sessionId, name: 'tool', args: null };
          pendingFunctionCalls.delete(payload.call_id);
          dispatchEvent({
            type: 'tool.end',
            rawType: 'function_call_output',
            raw: entry,
            provider: 'codex',
            sessionId: info.sessionId || sessionId,
            transcriptPath,
            toolName: info.name,
            toolInput: info.args,
          });
          return { sessionId: info.sessionId || sessionId };
        }

        if (payload.type === 'message') {
          const outputText = Array.isArray(payload.content)
            ? payload.content.find((item) => item.type === 'output_text')?.text || ''
            : '';
          if (outputText) {
            dispatchEvent({
              type: 'message',
              rawType: 'message',
              raw: entry,
              provider: 'codex',
              sessionId,
              transcriptPath,
              text: outputText,
            });
          }
          return { sessionId };
        }

        return { sessionId };
      }

      default:
        return { sessionId: null };
    }
  }

  function parseJsonMaybe(value) {
    if (!value || typeof value !== 'string') return value || null;
    try { return JSON.parse(value); } catch { return { raw: value }; }
  }

  function findMostRecentSessionId() {
    const agents = agentManager ? agentManager.getAllAgents().filter((agent) => agent.provider === 'codex') : [];
    if (agents.length === 0) return null;
    agents.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    return agents[0].sessionId || agents[0].id;
  }

  function endSession(sessionId, reason = 'ended') {
    ignoredSessions.clear(sessionId);
    dispatchEvent({
      type: 'session.end',
      rawType: 'session.end',
      raw: { reason },
      provider: 'codex',
      sessionId,
      reason,
    });
  }

  function attachRegisteredAgent(registryAgent) {
    const sessionId = processor.attachRegisteredAgent ? processor.attachRegisteredAgent(registryAgent) : null;
    if (sessionId) ignoredSessions.clear(sessionId);
    return sessionId;
  }

  return {
    processCodexEvent,
    processSessionEntry,
    endSession,
    attachRegisteredAgent,
    flushPendingStarts: processor.flushPendingStarts,
    cleanup: processor.cleanup,
    setTaskCompletionHandler(fn) { taskCompletionHandler = typeof fn === 'function' ? fn : null; },
    get firstToolUseDone() { return processor.firstToolUseDone; },
  };
}

module.exports = { createCodexProcessor, normalizeCodexEvent };
