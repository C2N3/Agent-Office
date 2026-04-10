// @ts-nocheck
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexSessionRoots } = require('./main/codexPaths');

const MODEL_PRICING = {
  'claude-opus-4-6': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-6': { inputPerMillion: 0.8, outputPerMillion: 4 },
};

function roundCost(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function normalizeModelName(model) {
  return String(model || '').trim().toLowerCase();
}

function calculateTokenCost(usage, model) {
  const pricing = MODEL_PRICING[normalizeModelName(model)];
  if (!pricing) return 0;
  const inputTokens = (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheCreate || 0);
  const outputTokens = usage.output || 0;
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
}

const MAX_AGE_DAYS = 400;

function listJsonlFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
}

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

function normalizeTokenUsage(rawUsage) {
  if (!rawUsage) return null;
  return {
    input: rawUsage.input_tokens ?? rawUsage.inputTokens ?? rawUsage.input ?? 0,
    output: rawUsage.output_tokens ?? rawUsage.outputTokens ?? rawUsage.output ?? 0,
    cacheRead: rawUsage.cache_read_input_tokens ?? rawUsage.cached_input_tokens ?? rawUsage.cacheRead ?? 0,
    cacheCreate: rawUsage.cache_creation_input_tokens ?? rawUsage.cacheCreate ?? 0,
  };
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

function applyUsage(day, usage, model) {
  if (!usage) return;

  const resolvedModel = normalizeModelName(model);
  const inputTokens = usage.input + usage.cacheRead + usage.cacheCreate;
  const entryCost = roundCost(calculateTokenCost({
    input: usage.input,
    cacheRead: usage.cacheRead,
    cacheCreate: usage.cacheCreate,
    output: usage.output,
  }, resolvedModel));

  day.inputTokens += inputTokens;
  day.outputTokens += usage.output;
  day.estimatedCost = roundCost(day.estimatedCost + entryCost);

  if (model) {
    if (!day.byModel[model]) {
      day.byModel[model] = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
    day.byModel[model].inputTokens += inputTokens;
    day.byModel[model].outputTokens += usage.output;
    day.byModel[model].estimatedCost = roundCost(day.byModel[model].estimatedCost + entryCost);
  }
}

function getRoots() {
  const roots = [];
  const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeRoot)) {
    roots.push(claudeRoot);
  }
  const codexEnv = process.env.NODE_ENV === 'test' ? {} : process.env;
  for (const codexRoot of getCodexSessionRoots({ env: codexEnv, homedir: os.homedir() })) {
    roots.push(codexRoot);
  }
  return roots;
}

function scanFile(scanner, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }

  const offset = scanner.fileOffsets[filePath];
  if (offset && offset.size === stat.size && offset.mtimeMs === stat.mtimeMs) {
    return 0;
  }

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
      if (usage) {
        applyUsage(day, usage, model || entry.message.model || null);
      }

      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') day.toolUses++;
        }
      }
    }

    if (format === 'codex') {
      const turnKey = sessionId || '__default__';
      const turnState = turnStateBySession.get(turnKey) || { userSeen: false, assistantSeen: false };
      if (!turnStateBySession.has(turnKey)) {
        turnStateBySession.set(turnKey, turnState);
      }

      if (entry.type === 'session_meta') {
        const payload = entry.payload || {};
        model = payload.model || payload.model_slug || model;
      } else if (entry.type === 'event_msg') {
        const payload = entry.payload || {};
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
            if (usage) {
              applyUsage(day, usage, model || payload.model || payload.model_slug || null);
            }
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
      } else if (entry.type === 'response_item') {
        const payload = entry.payload || {};
        switch (payload.type) {
          case 'function_call':
            day.toolUses++;
            break;
          case 'message':
            if (!turnState.assistantSeen) {
              day.assistantMessages++;
              turnState.assistantSeen = true;
            }
            break;
          default:
            break;
        }
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

function pruneOldDays(scanner) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const dateKey of Object.keys(scanner.days)) {
    if (dateKey < cutoffStr) delete scanner.days[dateKey];
  }
}

function savePersisted(scanner) {
  try {
    if (!fs.existsSync(scanner.persistDir)) {
      fs.mkdirSync(scanner.persistDir, { recursive: true });
    }

    const serialDays = {};
    for (const [date, stats] of Object.entries(scanner.days)) {
      const { _sessions, _projects, ...rest } = stats;
      rest.estimatedCost = roundCost(rest.estimatedCost);
      if (rest.byModel) {
        for (const model of Object.keys(rest.byModel)) {
          rest.byModel[model].estimatedCost = roundCost(rest.byModel[model].estimatedCost);
        }
      }
      serialDays[date] = rest;
    }

    fs.writeFileSync(scanner.persistFile, JSON.stringify({
      days: serialDays,
      lastScan: scanner.lastScan,
      fileOffsets: scanner.fileOffsets,
    }), 'utf-8');
  } catch (e) {
    scanner.debugLog(`[HeatmapScanner] Failed to save: ${e.message}`);
  }
}

function loadPersisted(scanner) {
  try {
    if (!fs.existsSync(scanner.persistFile)) return;
    const data = JSON.parse(fs.readFileSync(scanner.persistFile, 'utf-8'));
    if (data.days) {
      for (const [date, stats] of Object.entries(data.days)) {
        scanner.days[date] = {
          ...stats,
          byModel: stats.byModel || {},
          _sessions: new Set(),
          _projects: new Set(stats.projects || []),
        };
      }
    }
    scanner.lastScan = data.lastScan || 0;
    scanner.fileOffsets = data.fileOffsets || {};
    scanner.debugLog(`[HeatmapScanner] Loaded ${Object.keys(scanner.days).length} day(s)`);
  } catch (e) {
    scanner.debugLog(`[HeatmapScanner] Failed to load persisted data: ${e.message}`);
  }
}

module.exports = {
  getRoots,
  listJsonlFiles,
  scanFile,
  pruneOldDays,
  savePersisted,
  loadPersisted,
};
