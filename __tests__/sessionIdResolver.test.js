const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveResumeSessionId, readCodexSessionIdFromTranscript } = require('../src/main/sessionIdResolver');

describe('sessionIdResolver', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-session-id-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('keeps non-codex session ids unchanged', () => {
    expect(resolveResumeSessionId({
      provider: 'claude',
      requestedSessionId: 'claude-session',
      transcriptPath: null,
    })).toBe('claude-session');
  });

  test('prefers session_meta payload.id for codex transcripts', () => {
    const transcriptPath = path.join(tempDir, 'codex.jsonl');
    fs.writeFileSync(transcriptPath, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'real-codex-session' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' }, thread_id: 'thread-session' }),
    ].join('\n'));

    expect(readCodexSessionIdFromTranscript(transcriptPath, 'thread-session')).toBe('real-codex-session');
    expect(resolveResumeSessionId({
      provider: 'codex',
      requestedSessionId: 'thread-session',
      transcriptPath,
    })).toBe('real-codex-session');
  });

  test('falls back to the requested id when the transcript is missing', () => {
    expect(resolveResumeSessionId({
      provider: 'codex',
      requestedSessionId: 'thread-session',
      transcriptPath: path.join(tempDir, 'missing.jsonl'),
    })).toBe('thread-session');
  });
});
