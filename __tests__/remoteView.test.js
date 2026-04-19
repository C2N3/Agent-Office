jest.mock('../public/dashboard/serverConnection.ts', () => ({
  fetchCentralServerConfig: jest.fn(),
  fetchCentralServerSnapshot: jest.fn(),
  saveCentralServerConfig: jest.fn(),
  startCentralServerConnection: jest.fn(),
  stopCentralServerConnection: jest.fn(),
}));

const serverConnection = require('../public/dashboard/serverConnection.ts');

function createContainer() {
  return {
    innerHTML: '',
    classList: { contains: jest.fn(() => true) },
    closest: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
  };
}

describe('remote view mode rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: true,
          json: async () => ({
            publicMode: false,
            ownerSecretState: 'not set',
            guestSecretState: 'not set',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });
  });

  afterEach(() => {
    delete global.fetch;
    delete global.document;
    delete global.window;
  });

  test('renders the local-only card and radio tabs when remote mode is local', async () => {
    const container = createContainer();
    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? container : null)),
    };
    global.window = { dispatchEvent: jest.fn() };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'local',
      roomSecretConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue({
      config: { baseUrl: 'https://central.example.test' },
      health: null,
      workers: [],
      error: null,
      eventsConnected: false,
    });

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();

    expect(container.innerHTML).toContain('type="radio"');
    expect(container.innerHTML).toContain('name="remoteMode"');
    expect(container.innerHTML).toContain('Central sync disabled');
    expect(container.innerHTML).not.toContain('Server URL');
    expect(container.innerHTML).not.toContain('Central Server Status');
    expect(container.innerHTML).not.toContain('Host Mode');
    expect(container.innerHTML).not.toContain('Guest Mode');
  });

  test('renders only the host card when remote mode is host', async () => {
    const container = createContainer();
    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? container : null)),
    };
    global.window = { dispatchEvent: jest.fn() };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'host',
      roomSecretConfigured: true,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue({
      config: { baseUrl: 'https://central.example.test' },
      health: null,
      workers: [],
      error: null,
      eventsConnected: false,
    });

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();

    expect(container.innerHTML).toContain('Host room owner');
    expect(container.innerHTML).toContain('Rotate Guest');
    expect(container.innerHTML).not.toContain('Join by invite link');
    expect(container.innerHTML).not.toContain('Central sync disabled');
  });

  test('renders only the guest card when remote mode is guest', async () => {
    const container = createContainer();
    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? container : null)),
    };
    global.window = { dispatchEvent: jest.fn() };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'guest',
      roomSecretConfigured: true,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue({
      config: { baseUrl: 'https://central.example.test' },
      health: null,
      workers: [],
      error: null,
      eventsConnected: false,
    });

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();

    expect(container.innerHTML).toContain('Join by invite link');
    expect(container.innerHTML).toContain('Current Guest Session');
    expect(container.innerHTML).not.toContain('Host room owner');
    expect(container.innerHTML).not.toContain('Central sync disabled');
  });

  test('clicking a mode pill saves the selected remote mode', async () => {
    const pillListeners = {};
    const hostPill = {
      dataset: { remoteMode: 'host' },
      addEventListener: jest.fn((event, handler) => {
        pillListeners[event] = handler;
      }),
    };
    const localInput = {
      addEventListener: jest.fn(),
    };
    const container = {
      innerHTML: '',
      classList: { contains: jest.fn(() => true) },
      closest: jest.fn(() => null),
      querySelectorAll: jest.fn((selector) => {
        if (selector === 'input[name="remoteMode"]') return [localInput];
        if (selector === '.remote-mode-pill[data-remote-mode]') return [hostPill];
        return [];
      }),
    };

    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? container : null)),
    };
    global.window = { dispatchEvent: jest.fn() };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'local',
      roomSecretConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue({
      config: { baseUrl: 'https://central.example.test' },
      health: null,
      workers: [],
      error: null,
      eventsConnected: false,
    });
    serverConnection.saveCentralServerConfig.mockResolvedValue({});

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();

    await pillListeners.click({ preventDefault: jest.fn() });

    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({ remoteMode: 'host' });
  });
});
