// @ts-nocheck
// -nocheck
/**
 * Heatmap Scanner
 * Scans JSONL transcripts under Claude and Codex session roots to aggregate
 * daily activity statistics (sessions, messages, tool usage, tokens, cost).
 * Provides data for GitHub contribution graph-style heatmap.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexSessionRoots } = require('./main/codexPaths');
const { roundCost, calculateTokenCost, normalizeModelName } = require('./pricing');

const MAX_AGE_DAYS = 400;

function resolvePath(filePath) {
  if (!filePath) return null;
  return filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
}

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

  const input = rawUsage.input_tokens
    ?? rawUsage.inputTokens
    ?? rawUsage.input
    ?? 0;
  const output = rawUsage.output_tokens
    ?? rawUsage.outputTokens
    ?? rawUsage.output
    ?? 0;
  const cacheRead = rawUsage.cache_read_input_tokens
    ?? rawUsage.cached_input_tokens
    ?? rawUsage.cacheRead
    ?? 0;
  const cacheCreate = rawUsage.cache_creation_input_tokens
    ?? rawUsage.cacheCreate
    ?? 0;

  return {
    input,
    output,
    cacheRead,
    cacheCreate,
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
    if (!normalized) continue;
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
  if (parts.length <= 1) return encoded;
  return parts[parts.length - 1] || encoded;
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

class HeatmapScanner {
  /**
   * @param {(msg: string) => void} [debugLog]
   */
  constructor(debugLog = () => {}) {
    this.debugLog = debugLog;
    this.scanInterval = null;

    this.persistDir = path.join(os.homedir(), '.agent-office');
    this.persistFile = path.join(this.persistDir, 'heatmap.json');

    /** @type {Record<string, DayStats>} */
    this.days = {};
    this.lastScan = 0;
    this.fileOffsets = {};

    this._loadPersisted();
  }

  start(intervalMs = 300_000) {
    this.debugLog('[HeatmapScanner] Started');
    this.scanAll();
    this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this._savePersisted();
    this.debugLog('[HeatmapScanner] Stopped');
  }

  async scanAll() {
    const roots = this._getRoots();
    if (roots.length === 0) {
      this.debugLog('[HeatmapScanner] No transcript roots found');
      return;
    }

    const jsonlFiles = [];
    for (const root of roots) {
      jsonlFiles.push(...listJsonlFiles(root));
    }

    const uniqueFiles = [...new Set(jsonlFiles)];
    let newEntries = 0;

    for (const filePath of uniqueFiles) {
      try {
        newEntries += this._scanFile(filePath);
      } catch (e) {
        this.debugLog(`[HeatmapScanner] Error scanning ${filePath}: ${e.message}`);
      }
    }

    this.lastScan = Date.now();
    this._pruneOldDays();

    if (newEntries > 0) {
      this.debugLog(`[HeatmapScanner] Scanned ${uniqueFiles.length} files, ${newEntries} new entries`);
      this._savePersisted();
    }
  }

  getDailyStats() {
    return { days: this.days, lastScan: this.lastScan };
  }

  getRange(startDate, endDate) {
    const result = {};
    for (const [date, stats] of Object.entries(this.days)) {
      if (date >= startDate && date <= endDate) {
        result[date] = stats;
      }
    }
    return result;
  }

  _getRoots() {
    const roots = [];
    const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
    if (fs.existsSync(claudeRoot)) {
      roots.push(claudeRoot);
    }

    for (const codexRoot of getCodexSessionRoots()) {
      roots.push(codexRoot);
    }

    return roots;
  }

  _scanFile(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return 0;
    }

    const offset = this.fileOffsets[filePath];
    if (offset && offset.size === stat.size && offset.mtimeMs === stat.mtimeMs) {
      return 0;
    }

    const startByte = offset ? offset.bytesRead : 0;
    if (startByte >= stat.size) {
      if (startByte > stat.size) {
        this.fileOffsets[filePath] = { bytesRead: 0, size: 0, mtimeMs: 0 };
        return this._scanFile(filePath);
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

    const chunk = buf.toString('utf-8');
    const entries = parseJsonLines(chunk);
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
      if (!timestamp) continue;
      if (entry.isSidechain) continue;

      const dateKey = timestamp.slice(0, 10);
      if (!dateKey || dateKey.length !== 10) continue;

      const day = ensureDay(this.days, dateKey);
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
        const turnState = turnStateBySession.get(sessionId || '__default__') || {
          userSeen: false,
          assistantSeen: false,
        };
        if (!turnStateBySession.has(sessionId || '__default__')) {
          turnStateBySession.set(sessionId || '__default__', turnState);
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

    this.fileOffsets[filePath] = {
      bytesRead: stat.size,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };

    return count;
  }

  _pruneOldDays() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const dateKey of Object.keys(this.days)) {
      if (dateKey < cutoffStr) {
        delete this.days[dateKey];
      }
    }
  }

  _savePersisted() {
    try {
      if (!fs.existsSync(this.persistDir)) {
        fs.mkdirSync(this.persistDir, { recursive: true });
      }

      const serialDays = {};
      for (const [date, stats] of Object.entries(this.days)) {
        const { _sessions, _projects, ...rest } = stats;
        rest.estimatedCost = roundCost(rest.estimatedCost);
        if (rest.byModel) {
          for (const m of Object.keys(rest.byModel)) {
            rest.byModel[m].estimatedCost = roundCost(rest.byModel[m].estimatedCost);
          }
        }
        serialDays[date] = rest;
      }

      const data = {
        days: serialDays,
        lastScan: this.lastScan,
        fileOffsets: this.fileOffsets,
      };

      fs.writeFileSync(this.persistFile, JSON.stringify(data), 'utf-8');
    } catch (e) {
      this.debugLog(`[HeatmapScanner] Failed to save: ${e.message}`);
    }
  }

  _loadPersisted() {
    try {
      if (!fs.existsSync(this.persistFile)) return;
      const raw = fs.readFileSync(this.persistFile, 'utf-8');
      const data = JSON.parse(raw);

      if (data.days) {
        for (const [date, stats] of Object.entries(data.days)) {
          this.days[date] = {
            ...stats,
            byModel: stats.byModel || {},
            _sessions: new Set(),
            _projects: new Set(stats.projects || []),
          };
        }
      }
      if (data.lastScan) this.lastScan = data.lastScan;
      if (data.fileOffsets) this.fileOffsets = data.fileOffsets;

      this.debugLog(`[HeatmapScanner] Loaded ${Object.keys(this.days).length} days from cache`);
    } catch (e) {
      this.debugLog(`[HeatmapScanner] Failed to load cache: ${e.message}`);
    }
  }
}

/**
 * @typedef {Object} DayStats
 * @property {number} sessions
 * @property {number} userMessages
 * @property {number} assistantMessages
 * @property {number} toolUses
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} estimatedCost
 * @property {Record<string, {inputTokens: number, outputTokens: number, estimatedCost: number}>} byModel
 * @property {string[]} projects
 */

/**
 * @typedef {Object} FileOffset
 * @property {number} bytesRead
 * @property {number} size
 * @property {number} mtimeMs
 */

module.exports = HeatmapScanner;
