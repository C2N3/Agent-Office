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
    querySelector: jest.fn(() => null),
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
      if (path === '/api/server/room-access/enable') {
        return {
          ok: true,
          json: async () => ({
            publicMode: true,
            ownerSecret: 'owner-secret',
            guestSecret: 'guest-secret',
            ownerSecretState: 'set',
            guestSecretState: 'set',
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
    expect(container.innerHTML).toContain('Using Local Only');
    expect(container.innerHTML).not.toContain('Server URL');
    expect(container.innerHTML).not.toContain('Use Local Only</button>');
    expect(container.innerHTML).not.toContain('Central Server Status');
    expect(container.innerHTML).not.toContain('Persistence');
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
    expect(container.innerHTML).toContain('Save Address');
    expect(container.innerHTML).toContain('Open Public Room');
    expect(container.innerHTML).toContain('Status');
    expect(container.innerHTML).toContain('Connected devices');
    expect(container.innerHTML).toContain('https://central.example.test');
    expect(container.innerHTML).not.toContain('Owner:');
    expect(container.innerHTML).not.toContain('Guest:');
    expect(container.innerHTML).not.toContain('Join by invite link');
    expect(container.innerHTML).not.toContain('Workers');
    expect(container.innerHTML).not.toContain('Connection Details');
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
    expect(container.innerHTML).toContain('Use New Invite');
    expect(container.innerHTML).not.toContain('Current Guest Session');
    expect(container.innerHTML).not.toContain('Host room owner');
  });

  test('clicking a mode pill only selects it until the primary action is pressed', async () => {
    const pillListeners = {};
    const hostStartListeners = {};
    const hostPill = {
      dataset: { remoteMode: 'host' },
      addEventListener: jest.fn((event, handler) => {
        pillListeners[event] = handler;
      }),
    };
    const hostStartBtn = {
      addEventListener: jest.fn((event, handler) => {
        hostStartListeners[event] = handler;
      }),
    };
    const localInput = {
      addEventListener: jest.fn(),
    };
    const urlInput = { value: 'https://central.example.test' };
    const errorEl = { textContent: '', style: {} };
    const container = {
      innerHTML: '',
      classList: { contains: jest.fn(() => true) },
      closest: jest.fn(() => null),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn((selector) => {
        if (selector === 'input[name="remoteMode"]') return [localInput];
        if (selector === '.remote-mode-pill[data-remote-mode]') return [hostPill];
        return [];
      }),
    };

    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => {
        if (id === 'remoteView') return container;
        if (id === 'hostStartBtn') return hostStartBtn;
        if (id === 'centralServerUrlInput') return urlInput;
        if (id === 'centralServerUrlError') return errorEl;
        return null;
      }),
    };
    global.window = {
      dispatchEvent: jest.fn(),
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
        pathname: '/',
        search: '',
        hash: '',
      },
      history: { replaceState: jest.fn() },
    };

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
    expect(serverConnection.saveCentralServerConfig).not.toHaveBeenCalled();

    await hostStartListeners.click();

    expect(serverConnection.saveCentralServerConfig).toHaveBeenNthCalledWith(1, {
      baseUrl: 'https://central.example.test',
      remoteMode: 'host',
    });
    expect(serverConnection.saveCentralServerConfig).toHaveBeenNthCalledWith(2, {
      remoteMode: 'host',
      roomSecret: 'owner-secret',
    });
  });

  test('auto-joins guest mode from invite hash without manual paste', async () => {
    const container = createContainer();
    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? container : null)),
    };
    global.window = {
      dispatchEvent: jest.fn(),
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test',
        pathname: '/',
        search: '',
        hash: '#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test',
      },
      history: { replaceState: jest.fn() },
    };

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
    serverConnection.saveCentralServerConfig.mockResolvedValue({});

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();

    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      baseUrl: 'https://central.example.test',
      roomSecret: 'guest-secret',
      remoteMode: 'guest',
    });
    expect(global.window.history.replaceState).toHaveBeenCalled();
  });

  test('saving a host address shows when the saved host access does not match the server', async () => {
    const hostStartListeners = {};
    const hostStartBtn = {
      addEventListener: jest.fn((event, handler) => {
        hostStartListeners[event] = handler;
      }),
    };
    const urlInput = { value: 'https://other.example.test' };
    const errorEl = { textContent: '', style: {} };
    const container = {
      innerHTML: '',
      classList: { contains: jest.fn(() => true) },
      closest: jest.fn(() => null),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
    };
    let roomAccessCallCount = 0;
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        roomAccessCallCount += 1;
        if (roomAccessCallCount === 1) {
          return { ok: true, json: async () => ({ publicMode: true }) };
        }
        return { ok: false, json: async () => ({ error: { message: 'authentication required' } }) };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => {
        if (id === 'remoteView') return container;
        if (id === 'hostStartBtn') return hostStartBtn;
        if (id === 'centralServerUrlInput') return urlInput;
        if (id === 'centralServerUrlError') return errorEl;
        return null;
      }),
    };
    global.window = {
      dispatchEvent: jest.fn(),
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
        pathname: '/',
        search: '',
        hash: '',
      },
      history: { replaceState: jest.fn() },
    };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'host',
      roomSecretConfigured: true,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue({
      config: { baseUrl: 'https://other.example.test' },
      health: null,
      workers: [],
      error: null,
      eventsConnected: false,
    });
    serverConnection.saveCentralServerConfig.mockResolvedValue({});

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();
    await hostStartListeners.click();

    expect(container.innerHTML).toContain('does not accept the current host access');
    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      baseUrl: 'https://other.example.test',
      remoteMode: 'host',
    });
  });

  test('saving a host address ignores transient room-access failures', async () => {
    const hostStartListeners = {};
    const hostStartBtn = {
      addEventListener: jest.fn((event, handler) => {
        hostStartListeners[event] = handler;
      }),
    };
    const urlInput = { value: 'https://central.example.test' };
    const errorEl = { textContent: '', style: {} };
    const container = {
      innerHTML: '',
      classList: { contains: jest.fn(() => true) },
      closest: jest.fn(() => null),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
    };
    let roomAccessCallCount = 0;
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        roomAccessCallCount += 1;
        if (roomAccessCallCount === 1) {
          return { ok: true, json: async () => ({ publicMode: true }) };
        }
        return { ok: false, json: async () => ({ error: { message: 'service unavailable' } }) };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => {
        if (id === 'remoteView') return container;
        if (id === 'hostStartBtn') return hostStartBtn;
        if (id === 'centralServerUrlInput') return urlInput;
        if (id === 'centralServerUrlError') return errorEl;
        return null;
      }),
    };
    global.window = {
      dispatchEvent: jest.fn(),
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
        pathname: '/',
        search: '',
        hash: '',
      },
      history: { replaceState: jest.fn() },
    };

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
    serverConnection.saveCentralServerConfig.mockResolvedValue({});

    const { renderRemoteView } = require('../public/dashboard/remoteView.ts');
    await renderRemoteView();
    await hostStartListeners.click();

    expect(container.innerHTML).not.toContain('does not accept the current host access');
  });
});
