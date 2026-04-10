// @ts-nocheck
/**
 * Build a human-readable conversation report for a finished task.
 *
 * The PTY output capture is mostly useless for TUI-based CLIs (Claude Code,
 * Codex) because the TUI draws into the alternate screen buffer — the captured
 * bytes are dominated by ANSI cursor/mode-set sequences and the static welcome
 * banner, not the actual assistant work.
 *
 * Instead, this module reads the agent's JSONL transcript (which the CLI
 * writes to disk anyway) and extracts only the messages whose timestamps fall
 * inside the task's lifetime. The result is plain text — user prompts and
 * assistant replies — with a one-line summary of any tools the assistant used.
 */

'use strict';

const path = require('path');
const { parseConversation } = require('../conversationParser.js');

const TASK_TIME_BUFFER_MS = 60_000;
const MAX_REPORT_CHARS = 20_000;

function buildTaskConversationReport(task, agentRegistry, agentManager) {
  if (!task || !task.agentRegistryId) return '';
  if (!agentRegistry || typeof agentRegistry.getAgent !== 'function') return '';

  const agent = agentRegistry.getAgent(task.agentRegistryId);
  if (!agent) return '';

  const transcriptPath = pickTranscriptPath(agent, agentManager, task);
  if (!transcriptPath) return '';

  const parsed = parseConversation(transcriptPath, {});
  if (!parsed || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return '';
  }

  const filtered = filterMessagesForTask(parsed.messages, task);
  if (filtered.length === 0) return '';

  return formatMessages(filtered);
}

/**
 * Pick the JSONL transcript most likely to contain this task's messages.
 *  1. A session-history entry whose lifetime overlaps the task.
 *  2. The most recent session-history entry with a transcriptPath.
 *  3. The live agentManager record's jsonlPath.
 */
function pickTranscriptPath(agent, agentManager, task) {
  const history = Array.isArray(agent.sessionHistory) ? agent.sessionHistory : [];

  const taskStart = task.startedAt || task.createdAt || 0;
  const taskEnd = task.completedAt || task.updatedAt || Date.now();

  const overlapping = history
    .filter((entry) => entry && entry.transcriptPath)
    .filter((entry) => {
      const start = toMillis(entry.startedAt) || 0;
      const end = toMillis(entry.endedAt) || Date.now();
      // Allow a small buffer on both sides — clock skew between hook and task store.
      return end >= taskStart - TASK_TIME_BUFFER_MS && start <= taskEnd + TASK_TIME_BUFFER_MS;
    })
    .sort((a, b) => (toMillis(b.startedAt) || 0) - (toMillis(a.startedAt) || 0));

  if (overlapping.length > 0) return overlapping[0].transcriptPath;

  const mostRecent = history
    .filter((entry) => entry && entry.transcriptPath)
    .sort((a, b) => (toMillis(b.startedAt) || 0) - (toMillis(a.startedAt) || 0))[0];
  if (mostRecent) return mostRecent.transcriptPath;

  if (agentManager && typeof agentManager.getAgent === 'function') {
    const live = agentManager.getAgent(agent.id);
    if (live && live.jsonlPath) return live.jsonlPath;
  }
  return null;
}

function filterMessagesForTask(messages, task) {
  const taskStart = task.startedAt || task.createdAt || 0;
  const taskEnd = task.completedAt || task.updatedAt || Date.now();
  const lower = taskStart - TASK_TIME_BUFFER_MS;
  const upper = taskEnd + TASK_TIME_BUFFER_MS;

  const inWindow = messages.filter((msg) => {
    if (msg.role !== 'user' && msg.role !== 'assistant') return false;
    const ts = toMillis(msg.timestamp);
    if (!ts) return false;
    return ts >= lower && ts <= upper;
  });

  if (inWindow.length > 0) return inWindow;

  // Fallback: if no timestamps fell in the window (older transcripts may lack
  // them), return the tail of the conversation so the user still sees something.
  const tail = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  return tail.slice(-10);
}

function formatMessages(messages) {
  const blocks = [];
  let charCount = 0;

  for (const msg of messages) {
    const block = formatSingleMessage(msg);
    if (!block) continue;

    if (charCount + block.length > MAX_REPORT_CHARS) {
      blocks.push('\n... (보고서가 너무 길어 일부만 표시합니다)');
      break;
    }
    blocks.push(block);
    charCount += block.length;
  }

  return blocks.join('\n\n').trim();
}

function formatSingleMessage(msg) {
  const text = (msg.content || '').trim();
  const tools = Array.isArray(msg.toolUses) ? msg.toolUses : [];

  if (msg.role === 'user') {
    if (!text) return '';
    return `[사용자]\n${text}`;
  }

  if (msg.role === 'assistant') {
    const parts = ['[어시스턴트]'];
    if (text) parts.push(text);
    if (tools.length > 0) {
      const names = tools.map((t) => t.name || 'tool').join(', ');
      parts.push(`(사용한 도구: ${names})`);
    }
    if (parts.length === 1) return '';
    return parts.join('\n');
  }

  return '';
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = { buildTaskConversationReport };
