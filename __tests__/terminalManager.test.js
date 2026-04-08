const fs = require('fs');
const os = require('os');
const path = require('path');

const mockSpawn = jest.fn();

jest.mock('node-pty', () => ({
  spawn: mockSpawn,
}), { virtual: true });

const { TerminalManager } = require('../src/main/terminalManager');

describe('TerminalManager', () => {
  const originalPlatform = process.platform;
  let tempCwd;

  beforeEach(() => {
    jest.clearAllMocks();
    tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-terminal-'));
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    jest.restoreAllMocks();
    fs.rmSync(tempCwd, { recursive: true, force: true });
  });

  test('creates a terminal using the resolved profile command and args', () => {
    const fakePty = {
      pid: 4242,
      onData: jest.fn(),
      onExit: jest.fn(),
    };
    mockSpawn.mockReturnValue(fakePty);

    const terminalProfileService = {
      resolveProfile: jest.fn(() => ({
        id: 'cmd',
        title: 'Command Prompt',
        command: 'C:\\Windows\\System32\\cmd.exe',
        args: ['/k'],
      })),
    };

    const manager = new TerminalManager({
      debugLog: jest.fn(),
      getWindow: () => null,
      terminalProfileService,
    });

    const result = manager.createTerminal('local-1', {
      cwd: tempCwd,
      profileId: 'cmd',
    });

    expect(terminalProfileService.resolveProfile).toHaveBeenCalledWith('cmd');
    expect(mockSpawn).toHaveBeenCalledWith('C:\\Windows\\System32\\cmd.exe', ['/k'], expect.objectContaining({
      cwd: tempCwd,
      name: 'xterm-256color',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      pid: 4242,
      profileId: 'cmd',
      profileLabel: 'Command Prompt',
    }));
  });

  test('converts Windows-accessible WSL mount cwd paths before spawning on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const fakePty = {
      pid: 5150,
      onData: jest.fn(),
      onExit: jest.fn(),
    };
    mockSpawn.mockReturnValue(fakePty);

    jest.spyOn(fs, 'existsSync').mockImplementation((target) => target === 'D:/workspace/Agent-Office');
    jest.spyOn(fs, 'statSync').mockImplementation((target) => {
      if (target !== 'D:/workspace/Agent-Office') {
        throw new Error('not found');
      }
      return { isDirectory: () => true };
    });

    const manager = new TerminalManager({
      debugLog: jest.fn(),
      getWindow: () => null,
      terminalProfileService: null,
    });

    const result = manager.createTerminal('local-2', {
      cwd: '/mnt/d/workspace/Agent-Office',
      shell: 'powershell.exe',
    });

    expect(mockSpawn).toHaveBeenCalledWith('powershell.exe', [], expect.objectContaining({
      cwd: 'D:/workspace/Agent-Office',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      pid: 5150,
    }));
  });
});
