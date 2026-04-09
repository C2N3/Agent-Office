// @ts-nocheck
/**
 * Claude hook event adapter.
 * Maintains the existing hookProcessor API while delegating to the shared event processor.
 */

const { createEventProcessor } = require('./eventProcessor');

function normalizeHookEvent(data) {
  const sessionId = data.session_id || data.sessionId;
  const base = {
    sessionId,
    cwd: data.cwd || '',
    transcriptPath: data.transcript_path || null,
    model: data.model || null,
    permissionMode: data.permission_mode || null,
    provider: 'claude',
    raw: data,
    rawType: data.hook_event_name || 'unknown',
  };

  switch (data.hook_event_name) {
    case 'SessionStart':
      return {
        ...base,
        type: 'session.start',
        source: data.source || 'startup',
        agentType: data.agent_type || null,
        pid: data._pid || 0,
      };

    case 'SessionEnd':
      return { ...base, type: 'session.end', reason: data.reason || null };

    case 'UserPromptSubmit':
      return { ...base, type: 'prompt.submit' };

    case 'Stop':
    case 'TaskCompleted':
      return {
        ...base,
        type: 'turn.complete',
        lastAssistantMessage: data.last_assistant_message || null,
      };

    case 'PreToolUse':
      return {
        ...base,
        type: 'tool.start',
        toolName: data.tool_name || null,
        toolInput: data.tool_input || null,
        suppressIfFirst: true,
      };

    case 'PostToolUse':
      return {
        ...base,
        type: 'tool.end',
        toolName: data.tool_name || null,
        toolInput: data.tool_input || null,
        tokenUsage: data.tool_response && data.tool_response.token_usage,
      };

    case 'PostToolUseFailure':
      return { ...base, type: 'tool.error', toolName: data.tool_name || null };

    case 'PermissionRequest':
      return { ...base, type: 'help', toolName: data.tool_name || null };

    case 'Notification': {
      const notifType = data.notification_type;
      return {
        ...base,
        type: 'notification',
        state: notifType === 'permission_prompt' || notifType === 'elicitation_dialog' ? 'Help' : 'Waiting',
      };
    }

    case 'SubagentStart':
      return {
        ...base,
        type: 'subagent.start',
        subagentId: data.agent_id || data.subagent_session_id,
        transcriptPath: data.agent_transcript_path || data.transcript_path || null,
        agentType: data.agent_type || null,
        initialState: 'Working',
      };

    case 'SubagentStop':
      return {
        ...base,
        type: 'subagent.end',
        subagentId: data.agent_id || data.subagent_session_id,
        lastAssistantMessage: data.last_assistant_message || null,
      };

    case 'TeammateIdle':
      return {
        ...base,
        type: 'teammate.idle',
        teammateName: data.teammate_name || null,
        teamName: data.team_name || null,
      };

    case 'PreCompact':
      return {
        ...base,
        type: 'compact.start',
        trigger: data.trigger || 'unknown',
      };

    case 'ConfigChange':
    case 'WorktreeCreate':
    case 'WorktreeRemove':
    case 'InstructionsLoaded':
      return { ...base, type: 'meta' };

    default:
      return { ...base, type: 'unknown' };
  }
}

function createHookProcessor({ agentManager, agentRegistry, sessionPids, debugLog, detectClaudePidByTranscript }) {
  const processor = createEventProcessor({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript: detectClaudePidByTranscript,
    logPrefix: 'Hook',
    createSource: 'http',
    updateSource: 'hook',
  });

  function processHookEvent(data) {
    if (data.hook_event_name === 'TaskCompleted' && data.task_id) {
      debugLog(`[Hook] TaskCompleted: task=${data.task_id} subject="${data.task_subject || ''}" by ${data.teammate_name || (data.session_id || '').slice(0, 8)}`);
    }
    processor.processEvent(normalizeHookEvent(data));
  }

  return {
    processHookEvent,
    handleSessionStart: processor.handleSessionStart,
    handleSessionEnd: processor.handleSessionEnd,
    attachRegisteredAgent: processor.attachRegisteredAgent,
    flushPendingStarts: processor.flushPendingStarts,
    cleanup: processor.cleanup,
    get firstPreToolUseDone() { return processor.firstToolUseDone; },
  };
}

module.exports = { createHookProcessor, normalizeHookEvent };
