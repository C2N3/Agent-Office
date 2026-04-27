
import * as fs from 'fs';
import * as path from 'path';
import { applyUsage, normalizeTokenUsage } from '../usage';

function parseJsonLines(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getEntryTimestamp(entry) {
  return entry?.timestamp || entry?.created_at || entry?.createdAt || null;
}

function getEntrySessionId(entry) {
  return entry?.sessionId
    || entry?.session_id
    || entry?.thread_id
    || entry?.payload?.id
    || entry?.payload?.thread_id
    || entry?.payload?.session_id
    || null;
}

function ensureDay(days, dateKey) {
  if (!days[dateKey]) {
    days[dateKey] = {
      sessions: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolUses: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      byModel: {},
      projects: [],
      _sessions: new Set(),
      _projects: new Set(),
    };
  }
  return days[dateKey];
}

function detectFileFormat(entries, filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.includes('/.codex/sessions/')) return 'codex';
  if (normalizedPath.includes('/.claude/projects/')) return 'claude';

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'session_meta' || entry.type === 'event_msg' || entry.type === 'response_item') {
      return 'codex';
    }
  }

  return 'claude';
}

function getCodexProjectName(entry) {
  const candidates = [
    entry?.cwd,
    entry?.workspacePath,
    entry?.workspace_path,
    entry?.payload?.cwd,
    entry?.payload?.workspacePath,
    entry?.payload?.workspace_path,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
    const base = path.basename(normalized);
    if (base && base !== '/' && base !== '.') {
      return base;
    }
  }

  return null;
}

function getClaudeProjectName(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const match = normalizedPath.match(/\.claude\/projects\/([^/]+)/);
  if (!match) return null;
  const encoded = match[1];
  const parts = encoded.split('-');
  return parts.length <= 1 ? encoded : (parts[parts.length - 1] || encoded);
}

export function scanFile(scanner, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }

  const offset = scanner.fileOffsets[filePath];
  if (offset && offset.size === stat.size && offset.mtimeMs === stat.mtimeMs) return 0;

  const startByte = offset ? offset.bytesRead : 0;
  if (startByte >= stat.size) {
    if (startByte > stat.size) {
      scanner.fileOffsets[filePath] = { bytesRead: 0, size: 0, mtimeMs: 0 };
      return scanFile(scanner, filePath);
    }
    return 0;
  }

  const fd = fs.openSync(filePath, 'r');
  let buf;
  try {
    buf = Buffer.alloc(stat.size - startByte);
    fs.readSync(fd, buf, 0, buf.length, startByte);
  } finally {
    fs.closeSync(fd);
  }

  const entries = parseJsonLines(buf.toString('utf-8'));
  const format = detectFileFormat(entries, filePath);
  const projectNameFromPath = format === 'claude' ? getClaudeProjectName(filePath) : null;
  let count = 0;
  const sessionSeenInFile = new Set();
  const turnStateBySession = new Map();
  let model = null;
  let codexSessionId = null;
  let codexProjectName = null;

  for (const entry of entries) {
    if (format === 'codex' && entry.type === 'session_meta') {
      const payload = entry.payload || {};
      codexSessionId = payload.id || codexSessionId;
      model = payload.model || payload.model_slug || model;
      codexProjectName = getCodexProjectName(entry) || codexProjectName;
    }

    const timestamp = getEntryTimestamp(entry);
    if (!timestamp || entry.isSidechain) continue;

    const dateKey = timestamp.slice(0, 10);
    if (!dateKey || dateKey.length !== 10) continue;

    const day = ensureDay(scanner.days, dateKey);
    const sessionId = getEntrySessionId(entry) || (format === 'codex' ? codexSessionId : null);
    const projectName = projectNameFromPath || getCodexProjectName(entry) || (format === 'codex' ? codexProjectName : null);
    if (projectName && !day._projects.has(projectName)) {
      day._projects.add(projectName);
      day.projects.push(projectName);
    }

    if (format === 'codex' && sessionId && !sessionSeenInFile.has(sessionId)) {
      sessionSeenInFile.add(sessionId);
      day.sessions++;
      day._sessions.add(sessionId);
    }

    if (format === 'claude' && entry.type === 'user' && sessionId && !day._sessions.has(sessionId)) {
      day._sessions.add(sessionId);
      day.sessions++;
    }

    if (entry.type === 'user' && format === 'claude') {
      day.userMessages++;
    }

    if (entry.type === 'assistant' && entry.message) {
      day.assistantMessages++;
      if (entry.message.model) model = entry.message.model;

      const usage = normalizeTokenUsage(entry.message.usage);
      if (usage) applyUsage(day, usage, model || entry.message.model || null);

      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') day.toolUses++;
        }
      }
    }

    if (format === 'codex') {
      applyCodexCounters(day, entry, sessionId, turnStateBySession, model);
      if (entry.type === 'session_meta') {
        const payload = entry.payload || {};
        model = payload.model || payload.model_slug || model;
      }
    }

    count++;
  }

  scanner.fileOffsets[filePath] = {
    bytesRead: stat.size,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };

  return count;
}

function applyCodexCounters(day, entry, sessionId, turnStateBySession, model) {
  const turnKey = sessionId || '__default__';
  const turnState = turnStateBySession.get(turnKey) || { userSeen: false, assistantSeen: false };
  if (!turnStateBySession.has(turnKey)) turnStateBySession.set(turnKey, turnState);

  if (entry.type === 'event_msg') {
    applyCodexEventMessage(day, entry.payload || {}, turnState, model);
  } else if (entry.type === 'response_item') {
    applyCodexResponseItem(day, entry.payload || {}, turnState);
  }
}

function applyCodexEventMessage(day, payload, turnState, model) {
  switch (payload.type) {
    case 'task_started':
      day.userMessages++;
      turnState.userSeen = true;
      turnState.assistantSeen = false;
      break;
    case 'agent_message':
      if (!turnState.assistantSeen) {
        day.assistantMessages++;
        turnState.assistantSeen = true;
      }
      break;
    case 'token_count': {
      const usage = normalizeTokenUsage(payload.info?.last_token_usage || null);
      if (usage) applyUsage(day, usage, model || payload.model || payload.model_slug || null);
      break;
    }
    case 'task_complete':
      if (turnState.userSeen && !turnState.assistantSeen) {
        day.assistantMessages++;
        turnState.assistantSeen = true;
      }
      turnState.userSeen = false;
      break;
    default:
      break;
  }
}

function applyCodexResponseItem(day, payload, turnState) {
  if (payload.type === 'function_call') {
    day.toolUses++;
  } else if (payload.type === 'message' && !turnState.assistantSeen) {
    day.assistantMessages++;
    turnState.assistantSeen = true;
  }
}
