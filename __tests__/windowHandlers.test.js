const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');

const { electronIpcChannels } = require('../src/shared/contracts/ipc.ts');
const { registerWindowHandlers } = require('../src/main/ipc/window.ts');

jest.mock('fs');

describe('window IPC handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('get-avatars replies with the shared avatar catalog file list', () => {
    const listeners = new Map();
    ipcMain.on.mockImplementation((channel, handler) => {
      listeners.set(channel, handler);
    });

    fs.readFileSync.mockReturnValue(JSON.stringify({
      allFiles: ['Origin/avatar_0.webp', 'Custom/avatar_1.webp'],
    }));

    registerWindowHandlers({
      agentManager: null,
      windowManager: {},
      debugLog: jest.fn(),
      adaptAgentToDashboard: (agent) => agent,
      errorHandler: { capture: jest.fn() },
    });

    const event = { reply: jest.fn() };
    listeners.get(electronIpcChannels.getAvatars)(event);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('assets', 'shared', 'avatars.json')),
      'utf8',
    );
    expect(event.reply).toHaveBeenCalledWith(electronIpcChannels.avatarsResponse, [
      'Origin/avatar_0.webp',
      'Custom/avatar_1.webp',
    ]);
  });

  test('get-avatars falls back to an empty array when the shared catalog read fails', () => {
    const listeners = new Map();
    ipcMain.on.mockImplementation((channel, handler) => {
      listeners.set(channel, handler);
    });

    const debugLog = jest.fn();
    const errorHandler = { capture: jest.fn() };
    fs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    registerWindowHandlers({
      agentManager: null,
      windowManager: {},
      debugLog,
      adaptAgentToDashboard: (agent) => agent,
      errorHandler,
    });

    const event = { reply: jest.fn() };
    listeners.get(electronIpcChannels.getAvatars)(event);

    expect(errorHandler.capture).toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith(expect.stringContaining('get-avatars error'));
    expect(event.reply).toHaveBeenCalledWith(electronIpcChannels.avatarsResponse, []);
  });
});
