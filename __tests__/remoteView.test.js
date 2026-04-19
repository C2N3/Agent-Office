jest.mock('../public/dashboard/serverConnection.ts', () => ({
  bindCentralServerControls: jest.fn(),
  fetchCentralServerConfig: jest.fn(),
  fetchCentralServerSnapshot: jest.fn(),
  renderCentralServerCard: jest.fn(() => '<div id="centralServerCard">Central Server</div>'),
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

    expect(container.innerHTML).toContain('Host Mode');
    expect(container.innerHTML).not.toContain('Guest Mode');
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

    expect(container.innerHTML).toContain('Guest Mode');
    expect(container.innerHTML).not.toContain('Host Mode');
    expect(container.innerHTML).not.toContain('Central sync disabled');
  });
});
