const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

jest.mock('tree-kill', () => jest.fn());
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    accessSync: jest.fn((candidate) => {
      if (candidate === '/opt/homebrew/bin/codex') return;
      throw new Error('not found');
    }),
  };
});

import { ProcessManager } from '../src/main/orchestrator/processManager';

function makeChild(pid = 1234) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  return child;
}

describe('ProcessManager', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn.mockReturnValue(makeChild());
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  test('uses the current Windows runtime for auto execution', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const manager = new ProcessManager({ debugLog: jest.fn() });
    await manager.spawn('task-1', {
      command: 'codex',
      args: ['exec', '--full-auto'],
      cwd: 'D:/workspace/Agent-Office',
      executionEnvironment: 'auto',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--full-auto'],
      expect.objectContaining({
        cwd: 'D:/workspace/Agent-Office',
        shell: true,
      }),
    );
  });

  test('adds common macOS CLI paths for GUI-launched Electron', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const originalPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/bin';

    try {
      const manager = new ProcessManager({ debugLog: jest.fn() });
      await manager.spawn('task-mac', {
        command: 'codex',
        args: ['exec', '--full-auto'],
        cwd: '/workspace/Agent-Office',
        executionEnvironment: 'auto',
      });

      const options = mockSpawn.mock.calls[0][2];
      expect(mockSpawn.mock.calls[0][0]).toBe('/opt/homebrew/bin/codex');
      expect(options.env.PATH.split(':')).toEqual(expect.arrayContaining([
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Applications/Codex.app/Contents/Resources',
      ]));
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('wraps task commands with wsl.exe when WSL is selected on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const debugLog = jest.fn();
    const manager = new ProcessManager({ debugLog });
    await manager.spawn('task-2', {
      command: 'codex',
      args: ['exec', '--full-auto'],
      cwd: 'D:/workspace/Agent-Office',
      executionEnvironment: 'wsl',
    });

    const [command, args, options] = mockSpawn.mock.calls[0];
    expect(command).toBe('wsl.exe');
    expect(args).toEqual([
      '--cd', '/mnt/d/workspace/Agent-Office',
      '--exec', 'bash', '-lc',
      'export LANG="${LANG:-C.UTF-8}"; exec "$0" "$@"',
      'codex',
      'exec', '--full-auto',
    ]);
    expect(options).toEqual(expect.objectContaining({
      cwd: undefined,
      shell: false,
    }));
    expect(debugLog).toHaveBeenCalledWith(expect.stringContaining('Spawning via WSL'));
  });
});
