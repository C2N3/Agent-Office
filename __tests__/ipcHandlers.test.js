const { ipcMain } = require('electron');
const childProcess = require('child_process');

const { registerIpcHandlers } = require('../src/main/ipcHandlers');

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform');

describe('ipcHandlers focus-terminal recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM);
  });

  test('marks registered agents as stale immediately when pid is missing but the session is resumable', async () => {
    const handlers = new Map();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'registry-1',
        registryId: 'registry-1',
        isRegistered: true,
        state: 'Working',
        sessionId: 'thread-123',
        resumeSessionId: 'thread-123',
        firstSeen: Date.now(),
      })),
      transitionToOffline: jest.fn(),
    };

    const agentRegistry = {
      getAgent: jest.fn(() => ({
        id: 'registry-1',
        currentSessionId: 'thread-123',
        currentResumeSessionId: 'thread-123',
      })),
      getSessionHistory: jest.fn(() => []),
      unlinkSession: jest.fn(),
    };

    const sessionPids = new Map([
      ['registry-1', null],
      ['thread-123', null],
    ]);

    registerIpcHandlers({
      agentManager,
      agentRegistry,
      sessionPids,
      windowManager: {},
      terminalManager: null,
      terminalProfileService: null,
      workspaceManager: null,
      nicknameStore: null,
      debugLog: jest.fn(),
      adaptAgentToDashboard: (agent) => agent,
      errorHandler: { capture: jest.fn() },
      attachRegisteredAgent: null,
    });

    const focusHandler = handlers.get('focus-terminal');
    const result = await focusHandler(null, 'registry-1');

    expect(result).toEqual({ success: false, reason: 'stale-session' });
    expect(agentRegistry.unlinkSession).toHaveBeenCalledWith('registry-1');
    expect(agentManager.transitionToOffline).toHaveBeenCalledWith('registry-1');
    expect(sessionPids.has('registry-1')).toBe(false);
    expect(sessionPids.has('thread-123')).toBe(false);
  });

  test('keeps returning no-pid for unregistered agents without a resumable session', async () => {
    const handlers = new Map();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'ephemeral-1',
        isRegistered: false,
        state: 'Working',
        firstSeen: Date.now(),
      })),
    };

    registerIpcHandlers({
      agentManager,
      agentRegistry: null,
      sessionPids: new Map(),
      windowManager: {},
      terminalManager: null,
      terminalProfileService: null,
      workspaceManager: null,
      nicknameStore: null,
      debugLog: jest.fn(),
      adaptAgentToDashboard: (agent) => agent,
      errorHandler: { capture: jest.fn() },
      attachRegisteredAgent: null,
    });

    const focusHandler = handlers.get('focus-terminal');
    const result = await focusHandler(null, 'ephemeral-1');

    expect(result).toEqual({ success: false, reason: 'no-pid' });
  });

  test('launches an external resume terminal for main-window focus requests when pid is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => ({
      unref: jest.fn(),
    }));

    const handlers = new Map();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'registry-1',
        registryId: 'registry-1',
        isRegistered: true,
        state: 'Working',
        sessionId: 'thread-123',
        resumeSessionId: 'thread-123',
        provider: 'codex',
        projectPath: '/tmp',
        firstSeen: Date.now(),
      })),
      transitionToOffline: jest.fn(),
    };

    const agentRegistry = {
      getAgent: jest.fn(() => ({
        id: 'registry-1',
        provider: 'codex',
        projectPath: '/tmp',
        currentSessionId: 'thread-123',
        currentResumeSessionId: 'thread-123',
      })),
      getSessionHistory: jest.fn(() => [{
        sessionId: 'thread-123',
        resumeSessionId: 'thread-123',
        startedAt: 100,
      }]),
      findSessionHistoryEntry: jest.fn(() => ({
        sessionId: 'thread-123',
        resumeSessionId: 'thread-123',
        startedAt: 100,
      })),
      unlinkSession: jest.fn(),
    };

    registerIpcHandlers({
      agentManager,
      agentRegistry,
      sessionPids: new Map(),
      windowManager: {
        mainWindow: {
          isDestroyed: jest.fn(() => false),
          webContents: { id: 77 },
        },
      },
      terminalManager: null,
      terminalProfileService: {
        resolveProfile: jest.fn(() => ({
          command: 'powershell.exe',
        })),
      },
      workspaceManager: null,
      nicknameStore: null,
      debugLog: jest.fn(),
      adaptAgentToDashboard: (agent) => agent,
      errorHandler: { capture: jest.fn() },
      attachRegisteredAgent: null,
    });

    const focusHandler = handlers.get('focus-terminal');
    const result = await focusHandler({ sender: { id: 77 } }, 'registry-1');

    expect(result).toEqual({ success: true, reason: 'resumed' });
    expect(spawnSpy).toHaveBeenCalledWith(
      'cmd.exe',
      expect.arrayContaining(['powershell.exe', '-NoExit', '-Command', 'Set-Location -LiteralPath \'/tmp\'; codex resume thread-123']),
      expect.objectContaining({
        cwd: '/tmp',
        detached: true,
        stdio: 'ignore',
      })
    );
    expect(agentRegistry.unlinkSession).toHaveBeenCalledWith('registry-1');
    expect(agentManager.transitionToOffline).toHaveBeenCalledWith('registry-1');
  });
});
