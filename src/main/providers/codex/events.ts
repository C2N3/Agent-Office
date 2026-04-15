
function getCodexWorkspacePath(data) {
  return data.cwd || data.workspacePath || data.workspace_path || '';
}

function normalizeCodexEvent(data) {
  const sessionId = data.session_id || data.sessionId || data.thread_id;
  const base = {
    sessionId,
    runtimeSessionId: data.thread_id || data.session_id || data.sessionId || null,
    resumeSessionId: data.session_id || data.sessionId || null,
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
      if (!isTrackedCodexTool(item.type)) return [];
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
      if (!isTrackedCodexTool(item.type)) return [];
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
  if (item.type === 'command_execution') return { command: item.command || '' };
  if (item.type === 'web_search') return { query: item.query || '' };
  if (item.type === 'mcp_tool_call') return { tool_name: item.tool_name || null, server: item.server || null };
  if (item.type === 'file_change') return { path: item.path || null };
  return null;
}

module.exports = { getCodexWorkspacePath, normalizeCodexEvent };
