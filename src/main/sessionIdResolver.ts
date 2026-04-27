import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCodexSessionRoots } from './providers/codex/paths';
import { normalizeProvider } from './providers/registry';

function resolveTranscriptPath(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;
  return transcriptPath.startsWith('~')
    ? path.join(os.homedir(), transcriptPath.slice(1))
    : transcriptPath;
}

export function extractCodexSessionIdFromTranscriptPath(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;

  const normalizedPath = transcriptPath.replace(/\\/g, '/');
  const basename = normalizedPath.split('/').pop() || '';
  const match = basename.match(
    /(?:^|-)((?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\.jsonl$/i
  );

  return match ? match[1] : null;
}

export function parseJsonLines(content) {
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

function readFirstJsonLine(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const chunkSize = 4096;
    const chunks = [];
    const buffer = Buffer.alloc(chunkSize);
    let bytesRead = 0;
    let newlineIndex = -1;

    do {
      bytesRead = fs.readSync(fd, buffer, 0, chunkSize, null);
      if (!bytesRead) break;

      const chunk = buffer.subarray(0, bytesRead);
      chunks.push(chunk);
      newlineIndex = chunk.indexOf(0x0a);
    } while (newlineIndex === -1);

    if (chunks.length === 0) return null;

    const content = Buffer.concat(chunks).toString('utf-8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim();
    if (!firstLine) return null;
    return JSON.parse(firstLine);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
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

function getCodexSessionIdFromEntry(entry) {
  return entry?.payload?.id
    || entry?.sessionId
    || entry?.session_id
    || entry?.thread_id
    || entry?.payload?.thread_id
    || entry?.payload?.session_id
    || null;
}

export function readCodexSessionIdFromTranscript(transcriptPath, fallbackSessionId = null) {
  const resolvedPath = resolveTranscriptPath(transcriptPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return fallbackSessionId;

  try {
    const entries = parseJsonLines(fs.readFileSync(resolvedPath, 'utf-8'));
    const sessionMeta = entries.find((entry) => entry?.type === 'session_meta');
    if (sessionMeta) {
      return getCodexSessionIdFromEntry(sessionMeta) || fallbackSessionId;
    }

    for (const entry of entries) {
      const sessionId = getCodexSessionIdFromEntry(entry);
      if (sessionId) return sessionId;
    }
  } catch {
    return fallbackSessionId;
  }

  return fallbackSessionId;
}

export function findCodexSessionIdFromRoots({
  requestedSessionId = null,
  sessionRoots = null,
}) {
  const normalizedRequested = String(requestedSessionId || '').trim().toLowerCase();
  const roots = Array.isArray(sessionRoots) ? sessionRoots : getCodexSessionRoots();

  if (!normalizedRequested || roots.length === 0) return null;

  let bestMatch = null;

  for (const root of roots) {
    const files = listJsonlFiles(root);
    for (const filePath of files) {
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      const basename = path.basename(filePath).toLowerCase();
      const firstEntry = readFirstJsonLine(filePath);
      const candidateSessionId = getCodexSessionIdFromEntry(firstEntry) || null;

      let score = 0;
      if (candidateSessionId && candidateSessionId.toLowerCase() === normalizedRequested) {
        score = 400;
      } else if (basename.includes(normalizedRequested)) {
        score = 300;
      }

      if (!score) continue;

      if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && stat.mtimeMs > bestMatch.mtimeMs)) {
        bestMatch = {
          sessionId: candidateSessionId,
          score,
          mtimeMs: stat.mtimeMs,
        };
      }
    }
  }

  return bestMatch?.sessionId || null;
}

/**
 * Encode a cwd into the folder name Claude CLI uses under ~/.claude/projects/.
 * Claude replaces every path separator and dot in the absolute path with '-'.
 * e.g. 'D:\Coding\Project\Agent-Office' -> 'D--Coding-Project-Agent-Office'
 */
export function getClaudeProjectDirForCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  try {
    const absolute = path.resolve(cwd);
    const encoded = absolute.replace(/[\\/:.]/g, '-');
    return path.join(os.homedir(), '.claude', 'projects', encoded);
  } catch {
    return null;
  }
}

/**
 * Resolve a Claude resume session ID against the current cwd's project dir.
 * Claude CLI's --resume is cwd-scoped: it only finds UUIDs under
 * ~/.claude/projects/<encoded-cwd>/. If the requested UUID lives there, return
 * it as-is. Otherwise fall back to the most recently modified .jsonl in that
 * directory (top-level only; subagent jsonls are nested in subdirs).
 */
export function findClaudeResumeSessionIdForCwd({ requestedSessionId, cwd }) {
  const projectDir = getClaudeProjectDirForCwd(cwd);
  if (!projectDir || !fs.existsSync(projectDir)) return null;

  if (requestedSessionId) {
    const candidate = path.join(projectDir, `${requestedSessionId}.jsonl`);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return requestedSessionId;
      }
    } catch {}
  }

  let latestId = null;
  let latestMtime = -1;
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const fullPath = path.join(projectDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestId = entry.name.replace(/\.jsonl$/i, '');
        }
      } catch {}
    }
  } catch {}

  return latestId;
}

export function resolveResumeSessionId({ provider, requestedSessionId, transcriptPath, sessionRoots, cwd }) {
  const normalizedProvider = normalizeProvider(provider, String(provider || '').trim() ? null : undefined);
  if (!normalizedProvider) {
    return requestedSessionId || null;
  }

  if (normalizedProvider === 'codex') {
    const resolvedFromTranscript = readCodexSessionIdFromTranscript(transcriptPath, null);
    if (resolvedFromTranscript) return resolvedFromTranscript;

    const resolvedFromTranscriptPath = extractCodexSessionIdFromTranscriptPath(transcriptPath);
    if (resolvedFromTranscriptPath) return resolvedFromTranscriptPath;

    const resolvedFromRoots = findCodexSessionIdFromRoots({
      requestedSessionId,
      sessionRoots,
    });
    if (resolvedFromRoots) return resolvedFromRoots;

    return requestedSessionId || null;
  }

  // Claude: scope the UUID to the current cwd so a stale ID from a previous
  // workspace doesn't produce "No conversation found".
  if (normalizedProvider === 'claude' && cwd) {
    const resolvedForCwd = findClaudeResumeSessionIdForCwd({ requestedSessionId, cwd });
    if (resolvedForCwd) return resolvedForCwd;
  }

  return requestedSessionId || null;
}
