const path = require('path');
const os = require('os');

const mockFiles = new Map();

jest.mock('fs', () => ({
  existsSync: jest.fn((filePath) => mockFiles.has(filePath)),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn((filePath) => {
    if (!mockFiles.has(filePath)) throw new Error(`ENOENT: ${filePath}`);
    return mockFiles.get(filePath);
  }),
  writeFileSync: jest.fn((filePath, content) => {
    mockFiles.set(filePath, String(content));
  }),
  unlinkSync: jest.fn((filePath) => {
    mockFiles.delete(filePath);
  }),
}));

const CONFIG_DIR = path.join(os.homedir(), '.agent-office');
const ROOM_SECRET_FILE = path.join(CONFIG_DIR, 'central-room-secret.txt');
const REMOTE_MODE_FILE = path.join(CONFIG_DIR, 'central-remote-mode.txt');

function loadModule() {
  jest.resetModules();
  return require('../src/main/centralWorker/config.ts');
}

describe('centralWorker config room secret roles', () => {
  beforeEach(() => {
    mockFiles.clear();
    jest.clearAllMocks();
  });

  test('guest secret is ignored in host mode and restored when switching back', () => {
    const config = loadModule();

    config.saveCentralServerConfig({ remoteMode: 'guest', roomSecret: 'guest-secret' });
    expect(config.getCentralRoomSecret()).toBe('guest-secret');
    expect(config.isCentralRoomSecretConfigured()).toBe(true);

    config.saveCentralServerConfig({ remoteMode: 'host' });
    expect(config.getCentralRoomSecret()).toBe('');
    expect(config.isCentralRoomSecretConfigured()).toBe(false);

    config.saveCentralServerConfig({ remoteMode: 'guest' });
    expect(config.getCentralRoomSecret()).toBe('guest-secret');
    expect(config.isCentralRoomSecretConfigured()).toBe(true);
  });

  test('host secret is ignored in guest mode and restored when switching back', () => {
    const config = loadModule();

    config.saveCentralServerConfig({ remoteMode: 'host', roomSecret: 'owner-secret' });
    expect(config.getCentralRoomSecret()).toBe('owner-secret');
    expect(config.isCentralRoomSecretConfigured()).toBe(true);

    config.saveCentralServerConfig({ remoteMode: 'guest' });
    expect(config.getCentralRoomSecret()).toBe('');
    expect(config.isCentralRoomSecretConfigured()).toBe(false);

    config.saveCentralServerConfig({ remoteMode: 'host' });
    expect(config.getCentralRoomSecret()).toBe('owner-secret');
    expect(config.isCentralRoomSecretConfigured()).toBe(true);
  });

  test('legacy host secret still works without a role file', () => {
    mockFiles.set(REMOTE_MODE_FILE, 'host\n');
    mockFiles.set(ROOM_SECRET_FILE, 'legacy-owner\n');

    const config = loadModule();

    expect(config.getRemoteMode()).toBe('host');
    expect(config.getCentralRoomSecret()).toBe('legacy-owner');
    expect(config.isCentralRoomSecretConfigured()).toBe(true);
  });

  test('legacy local secret is not reused after switching to host', () => {
    mockFiles.set(REMOTE_MODE_FILE, 'local\n');
    mockFiles.set(ROOM_SECRET_FILE, 'legacy-guest\n');

    const config = loadModule();

    expect(config.getCentralRoomSecret()).toBe('legacy-guest');
    config.saveCentralServerConfig({ remoteMode: 'host' });
    expect(config.getCentralRoomSecret()).toBe('');
    expect(config.isCentralRoomSecretConfigured()).toBe(false);
  });
});
