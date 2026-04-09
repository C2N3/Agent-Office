/**
 * Codex exec --json event adapter.
 */

const { createEventProcessor } = require('./eventProcessor');

function getCodexWorkspacePath(data) {
  return data.cwd || data.workspacePath || data.workspace_path || '';
}

function normalizeCodexEvent(data) {
  const sessionId = data.session_id || data.sessionId || data.thread_id;
  const base = {
    sessionId,
    cwd: getCodexWorkspacePath(data),
    model: data.model || 'codex',
    provider: 'codex',
    raw: data,
    rawType: data.type || 'unknown',
  };

  switch (data.type) {
    case 'thread.started':
      return [{ ...base, type: 'session.start', initialState: 'Waiting' }];

    case 'turn.started':
      return [{ ...base, type: 'prompt.submit' }];

    case 'turn.completed':
      return [{ ...base, type: 'turn.complete', tokenUsage: data.usage || null }];

    case 'turn.failed':
      return [{ ...base, type: 'tool.error', toolName: 'turn', reason: data.error || data.message || 'turn_failed' }];

    case 'error':
      return [{ ...base, type: 'tool.error', toolName: 'codex', reason: data.message || 'error' }];

    case 'exec.completed':
      return [{ ...base, type: 'session.end', reason: data.reason || 'exec_completed' }];

    case 'item.started':
    case 'item.updated': {
      const item = data.item || {};
      if (!isTrackedCodexTool(item.type)) {
        return [];
      }
      return [{
        ...base,
        type: 'tool.start',
        toolName: mapCodexToolName(item),
        toolInput: extractCodexToolInput(item),
      }];
    }

    case 'item.completed': {
      const item = data.item || {};
      if (item.type === 'agent_message') {
        return [{ ...base, type: 'message', text: item.text || '' }];
      }
      if (!isTrackedCodexTool(item.type)) {
        return [];
      }
      return [{
        ...base,
        type: item.status === 'failed' ? 'tool.error' : 'tool.end',
        toolName: mapCodexToolName(item),
        toolInput: extractCodexToolInput(item),
      }];
    }

    default:
      return sessionId ? [{ ...base, type: 'unknown' }] : [];
  }
}

function isTrackedCodexTool(itemType) {
  return [
    'command_execution',
    'web_search',
    'mcp_tool_call',
    'file_change',
  ].includes(itemType);
}

function mapCodexToolName(item) {
  switch (item.type) {
    case 'command_execution':
      return 'Command';
    case 'web_search':
      return 'WebSearch';
    case 'mcp_tool_call':
      return item.server || item.tool_name || 'MCP';
    case 'file_change':
      return 'Patch';
    default:
      return item.type || null;
  }
}

function extractCodexToolInput(item) {
  if (item.type === 'command_execution') {
    return { command: item.command || '' };
  }
  if (item.type === 'web_search') {
    return { query: item.query || '' };
  }
  if (item.type === 'mcp_tool_call') {
    return { tool_name: item.tool_name || null, server: item.server || null };
  }
  if (item.type === 'file_change') {
    return { path: item.path || null };
  }
  return null;
}

function createCodexProcessor({ agentManager, agentRegistry, sessionPids, debugLog, detectPidByTranscript = null }) {
  const processor = createEventProcessor({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript,
    logPrefix: 'Codex',
    createSource: 'codex',
    updateSource: 'codex',
  });
  const pendingFunctionCalls = new Map(); // callId -> { sessionId, name, args }
  const latestTokenUsageBySession = new Map();

  function resolveCodexSessionId(sessionId) {
    return processor.resolveSessionId ? processor.resolveSessionId(sessionId) : sessionId;
  }

  function adoptCanonicalSessionId(previousSessionId, nextSessionId) {
    const canonicalSessionId = processor.adoptSessionIdentity
      ? processor.adoptSessionIdentity(previousSessionId, nextSessionId)
      : nextSessionId;

    if (!previousSessionId || !canonicalSessionId || previousSessionId === canonicalSessionId) {
      return canonicalSessionId;
    }

    const previousCanonical = resolveCodexSessionId(previousSessionId);
    if (latestTokenUsageBySession.has(previousCanonical) && !latestTokenUsageBySession.has(canonicalSessionId)) {
      latestTokenUsageBySession.set(canonicalSessionId, latestTokenUsageBySession.get(previousCanonical));
    }
    latestTokenUsageBySession.delete(previousSessionId);
    latestTokenUsageBySession.delete(previousCanonical);

    for (const info of pendingFunctionCalls.values()) {
      if (info.sessionId === previousSessionId || info.sessionId === previousCanonical) {
        info.sessionId = canonicalSessionId;
      }
    }

    return canonicalSessionId;
  }

  function processCodexEvent(data) {
    const events = normalizeCodexEvent(data);
    for (const event of events) {
      processor.processEvent(event);
    }
  }

function processSessionEntry(entry, context = {}) {
    if (!entry || !entry.type) return { sessionId: null };
    const contextSessionId = resolveCodexSessionId(context.sessionId || null);
    const transcriptPath = context.transcriptPath || null;

    switch (entry.type) {
      case 'session_meta': {
        const payload = entry.payload || {};
        const sessionId = payload.id || null;
        if (!sessionId) return { sessionId: null };
        processor.processEvent({
          type: 'session.start',
          rawType: 'session_meta',
          raw: entry,
          provider: 'codex',
          sessionId,
          cwd: getCodexWorkspacePath(payload),
          transcriptPath,
          model: payload.model || payload.model_slug || 'codex',
          source: 'startup',
          initialState: 'Waiting',
        });
        return { sessionId };
      }

      case 'event_msg': {
        const payload = entry.payload || {};
        const canonicalFromPayload = payload.id || contextSessionId || null;
        const aliasSessionId = payload.thread_id || null;
        const sessionId = canonicalFromPayload || resolveCodexSessionId(aliasSessionId) || null;

        if (aliasSessionId && sessionId && aliasSessionId !== sessionId) {
          adoptCanonicalSessionId(aliasSessionId, sessionId);
        }

        switch (payload.type) {
          case 'task_started':
            if (sessionId) {
              processor.processEvent({
                type: 'prompt.submit',
                rawType: 'task_started',
                raw: entry,
                provider: 'codex',
                sessionId,
                transcriptPath,
              });
            }
            return { sessionId };

          case 'agent_message': {
            const inferredSessionId = sessionId || findMostRecentSessionId();
            if (inferredSessionId) {
              processor.processEvent({
                type: 'message',
                rawType: 'agent_message',
                raw: entry,
                provider: 'codex',
                sessionId: inferredSessionId,
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
              processor.processEvent({
                type: 'turn.complete',
                rawType: 'task_complete',
                raw: entry,
                provider: 'codex',
                sessionId: inferredSessionId,
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
          processor.processEvent({
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
          processor.processEvent({
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
            processor.processEvent({
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
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }

  function findMostRecentSessionId() {
    const agents = agentManager ? agentManager.getAllAgents().filter((agent) => agent.provider === 'codex') : [];
    if (agents.length === 0) return null;
    agents.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    return agents[0].sessionId || agents[0].id;
  }

  function endSession(sessionId, reason = 'ended') {
    processor.processEvent({
      type: 'session.end',
      rawType: 'session.end',
      raw: { reason },
      provider: 'codex',
      sessionId,
      reason,
    });
  }

  return {
    processCodexEvent,
    processSessionEntry,
    endSession,
    attachRegisteredAgent: processor.attachRegisteredAgent,
    flushPendingStarts: processor.flushPendingStarts,
    cleanup: processor.cleanup,
    get firstToolUseDone() { return processor.firstToolUseDone; },
  };
}

module.exports = { createCodexProcessor, normalizeCodexEvent };
