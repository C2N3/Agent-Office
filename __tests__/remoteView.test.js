jest.mock('../src/client/dashboard/serverConnection.ts', () => ({
  fetchCentralServerConfig: jest.fn(),
  fetchCentralServerSnapshot: jest.fn(),
  saveCentralServerConfig: jest.fn(),
  startCentralServerConnection: jest.fn(),
  stopCentralServerConnection: jest.fn(),
}));

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let serverConnection;

function createRemoteSnapshot(baseUrl = 'https://central.example.test') {
  return {
    config: { baseUrl, workerConnectionStatus: 'connected' },
    error: null,
    eventsConnected: false,
    health: null,
    workers: [],
  };
}

function createRoomAccess(overrides = {}) {
  return {
    publicMode: false,
    ownerSecretSet: false,
    guestSecretSet: false,
    ownerSecretState: 'not set',
    guestSecretState: 'not set',
    ...overrides,
  };
}

function renderRemotePanelMarkup() {
  const { deriveRemoteViewModel } = require('../src/client/dashboard/remote/model.ts');
  const { getRemoteViewState } = require('../src/client/dashboard/remote/store.ts');
  const { RemotePanel } = require('../src/client/dashboard/react/remotePanel.tsx');

  return renderToStaticMarkup(
    React.createElement(RemotePanel, {
      ...deriveRemoteViewModel(getRemoteViewState()),
      onCopyInvite: jest.fn(),
      onGuestInviteChange: jest.fn(),
      onGuestJoin: jest.fn(),
      onHostDisable: jest.fn(),
      onHostEnable: jest.fn(),
      onHostRotate: jest.fn(),
      onHostStart: jest.fn(),
      onLocalApply: jest.fn(),
      onModeSelect: jest.fn(),
      onRefreshStatus: jest.fn(),
      onServerUrlChange: jest.fn(),
      onStatusDetailsToggle: jest.fn(),
    }),
  );
}

function loadRemoteModules() {
  const store = require('../src/client/dashboard/remote/store.ts');
  const controller = require('../src/client/dashboard/remote/controller.ts');
  const actions = require('../src/client/dashboard/remote/actions.ts');
  const polling = require('../src/client/dashboard/remote/polling.ts');
  return { ...store, ...controller, ...actions, ...polling };
}

describe('remote view react boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    serverConnection = require('../src/client/dashboard/serverConnection.ts');

    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.document = {
      activeElement: null,
      getElementById: jest.fn((id) => (id === 'remoteView' ? { id } : null)),
    };
    global.window = {
      dispatchEvent: jest.fn(),
      history: { replaceState: jest.fn() },
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
        pathname: '/',
        search: '',
      },
    };
    global.navigator = {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    };

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'local',
      roomSecretConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue(createRemoteSnapshot());
    serverConnection.saveCentralServerConfig.mockResolvedValue({});

    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: true,
          json: async () => createRoomAccess(),
        };
      }
      if (path === '/api/server/room-access/enable') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            guestSecret: 'guest-secret',
            guestSecretSet: true,
            guestSecretState: 'set',
            ownerSecret: 'owner-secret',
            ownerSecretSet: true,
            ownerSecretState: 'set',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { resetRemoteViewState } = loadRemoteModules();
    resetRemoteViewState();
  });

  afterEach(() => {
    delete global.document;
    delete global.fetch;
    delete global.localStorage;
    delete global.navigator;
    delete global.window;
  });

  test('renders the local-only panel state from the remote store model', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'local',
        roomSecretConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('type="radio"');
    expect(markup).toContain('name="remoteMode"');
    expect(markup).toContain('Using Local Only');
    expect(markup).not.toContain('Server URL');
    expect(markup).not.toContain('Status');
  });

  test('renders only the host controls when persisted mode is host', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Host room owner');
    expect(markup).toContain('Save Address');
    expect(markup).toContain('Open Public Room');
    expect(markup).toContain('Status');
    expect(markup).toContain('Connected devices');
    expect(markup).toContain('https://central.example.test');
    expect(markup).not.toContain('Join by invite link');
  });

  test('renders only the guest controls when persisted mode is guest', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'guest',
        roomSecretConfigured: true,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Join by invite link');
    expect(markup).toContain('Use New Invite');
    expect(markup).not.toContain('Host room owner');
  });

  test('draft mode selection does not persist until the host action runs', async () => {
    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'local',
        roomSecretConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const actions = createRemoteViewActions();
    actions.onModeSelect('host');

    expect(getRemoteViewState().selectedRemoteMode).toBe('host');
    expect(serverConnection.saveCentralServerConfig).not.toHaveBeenCalled();

    await actions.onHostStart();

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
    global.window.location.href = 'http://localhost:3000/#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test';

    const { refreshRemoteViewData } = loadRemoteModules();
    await refreshRemoteViewData();

    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      baseUrl: 'https://central.example.test',
      roomSecret: 'guest-secret',
      remoteMode: 'guest',
    });
    expect(global.window.history.replaceState).toHaveBeenCalled();
  });

  test('saving a host address reports mismatched host access', async () => {
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: false,
          json: async () => ({ error: { message: 'authentication required' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { handleHostStart, updateRemoteViewState, getRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({ publicMode: true }),
      serverUrlDraft: 'https://other.example.test',
      snapshot: createRemoteSnapshot('https://other.example.test'),
    });

    await handleHostStart();

    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      baseUrl: 'https://other.example.test',
      remoteMode: 'host',
    });
    expect(getRemoteViewState().remoteActionError).toContain('does not accept the current host access');
  });

  test('saving a host address ignores transient room-access failures', async () => {
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: false,
          json: async () => ({ error: { message: 'service unavailable' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { handleHostStart, updateRemoteViewState, getRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({ publicMode: true }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    await handleHostStart();

    expect(getRemoteViewState().remoteActionError).toBe('');
  });

  test('renderRemoteView refreshes the remote store without legacy innerHTML rendering', async () => {
    const { renderRemoteView, getRemoteViewState } = loadRemoteModules();

    await renderRemoteView();

    expect(getRemoteViewState().config).toEqual(expect.objectContaining({
      baseUrl: 'https://central.example.test',
      remoteMode: 'local',
    }));
    expect(getRemoteViewState().snapshot).toEqual(expect.objectContaining({
      config: expect.objectContaining({ baseUrl: 'https://central.example.test' }),
    }));
  });
});
