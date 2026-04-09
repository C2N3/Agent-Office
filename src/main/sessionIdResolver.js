const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveTranscriptPath(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;
  return transcriptPath.startsWith('~')
    ? path.join(os.homedir(), transcriptPath.slice(1))
    : transcriptPath;
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

function getCodexSessionIdFromEntry(entry) {
  return entry?.payload?.id
    || entry?.sessionId
    || entry?.session_id
    || entry?.thread_id
    || entry?.payload?.thread_id
    || entry?.payload?.session_id
    || null;
}

function readCodexSessionIdFromTranscript(transcriptPath, fallbackSessionId = null) {
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

function resolveResumeSessionId({ provider, requestedSessionId, transcriptPath }) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider !== 'codex') return requestedSessionId || null;
  return readCodexSessionIdFromTranscript(transcriptPath, requestedSessionId || null);
}

module.exports = {
  resolveResumeSessionId,
  readCodexSessionIdFromTranscript,
  parseJsonLines,
};
