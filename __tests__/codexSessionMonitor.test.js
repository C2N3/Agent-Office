/**
 * codexSessionMonitor.js Tests
 * Keep Codex sessions active during quiet thinking/reading periods.
 */

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  openSync: jest.fn(),
  readSync: jest.fn(),
  closeSync: jest.fn(),
}));

jest.mock('../src/main/providers/codex/paths', () => ({
  getCodexSessionRoots: jest.fn(() => []),
}));

const fs = require('fs');
const path = require('path');
import { getCodexSessionRoots } from '../src/main/providers/codex/paths';
import { createCodexSessionMonitor } from '../src/main/providers/codex/sessionMonitor';

describe('codexSessionMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not mark an active Codex session Done just because the session file is quiet', () => {
    const sessionRoot = path.join('C:', 'codex', 'sessions');
    const sessionLog = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', workspacePath: '/workspace/app' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
      '',
    ].join('\n');

    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockImplementation((dir) => {
      const normalizedDir = dir.replace(/\\/g, '/');
      if (normalizedDir === 'C:/codex/sessions') {
        return [{ isDirectory: () => true, isFile: () => false, name: '2026' }];
      }
      if (normalizedDir === 'C:/codex/sessions/2026') {
        return [{ isDirectory: () => true, isFile: () => false, name: '04' }];
      }
      if (normalizedDir === 'C:/codex/sessions/2026/04') {
        return [{ isDirectory: () => true, isFile: () => false, name: '08' }];
      }
      if (normalizedDir === 'C:/codex/sessions/2026/04/08') {
        return [{ isDirectory: () => false, isFile: () => true, name: 'thread-1.jsonl' }];
      }
      return [];
    });

    const now = Date.now();
    const stats = {
      size: Buffer.byteLength(sessionLog),
      mtimeMs: now,
    };
    fs.statSync.mockReturnValue(stats);
    fs.readFileSync.mockReturnValue(sessionLog);

    const codexProcessor = {
      processSessionEntry: jest.fn((entry) => {
        if (entry.type === 'session_meta') return { sessionId: 'thread-1' };
        return { sessionId: 'thread-1' };
      }),
      endSession: jest.fn(),
    };

    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'thread-1',
        sessionId: 'thread-1',
        provider: 'codex',
        state: 'Thinking',
        currentTool: null,
      })),
      updateAgent: jest.fn(),
    };

    const monitor = createCodexSessionMonitor({
      codexProcessor,
      agentManager,
      debugLog: jest.fn(),
      sessionRoot,
      activeWindowMs: 30 * 60 * 1000,
    });

    monitor.scan();
    monitor.scan();

    expect(codexProcessor.processSessionEntry).toHaveBeenCalled();
    expect(agentManager.updateAgent).not.toHaveBeenCalled();
    expect(codexProcessor.endSession).not.toHaveBeenCalled();
  });

  test('scans auto-detected WSL session roots when no explicit root is provided', () => {
    const sessionRoot = '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex\\sessions';
    const sessionLog = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'thread-wsl', workspacePath: '/workspace/app' } }),
      '',
    ].join('\n');

    getCodexSessionRoots.mockReturnValue([sessionRoot]);
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockImplementation((dir) => {
      const normalizedDir = dir.replace(/\\/g, '/');
      if (normalizedDir === '//wsl.localhost/Ubuntu/home/alice/.codex/sessions') {
        return [{ isDirectory: () => true, isFile: () => false, name: '2026' }];
      }
      if (normalizedDir === '//wsl.localhost/Ubuntu/home/alice/.codex/sessions/2026') {
        return [{ isDirectory: () => true, isFile: () => false, name: '04' }];
      }
      if (normalizedDir === '//wsl.localhost/Ubuntu/home/alice/.codex/sessions/2026/04') {
        return [{ isDirectory: () => true, isFile: () => false, name: '08' }];
      }
      if (normalizedDir === '//wsl.localhost/Ubuntu/home/alice/.codex/sessions/2026/04/08') {
        return [{ isDirectory: () => false, isFile: () => true, name: 'thread-wsl.jsonl' }];
      }
      return [];
    });

    fs.statSync.mockReturnValue({
      size: Buffer.byteLength(sessionLog),
      mtimeMs: Date.now(),
    });
    fs.readFileSync.mockReturnValue(sessionLog);

    const codexProcessor = {
      processSessionEntry: jest.fn(() => ({ sessionId: 'thread-wsl' })),
      endSession: jest.fn(),
    };

    const monitor = createCodexSessionMonitor({
      codexProcessor,
      agentManager: { getAgent: jest.fn(() => null) },
      debugLog: jest.fn(),
      activeWindowMs: 30 * 60 * 1000,
    });

    monitor.scan();

    expect(getCodexSessionRoots).toHaveBeenCalled();
    expect(codexProcessor.processSessionEntry).toHaveBeenCalled();
  });

  describe('session allowlist gate', () => {
    const sessionRoot = '/home/alice/.codex/sessions';

    function mockSessionFile(sessionLog) {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation((dir) => {
        const normalized = dir.replace(/\\/g, '/');
        if (normalized === sessionRoot) {
          return [{ isDirectory: () => false, isFile: () => true, name: 'thread-1.jsonl' }];
        }
        return [];
      });
      fs.statSync.mockReturnValue({ size: Buffer.byteLength(sessionLog), mtimeMs: Date.now() });
      fs.readFileSync.mockReturnValue(sessionLog);
    }

    test('drops all entries when no allowlist match (cwd absent or unknown)', () => {
      const sessionLog = [
        JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/not/allowed' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
        '',
      ].join('\n');
      mockSessionFile(sessionLog);

      const codexProcessor = { processSessionEntry: jest.fn(), endSession: jest.fn() };
      const sessionAllowlist = {
        hasCwd: jest.fn(() => false),
        hasPid: jest.fn(() => false),
      };

      const monitor = createCodexSessionMonitor({
        codexProcessor,
        agentManager: { getAgent: jest.fn(() => null) },
        debugLog: jest.fn(),
        sessionRoot,
        activeWindowMs: 30 * 60 * 1000,
        sessionAllowlist,
        detectPidByTranscript: null,
      });

      monitor.scan();

      expect(codexProcessor.processSessionEntry).not.toHaveBeenCalled();
    });

    test('forwards entries after cwd matches the allowlist', () => {
      const sessionLog = [
        JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/workspace/task' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
        '',
      ].join('\n');
      mockSessionFile(sessionLog);

      const codexProcessor = { processSessionEntry: jest.fn(() => ({ sessionId: 'thread-1' })), endSession: jest.fn() };
      const sessionAllowlist = {
        hasCwd: jest.fn((cwd) => cwd === '/workspace/task'),
        hasPid: jest.fn(() => false),
      };

      const monitor = createCodexSessionMonitor({
        codexProcessor,
        agentManager: { getAgent: jest.fn(() => null) },
        debugLog: jest.fn(),
        sessionRoot,
        activeWindowMs: 30 * 60 * 1000,
        sessionAllowlist,
      });

      monitor.scan();

      expect(codexProcessor.processSessionEntry).toHaveBeenCalled();
    });

    test('allows session when PID resolver reports an allowlisted pid before session_meta', () => {
      const sessionLog = [
        // No session_meta on first flush — only event_msg
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
        '',
      ].join('\n');
      mockSessionFile(sessionLog);

      const codexProcessor = { processSessionEntry: jest.fn(() => ({ sessionId: 'thread-1' })), endSession: jest.fn() };
      const sessionAllowlist = {
        hasCwd: jest.fn(() => false),
        hasPid: jest.fn((pid) => pid === 4242),
      };
      const detectPidByTranscript = jest.fn((_path, cb) => cb(4242));

      const monitor = createCodexSessionMonitor({
        codexProcessor,
        agentManager: { getAgent: jest.fn(() => null) },
        debugLog: jest.fn(),
        sessionRoot,
        activeWindowMs: 30 * 60 * 1000,
        sessionAllowlist,
        detectPidByTranscript,
      });

      monitor.scan();

      expect(detectPidByTranscript).toHaveBeenCalled();
      expect(codexProcessor.processSessionEntry).toHaveBeenCalled();
    });
  });
});
