/**
 * Conversation Parser
 * Parses Claude JSONL transcript files into a structured conversation message array.
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

    if (entry.type === 'user') {
      const msg = {
        role: 'user',
        timestamp: entry.timestamp || null,
        content: extractUserContent(entry),
      };
      messages.push(msg);
    }

    if (entry.type === 'assistant' && entry.message) {
      const msg = {
        role: 'assistant',
        timestamp: entry.timestamp || null,
        model: entry.message.model || null,
        content: extractAssistantContent(entry.message),
        toolUses: extractToolUses(entry.message),
        tokens: extractTokens(entry.message),
      };
      messages.push(msg);
    }

    if (entry.type === 'system') {
      if (entry.sessionId) sessionId = entry.sessionId;
      // Include session boundary markers
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
  const resolved = resolveTranscriptPath(filePath);
  if (!resolved) return null;

  let content;
  try {
    content = fs.readFileSync(resolved, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n').filter(Boolean);
  let messageCount = 0;
  let firstAt = null;
  let lastAt = null;

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.isSidechain) continue;
    if (entry.type === 'user' || entry.type === 'assistant') {
      messageCount++;
      if (entry.timestamp) {
        if (!firstAt) firstAt = entry.timestamp;
        lastAt = entry.timestamp;
      }
    }
  }

  return { messageCount, firstAt, lastAt };
}

module.exports = { parseConversation, getConversationSummary, resolveTranscriptPath };
