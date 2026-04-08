/**
 * Codex session file monitor.
 * Watches ~/.codex/sessions JSONL files and feeds live session updates into the Codex processor.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexSessionRoots } = require('./codexPaths');

const DISCOVERY_INTERVAL_MS = 5000;
const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000;

function getCodexSessionsRoot() {
  return path.join(os.homedir(), '.codex', 'sessions');
}

function listJsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];

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

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
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

function createCodexSessionMonitor({
  codexProcessor,
  agentManager,
  debugLog,
  sessionRoot,
  activeWindowMs = ACTIVE_SESSION_WINDOW_MS
}) {
  const trackedFiles = new Map(); // filePath -> { position, sessionId, lastMtimeMs }
  let intervalId = null;

  function getSessionRoots() {
    if (Array.isArray(sessionRoot)) return sessionRoot;
    if (typeof sessionRoot === 'string' && sessionRoot.trim()) return [sessionRoot];
    return getCodexSessionRoots();
  }

  function discoverCandidates() {
    const now = Date.now();
    const allFiles = getSessionRoots().flatMap((root) => listJsonlFiles(root));
    const threadId = process.env.CODEX_THREAD_ID || null;

    return allFiles.filter((filePath) => {
      if (threadId && filePath.includes(threadId)) {
        return true;
      }
      const stat = safeStat(filePath);
      if (!stat) return false;
      return (now - stat.mtimeMs) <= activeWindowMs;
    });
  }

  function ingestEntry(entry, tracked) {
    const result = codexProcessor.processSessionEntry(entry, {
      sessionId: tracked.sessionId,
      transcriptPath: tracked.filePath,
    });
    if (result && result.sessionId) {
      tracked.sessionId = result.sessionId;
    }
  }

  function initializeFile(filePath) {
    const stat = safeStat(filePath);
    if (!stat) return;

    const tracked = {
      position: 0,
      sessionId: null,
      lastMtimeMs: stat.mtimeMs,
      filePath,
    };

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entries = parseJsonLines(content);
      for (const entry of entries) {
        ingestEntry(entry, tracked);
      }
      tracked.position = Buffer.byteLength(content);
      trackedFiles.set(filePath, tracked);
      debugLog(`[Codex] Session file attached: ${path.basename(filePath)}`);
    } catch (error) {
      debugLog(`[Codex] Failed to initialize ${filePath}: ${error.message}`);
    }
  }

  function readAppended(filePath, tracked) {
    const stat = safeStat(filePath);
    if (!stat) {
      cleanupTrackedFile(filePath, tracked);
      return;
    }

    if (stat.size < tracked.position) {
      tracked.position = 0;
    }

    if (stat.size === tracked.position) {
      tracked.lastMtimeMs = stat.mtimeMs;
      return;
    }

    try {
      const fd = fs.openSync(filePath, 'r');
      const length = stat.size - tracked.position;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, tracked.position);
      fs.closeSync(fd);

      const content = buffer.toString('utf-8');
      const entries = parseJsonLines(content);
      for (const entry of entries) {
        ingestEntry(entry, tracked);
      }

      tracked.position = stat.size;
      tracked.lastMtimeMs = stat.mtimeMs;
    } catch (error) {
      debugLog(`[Codex] Failed to read updates from ${filePath}: ${error.message}`);
    }
  }

  function cleanupTrackedFile(filePath, tracked) {
    trackedFiles.delete(filePath);
    if (tracked && tracked.sessionId && agentManager && agentManager.getAgent(tracked.sessionId)) {
      codexProcessor.endSession(tracked.sessionId, 'session_file_stale');
    }
  }

  function sweepInactiveFiles(candidateSet) {
    const now = Date.now();
    for (const [filePath, tracked] of trackedFiles.entries()) {
      if (candidateSet.has(filePath)) continue;

      const age = now - tracked.lastMtimeMs;
      if (age < activeWindowMs) continue;
      cleanupTrackedFile(filePath, tracked);
    }
  }

  function scan() {
    const candidates = discoverCandidates();
    const candidateSet = new Set(candidates);

    for (const filePath of candidates) {
      const tracked = trackedFiles.get(filePath);
      if (!tracked) {
        initializeFile(filePath);
      } else {
        readAppended(filePath, tracked);
      }
    }

    sweepInactiveFiles(candidateSet);
  }

  function start() {
    if (intervalId) return;
    debugLog('[Codex] Session monitor started');
    scan();
    intervalId = setInterval(scan, DISCOVERY_INTERVAL_MS);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    trackedFiles.clear();
    debugLog('[Codex] Session monitor stopped');
  }

  return { start, stop, scan };
}

module.exports = { createCodexSessionMonitor, getCodexSessionsRoot };
