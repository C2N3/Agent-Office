// @ts-nocheck
// -nocheck
/**
 * Conversation Parser
 * Parses Claude and Codex JSONL transcript files into a structured conversation message array.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resolve transcript path (expand ~ to home directory)
 */
function resolveTranscriptPath(filePath) {
  if (!filePath) return null;
  return filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
}

/**
 * Parse a JSONL transcript file into conversation messages.
 * @param {string} filePath - transcript_path (may include ~/...)
 * @param {object} [options]
 * @param {number} [options.limit] - Max messages to return (from end)
 * @param {number} [options.offset] - Skip this many messages from start
 * @returns {{ messages: Array, totalCount: number, sessionId: string|null } | null}
 */
function parseConversation(filePath, options = {}) {
  const resolved = resolveTranscriptPath(filePath);
  if (!resolved) return null;

  let content;
  try {
    content = fs.readFileSync(resolved, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  const messages = [];
  let sessionId = null;

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Skip sidechain entries (internal compaction)
    if (entry.isSidechain) continue;

    if (isClaudeEntry(entry)) {
      sessionId = sessionId || entry.sessionId || null;
      appendClaudeEntry(messages, entry);
      continue;
    }

    if (isCodexEntry(entry)) {
      sessionId = sessionId || getCodexSessionId(entry);
      appendCodexEntry(messages, entry);
    }
  }

  const totalCount = messages.length;

  // Apply offset and limit
  let result = messages;
  const offset = options.offset || 0;
  if (offset > 0) {
    result = result.slice(offset);
  }
  if (options.limit && options.limit > 0) {
    result = result.slice(-options.limit);
  }

  return { messages: result, totalCount, sessionId };
}

function isClaudeEntry(entry) {
  return entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system';
}

function isCodexEntry(entry) {
  return entry.type === 'session_meta' || entry.type === 'event_msg' || entry.type === 'response_item';
}

function getCodexSessionId(entry) {
  if (entry.type === 'session_meta') {
    return entry.payload && entry.payload.id ? entry.payload.id : null;
  }
  const payload = entry.payload || {};
  return payload.id || payload.thread_id || null;
}

function appendClaudeEntry(messages, entry) {
  if (entry.type === 'user') {
    messages.push({
      role: 'user',
      timestamp: entry.timestamp || null,
      content: extractUserContent(entry),
    });
    return;
  }

  if (entry.type === 'assistant' && entry.message) {
    messages.push({
      role: 'assistant',
      timestamp: entry.timestamp || null,
      model: entry.message.model || null,
      content: extractAssistantContent(entry.message),
      toolUses: extractToolUses(entry.message),
      tokens: extractTokens(entry.message),
    });
    return;
  }

  if (entry.type === 'system') {
    // Include Claude session boundary markers so history views can show session start/end.
    if (entry.subtype === 'SessionEnd' || entry.subtype === 'SessionStart') {
      messages.push({
        role: 'system',
        timestamp: entry.timestamp || null,
        content: entry.subtype,
        sessionId: entry.sessionId || null,
      });
    }
  }
}

function appendCodexEntry(messages, entry) {
  if (entry.type === 'session_meta') {
    const payload = entry.payload || {};
    if (payload.id) {
      messages.push({
        role: 'system',
        timestamp: entry.timestamp || null,
        content: 'Thread started',
        sessionId: payload.id,
      });
    }
    return;
  }

  const payload = entry.payload || {};

  if (entry.type === 'event_msg') {
    switch (payload.type) {
      case 'task_started':
        messages.push({
          role: 'user',
          timestamp: entry.timestamp || null,
          content: payload.message || payload.prompt || payload.input || '',
          sessionId: payload.id || payload.thread_id || null,
        });
        return;

      case 'agent_message':
        messages.push({
          role: 'assistant',
          timestamp: entry.timestamp || null,
          content: payload.message || '',
          sessionId: payload.id || payload.thread_id || null,
        });
        return;

      case 'task_complete':
        if (payload.last_agent_message) {
          const previous = messages[messages.length - 1];
          if (previous && previous.role === 'assistant' && previous.content === payload.last_agent_message) {
            return;
          }
          messages.push({
            role: 'assistant',
            timestamp: entry.timestamp || null,
            content: payload.last_agent_message,
            sessionId: payload.id || payload.thread_id || null,
          });
        }
        return;

      default:
        return;
    }
  }

  if (entry.type === 'response_item') {
    if (payload.type === 'function_call') {
      messages.push({
        role: 'assistant',
        timestamp: entry.timestamp || null,
        content: '',
        toolUses: [{
          name: payload.name || 'tool',
          id: payload.call_id || null,
        }],
        sessionId: payload.id || payload.thread_id || null,
      });
      return;
    }

    if (payload.type === 'message') {
      const outputText = Array.isArray(payload.content)
        ? payload.content.find((item) => item.type === 'output_text')?.text || ''
        : '';
      if (outputText) {
        messages.push({
          role: 'assistant',
          timestamp: entry.timestamp || null,
          content: outputText,
          sessionId: payload.id || payload.thread_id || null,
        });
      }
    }
  }
}

/**
 * Extract text content from user entry
 */
function extractUserContent(entry) {
  // User messages may have message.content array or direct text
  if (entry.message && Array.isArray(entry.message.content)) {
    return entry.message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  if (entry.message && typeof entry.message.content === 'string') {
    return entry.message.content;
  }
  return '';
}

/**
 * Extract text content from assistant message
 */
function extractAssistantContent(message) {
  if (!message.content) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return '';
}

/**
 * Extract tool use info from assistant message
 */
function extractToolUses(message) {
  if (!Array.isArray(message.content)) return [];
  return message.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({
      name: b.name || 'unknown',
      id: b.id || null,
    }));
}

/**
 * Extract token usage from assistant message
 */
function extractTokens(message) {
  const usage = message.usage;
  if (!usage) return null;
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheCreate: usage.cache_creation_input_tokens || 0,
  };
}

/**
 * Get a lightweight summary of a conversation without full parsing.
 * @param {string} filePath
 * @returns {{ messageCount: number, firstAt: string|null, lastAt: string|null } | null}
 */
function getConversationSummary(filePath) {
  const result = parseConversation(filePath);
  if (!result) return null;

  const messages = (result.messages || []).filter((message) => message.role === 'user' || message.role === 'assistant');
  const timestamps = messages.map((message) => message.timestamp).filter(Boolean);

  return {
    messageCount: messages.length,
    firstAt: timestamps.length > 0 ? timestamps[0] : null,
    lastAt: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
  };
}

module.exports = { parseConversation, getConversationSummary, resolveTranscriptPath };
