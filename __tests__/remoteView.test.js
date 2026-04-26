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

function createRemoteSnapshot(baseUrl = 'https://central.example.test', configOverrides = {}) {
  return {
    config: { baseUrl, workerConnectionStatus: 'connected', ...configOverrides },
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
      onHostRecoveryToggle: jest.fn(),
      onHostResetAccess: jest.fn(),
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
      removeItem: jest.fn(),
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
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: jest.fn((bytes) => {
          bytes.fill(1);
          return bytes;
        }),
      },
    });

    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'local',
      roomSecretConfigured: false,
      workerTokenConfigured: false,
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
      if (path === '/api/server/room-access/invite') {
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
    delete global.crypto;
  });

  test('renders the local-only panel state from the remote store model', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'local',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('type="radio"');
    expect(markup).toContain('name="remoteMode"');
    expect(markup).toContain('Local Only is active');
    expect(markup).not.toContain('Host server');
    expect(markup).not.toContain('Status');
  });

  test('renders only the host controls when persisted mode is host', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Share this office');
    expect(markup).toContain('Update Server');
    expect(markup).toContain('Create Invite Link');
    expect(markup).toContain('Status');
    expect(markup).toContain('Connected devices');
    expect(markup).toContain('https://central.example.test');
    expect(markup).not.toContain('Join a host');
  });

  test('renders an owner-access recovery state instead of a blank host invite state', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({
        publicMode: false,
        ownerSecretSet: true,
        ownerSecretState: 'set',
      }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Owner access required');
    expect(markup).toContain('another owner credential');
    expect(markup).toContain('Switch to Local Only');
    expect(markup).not.toContain('No one can join until you create an invite link.');
    expect(markup).not.toContain('Create Invite Link');
  });

  test('shows loopback recovery controls and an access-required worker bridge state for host access loss', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'http://127.0.0.1:47823',
      },
      hostRecoveryExpanded: true,
      roomAccess: createRoomAccess({
        publicMode: false,
        ownerSecretSet: true,
        ownerSecretState: 'set',
      }),
      serverUrlDraft: 'http://127.0.0.1:47823',
      snapshot: createRemoteSnapshot('http://127.0.0.1:47823', {
        workerConnectionStatus: 'disconnected',
      }),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Hide Recovery Options');
    expect(markup).toContain('Reset Host Access');
    expect(markup).toContain('access required');
    expect(markup).not.toContain('>error<');
  });

  test('hides reset controls when host access is missing on a non-loopback server', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({
        publicMode: false,
        ownerSecretSet: true,
        ownerSecretState: 'set',
      }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).not.toContain('Show Recovery Options');
    expect(markup).not.toContain('Reset Host Access');
  });

  test('renders only the guest controls when persisted mode is guest', () => {
    const { updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'guest',
        roomSecretConfigured: true,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();

    expect(markup).toContain('Join a host');
    expect(markup).toContain('Switch Invite');
    expect(markup).not.toContain('Share this office');
  });

  test('draft mode selection does not persist until the host action runs', async () => {
    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'local',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
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

  test('creating an invite uses the dedicated invite endpoint on supported servers', async () => {
    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({ publicMode: false, ownerSecretSet: true, guestSecretSet: false }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const actions = createRemoteViewActions();
    await actions.onHostEnable();

    expect(global.fetch).toHaveBeenCalledWith('/api/server/room-access/invite', expect.objectContaining({
      method: 'POST',
    }));
    expect(getRemoteViewState().lastIssuedGuestSecret).toBe('guest-secret');
    expect(global.localStorage.setItem).toHaveBeenCalledWith(
      'ao-host-invite-link',
      'http://localhost:3000/#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test',
    );
    expect(getRemoteViewState().remoteActionError).toBe('');
  });

  test('renders and copies the stored host invite link after the remote view reloads', () => {
    const inviteLink = 'http://localhost:3000/#aoGuestSecret=stored-guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test';
    global.localStorage.getItem.mockImplementation((key) => (
      key === 'ao-host-invite-link' ? inviteLink : null
    ));

    const { createRemoteViewActions, resetRemoteViewState, updateRemoteViewState } = loadRemoteModules();
    resetRemoteViewState();
    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({
        publicMode: true,
        guestSecretSet: true,
        ownerSecretSet: true,
      }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const markup = renderRemotePanelMarkup();
    expect(markup).toContain(inviteLink.replace(/&/g, '&amp;'));
    expect(markup).not.toContain('does not have a current invite link');

    createRemoteViewActions().onCopyInvite();
    expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith(inviteLink);
  });

  test('creating an invite falls back to enable and rotate only when invite returns 404', async () => {
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            guestSecretSet: true,
            ownerSecretSet: true,
          }),
        };
      }
      if (path === '/api/server/room-access/invite') {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'route not found' } }),
        };
      }
      if (path === '/api/server/room-access/enable') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            guestSecretSet: false,
            ownerSecretSet: true,
          }),
        };
      }
      if (path === '/api/server/room-access/guest-secret/rotate') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            guestSecret: 'rotated-guest-secret',
            guestSecretSet: true,
            ownerSecretSet: true,
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: true,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess({ publicMode: false, ownerSecretSet: true, guestSecretSet: true }),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const actions = createRemoteViewActions();
    await actions.onHostEnable();

    expect(global.fetch).toHaveBeenCalledWith('/api/server/room-access/invite', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).toHaveBeenCalledWith('/api/server/room-access/enable', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).toHaveBeenCalledWith('/api/server/room-access/guest-secret/rotate', expect.objectContaining({
      method: 'POST',
    }));
    expect(getRemoteViewState().lastIssuedGuestSecret).toBe('rotated-guest-secret');
    expect(getRemoteViewState().remoteActionError).toBe('');
  });

  test('invite creation reports a server contract error when guestSecret is missing', async () => {
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: true,
          json: async () => createRoomAccess(),
        };
      }
      if (path === '/api/server/room-access/invite') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            ownerSecret: 'owner-secret',
            ownerSecretSet: true,
            guestSecretSet: true,
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const actions = createRemoteViewActions();
    await actions.onHostEnable();

    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      remoteMode: 'host',
      roomSecret: 'owner-secret',
    });
    expect(getRemoteViewState().lastIssuedGuestSecret).toBe('');
    expect(getRemoteViewState().remoteActionError).toBe('Server contract error: invite response is missing guestSecret');
  });

  test('invite creation does not fall back on owner-access failures', async () => {
    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'host',
      roomSecretConfigured: false,
      workerTokenConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: false,
          json: async () => ({ error: { message: 'authentication required' } }),
        };
      }
      if (path === '/api/server/room-access/invite') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'forbidden' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'https://central.example.test',
      },
      roomAccess: createRoomAccess(),
      serverUrlDraft: 'https://central.example.test',
      snapshot: createRemoteSnapshot(),
    });

    const actions = createRemoteViewActions();
    await actions.onHostEnable();

    expect(global.fetch).toHaveBeenCalledWith('/api/server/room-access/invite', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).not.toHaveBeenCalledWith('/api/server/room-access/enable', expect.anything());
    expect(global.fetch).not.toHaveBeenCalledWith('/api/server/room-access/guest-secret/rotate', expect.anything());
    expect(getRemoteViewState().remoteActionError).toContain('another owner credential');
  });

  test('resetting host access bootstraps fresh local secrets for a loopback host', async () => {
    let fillValue = 1;
    global.crypto.getRandomValues.mockImplementation((bytes) => {
      bytes.fill(fillValue);
      fillValue += 1;
      return bytes;
    });
    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'host',
      roomSecretConfigured: true,
      workerTokenConfigured: false,
      baseUrl: 'http://127.0.0.1:47823',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue(createRemoteSnapshot('http://127.0.0.1:47823', {
      workerConnectionStatus: 'connected',
    }));
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access/bootstrap') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            ownerSecretSet: true,
            guestSecretSet: true,
            ownerSecretState: 'set',
            guestSecretState: 'set',
          }),
        };
      }
      if (path === '/api/server/room-access') {
        return {
          ok: true,
          json: async () => createRoomAccess({
            publicMode: true,
            ownerSecretSet: true,
            guestSecretSet: true,
            ownerSecretState: 'set',
            guestSecretState: 'set',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { createRemoteViewActions, getRemoteViewState, updateRemoteViewState } = loadRemoteModules();

    updateRemoteViewState({
      config: {
        remoteMode: 'host',
        roomSecretConfigured: false,
        workerTokenConfigured: false,
        baseUrl: 'http://127.0.0.1:47823',
      },
      hostRecoveryExpanded: true,
      roomAccess: createRoomAccess({
        publicMode: false,
        ownerSecretSet: true,
        ownerSecretState: 'set',
      }),
      serverUrlDraft: 'http://127.0.0.1:47823',
      snapshot: createRemoteSnapshot('http://127.0.0.1:47823', {
        workerConnectionStatus: 'disconnected',
      }),
    });

    const actions = createRemoteViewActions();
    await actions.onHostResetAccess();

    const bootstrapCall = global.fetch.mock.calls.find(([path]) => path === '/api/server/room-access/bootstrap');
    expect(bootstrapCall).toBeTruthy();
    const bootstrapBody = JSON.parse(bootstrapCall[1].body);
    expect(bootstrapBody.ownerSecret).toMatch(/^ao_[0-9a-f]{64}$/);
    expect(bootstrapBody.guestSecret).toMatch(/^ao_[0-9a-f]{64}$/);
    expect(bootstrapBody.ownerSecret).not.toBe(bootstrapBody.guestSecret);
    expect(serverConnection.saveCentralServerConfig).toHaveBeenCalledWith({
      remoteMode: 'host',
      roomSecret: bootstrapBody.ownerSecret,
    });
    expect(getRemoteViewState().lastIssuedGuestSecret).toBe(bootstrapBody.guestSecret);
    expect(getRemoteViewState().hostRecoveryExpanded).toBe(false);
    expect(getRemoteViewState().hostRecoveryInProgress).toBe(false);
    expect(getRemoteViewState().remoteActionError).toBe('');
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
        workerTokenConfigured: false,
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
    expect(getRemoteViewState().remoteActionError).toContain('does not have host access');
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
        workerTokenConfigured: false,
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

  test('refreshing host mode surfaces owner-access recovery guidance when room access is unauthorized', async () => {
    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'host',
      roomSecretConfigured: false,
      workerTokenConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        return {
          ok: false,
          json: async () => ({ error: { message: 'authentication required' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { refreshRemoteViewData, getRemoteViewState } = loadRemoteModules();
    await refreshRemoteViewData();

    expect(getRemoteViewState().roomAccess).toBeNull();
    expect(getRemoteViewState().remoteActionError).toContain('another owner credential');
    expect(getRemoteViewState().remoteActionError).toContain('restore the owner secret');
  });

  test('refreshing guest mode skips owner-only room access polling', async () => {
    serverConnection.fetchCentralServerConfig.mockResolvedValue({
      remoteMode: 'guest',
      roomSecretConfigured: true,
      workerTokenConfigured: false,
      baseUrl: 'https://central.example.test',
    });
    serverConnection.fetchCentralServerSnapshot.mockResolvedValue(createRemoteSnapshot('https://central.example.test', {
      remoteMode: 'guest',
    }));
    global.fetch = jest.fn(async (path) => {
      if (path === '/api/server/room-access') {
        throw new Error('Guest mode should not request room access');
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });

    const { refreshRemoteViewData, getRemoteViewState } = loadRemoteModules();
    await refreshRemoteViewData();

    expect(global.fetch).not.toHaveBeenCalledWith('/api/server/room-access', expect.anything());
    expect(getRemoteViewState().roomAccess).toBeNull();
    expect(getRemoteViewState().remoteActionError).toBe('');
  });
