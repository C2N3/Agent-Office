const fs = require('fs');
const os = require('os');
const path = require('path');

import {
  resolveResumeSessionId,
  readCodexSessionIdFromTranscript,
  findCodexSessionIdFromRoots,
  extractCodexSessionIdFromTranscriptPath,
} from '../src/main/sessionIdResolver';

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

  test('extracts the codex session id from the transcript filename when the file is unavailable', () => {
    const transcriptPath = '~/.codex/sessions/2026/04/09/rollout-2026-04-09T09-37-33-019d6fac-41ae-78f0-acfc-4113d1f614d1.jsonl';

    expect(extractCodexSessionIdFromTranscriptPath(transcriptPath)).toBe('019d6fac-41ae-78f0-acfc-4113d1f614d1');
    expect(resolveResumeSessionId({
      provider: 'codex',
      requestedSessionId: 'thread-session',
      transcriptPath,
    })).toBe('019d6fac-41ae-78f0-acfc-4113d1f614d1');
  });

  test('falls back to codex session roots when the requested id matches a real run id', () => {
    const sessionRoot = path.join(tempDir, '.codex', 'sessions', '2026', '04', '09');
    fs.mkdirSync(sessionRoot, { recursive: true });

    const filePath = path.join(
      sessionRoot,
      'rollout-2026-04-09T09-37-33-019d6fac-41ae-78f0-acfc-4113d1f614d1.jsonl'
    );
    fs.writeFileSync(filePath, [
      JSON.stringify({
        type: 'session_meta',
        payload: {
          id: '019d6fac-41ae-78f0-acfc-4113d1f614d1',
          cwd: 'D:\\workspace\\Agent-Office',
        },
      }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
    ].join('\n'));

    expect(findCodexSessionIdFromRoots({
      requestedSessionId: '019d6fac-41ae-78f0-acfc-4113d1f614d1',
      sessionRoots: [path.join(tempDir, '.codex', 'sessions')],
    })).toBe('019d6fac-41ae-78f0-acfc-4113d1f614d1');

    expect(resolveResumeSessionId({
      provider: 'codex',
      requestedSessionId: '019d6fac-41ae-78f0-acfc-4113d1f614d1',
      transcriptPath: path.join(tempDir, 'missing.jsonl'),
      sessionRoots: [path.join(tempDir, '.codex', 'sessions')],
    })).toBe('019d6fac-41ae-78f0-acfc-4113d1f614d1');
  });

  test('does not guess a different run from project path alone', () => {
    const sessionRoot = path.join(tempDir, '.codex', 'sessions', '2026', '04', '09');
    fs.mkdirSync(sessionRoot, { recursive: true });

    const filePath = path.join(
      sessionRoot,
      'rollout-2026-04-09T09-37-33-019d6fac-41ae-78f0-acfc-4113d1f614d1.jsonl'
    );
    fs.writeFileSync(filePath, [
      JSON.stringify({
        type: 'session_meta',
        payload: {
          id: '019d6fac-41ae-78f0-acfc-4113d1f614d1',
          cwd: 'D:\\workspace\\Agent-Office',
        },
      }),
    ].join('\n'));

    expect(resolveResumeSessionId({
      provider: 'codex',
      requestedSessionId: 'thread-session',
      transcriptPath: path.join(tempDir, 'missing.jsonl'),
      sessionRoots: [path.join(tempDir, '.codex', 'sessions')],
    })).toBe('thread-session');
  });
});
