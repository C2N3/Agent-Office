const { ipcMain } = require('electron');

const { registerIpcHandlers } = require('../src/main/ipcHandlers');

describe('ipcHandlers focus-terminal recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
