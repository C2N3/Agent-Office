function makeJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  close() {
    this.closed = true;
  }
}

function installBrowserGlobals() {
  global.localStorage = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
  };
  global.document = {
    getElementById: jest.fn(() => null),
  };
  global.window = {
    addEventListener: jest.fn(),
  };
  global.EventSource = FakeEventSource;
}

async function flushAsyncWork() {
  await new Promise(setImmediate);
  await Promise.resolve();
}

describe('centralAgents', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    FakeEventSource.instances = [];
    installBrowserGlobals();
  });

  afterEach(() => {
    delete global.fetch;
    delete global.localStorage;
    delete global.document;
    delete global.window;
    delete global.EventSource;
    jest.useRealTimers();
  });

  test('central sync helpers are no-ops when sync is disabled', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: false, workerEnabled: false, remoteMode: 'local' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const api = require('../src/client/dashboard/centralAgents/api.ts');

    await expect(api.fetchCentralDashboardAgents()).resolves.toEqual([]);
    await expect(api.syncCentralAgentRecord({ id: 'agent-1', name: 'Local' })).resolves.toBeUndefined();
    await expect(api.syncCentralAgentUpdate('agent-1', { avatarIndex: 2 })).resolves.toBeUndefined();
    await expect(api.syncCentralAgentRemoval('agent-1')).resolves.toBeUndefined();

    expect(global.fetch.mock.calls.every(([url]) => String(url) === '/api/server/config')).toBe(true);
  });

  test('fetchCentralDashboardAgents keeps Go zero-time archivedAt agents and drops archived records', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({
          agentSyncEnabled: true,
          remoteMode: 'guest',
          workerEnabled: true,
          workerId: 'worker-local',
        });
      }
      if (String(url) === '/api/server/agents') {
        return makeJsonResponse({
          agents: [
            {
              id: 'visible-1',
              name: 'Visible',
              projectId: 'project_agent-office',
              createdByParticipantId: 'worker-local',
              archivedAt: '0001-01-01T00:00:00Z',
            },
            {
              id: 'archived-1',
              name: 'Archived',
              projectId: 'project_agent-office',
              archivedAt: '2026-04-26T00:00:00Z',
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const api = require('../src/client/dashboard/centralAgents/api.ts');

    await expect(api.fetchCentralDashboardAgents()).resolves.toEqual([
      expect.objectContaining({
        id: 'visible-1',
        name: 'Visible',
        metadata: expect.objectContaining({ source: 'central' }),
      }),
    ]);
  });

  test('fetchCentralDashboardAgents marks guest-owned central agents renameable only for the current participant', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({
          agentSyncEnabled: true,
          remoteMode: 'guest',
          workerEnabled: true,
          workerId: 'worker-local',
        });
      }
      if (String(url) === '/api/server/agents') {
        return makeJsonResponse({
          agents: [
            { id: 'own-1', name: 'Own', createdByParticipantId: 'worker-local' },
            { id: 'other-1', name: 'Other', createdByParticipantId: 'worker-other' },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const api = require('../src/client/dashboard/centralAgents/api.ts');
    const agents = await api.fetchCentralDashboardAgents();

    expect(agents.find((agent) => agent.id === 'own-1')?.metadata?.canRename).toBe(true);
    expect(agents.find((agent) => agent.id === 'other-1')?.metadata?.canRename).toBe(false);
  });

  test('browser-local sync uploads only local registered agents', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: true, workerEnabled: false, remoteMode: 'local' });
      }
      if (String(url) === '/api/agents') {
        return makeJsonResponse([
          { id: 'local-1', name: 'Local', isRegistered: true, metadata: { source: 'local' }, avatarIndex: 1, provider: 'codex' },
          { id: 'central-1', name: 'Central', isRegistered: true, metadata: { source: 'central' }, avatarIndex: 2, provider: 'codex' },
          { id: 'ephemeral-1', name: 'Ephemeral', isRegistered: false, metadata: {}, avatarIndex: 3, provider: 'codex' },
        ]);
      }
      if (String(url) === '/api/server/agents/bulk-upsert') {
        return makeJsonResponse({
          agents: JSON.parse(options.body).agents,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const api = require('../src/client/dashboard/centralAgents/api.ts');
    await api.syncLocalAgentsToCentral();

    const bulkUpsertCall = global.fetch.mock.calls.find(([url]) => String(url) === '/api/server/agents/bulk-upsert');
    expect(bulkUpsertCall).toBeTruthy();
    const payload = JSON.parse(bulkUpsertCall[1].body);
    expect(payload.agents).toHaveLength(1);
    expect(payload.agents[0]).toEqual(expect.objectContaining({
      id: 'local-1',
      avatar: { assetId: 'index:1' },
    }));
  });

  test('mergeCentralAgent keeps live runtime fields while central display fields win', () => {
    const { state } = require('../src/client/dashboard/shared.ts');
    state.agents.set('agent-1', {
      id: 'agent-1',
      name: 'Local Name',
      status: 'working',
      project: 'local-project',
      avatarIndex: 1,
      provider: 'claude',
      metadata: {
        source: 'local',
        workspace: { repositoryName: 'Local Repo' },
      },
      sessionId: 'session-1',
    });

    const { mergeCentralAgent } = require('../src/client/dashboard/centralAgents/model.ts');
    const merged = mergeCentralAgent({
      id: 'agent-1',
      name: 'Central Name',
      role: 'review',
      provider: 'codex',
      model: 'gpt-5',
      avatar: { assetId: 'index:4' },
      workspace: { label: 'Central Repo', branch: 'main' },
    });

    expect(merged.status).toBe('working');
    expect(merged.sessionId).toBe('session-1');
    expect(merged.name).toBe('Central Name');
    expect(merged.project).toBe('Central Repo');
    expect(merged.provider).toBe('codex');
    expect(merged.avatarIndex).toBe(4);
    expect(merged.metadata).toEqual(expect.objectContaining({
      source: 'central',
      workspace: expect.objectContaining({ repositoryName: 'Central Repo' }),
    }));
  });

  test('startup reconcile clears stale central-backed agents when sync is disabled', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: false, workerEnabled: false, remoteMode: 'local' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { state } = require('../src/client/dashboard/shared.ts');
    state.agents.set('central-1', {
      id: 'central-1',
      status: 'offline',
      metadata: { source: 'central' },
    });
    state.agents.set('local-1', {
      id: 'local-1',
      status: 'working',
      metadata: { source: 'local' },
    });

    const sync = require('../src/client/dashboard/centralAgents/index.ts');
    const upsertAgent = jest.fn();
    const removeAgent = jest.fn();

    sync.startCentralAgentSync({ upsertAgent, removeAgent });
    await flushAsyncWork();

    expect(removeAgent).toHaveBeenCalledWith('central-1');
    expect(upsertAgent).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);

    sync.__resetCentralAgentSyncForTests();
  });

  test('startup reconcile pushes local agents, applies central snapshot, and opens SSE in browser-local sync mode', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: true, workerEnabled: false, remoteMode: 'local' });
      }
      if (String(url) === '/api/agents') {
        return makeJsonResponse([
          { id: 'agent-1', name: 'Local Name', isRegistered: true, status: 'working', metadata: { source: 'local' }, avatarIndex: 0, provider: 'claude' },
        ]);
      }
      if (String(url) === '/api/server/agents/bulk-upsert') {
        return makeJsonResponse({ agents: JSON.parse(options.body).agents });
      }
      if (String(url) === '/api/server/agents') {
        return makeJsonResponse({
          agents: [
            {
              id: 'agent-1',
              name: 'Central Name',
              role: 'planner',
              provider: 'codex',
              model: 'gpt-5',
              avatar: { assetId: 'index:2' },
              workspace: { label: 'Central Repo', branch: 'main' },
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { state } = require('../src/client/dashboard/shared.ts');
    state.agents.set('agent-1', {
      id: 'agent-1',
      name: 'Local Name',
      status: 'working',
      isRegistered: true,
      project: 'local-project',
      metadata: { source: 'local' },
      avatarIndex: 0,
      provider: 'claude',
    });

    const sync = require('../src/client/dashboard/centralAgents/index.ts');
    const upsertAgent = jest.fn();
    const removeAgent = jest.fn();

    sync.startCentralAgentSync({ upsertAgent, removeAgent });
    await flushAsyncWork();

    expect(global.fetch.mock.calls.some(([url]) => String(url) === '/api/agents')).toBe(true);
    expect(global.fetch.mock.calls.some(([url]) => String(url) === '/api/server/agents/bulk-upsert')).toBe(true);
    expect(global.fetch.mock.calls.some(([url]) => String(url) === '/api/server/agents')).toBe(true);
    expect(upsertAgent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-1',
      name: 'Central Name',
      status: 'working',
      project: 'Central Repo',
      provider: 'codex',
      metadata: expect.objectContaining({ source: 'central' }),
    }));
    expect(removeAgent).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);

    sync.__resetCentralAgentSyncForTests();
  });

  test('worker-owned sync skips browser local upsert and removes stale central agents missing from snapshot', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: true, workerEnabled: true, remoteMode: 'host' });
      }
      if (String(url) === '/api/server/agents') {
        return makeJsonResponse({
          agents: [
            { id: 'archived-1', name: 'Archived', archivedAt: '2026-04-19T00:00:00Z' },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { state } = require('../src/client/dashboard/shared.ts');
    state.agents.set('central-stale', {
      id: 'central-stale',
      status: 'offline',
      metadata: { source: 'central' },
    });

    const sync = require('../src/client/dashboard/centralAgents/index.ts');
    const upsertAgent = jest.fn();
    const removeAgent = jest.fn();

    sync.startCentralAgentSync({ upsertAgent, removeAgent });
    await flushAsyncWork();

    expect(global.fetch.mock.calls.some(([url]) => String(url) === '/api/agents')).toBe(false);
    expect(global.fetch.mock.calls.some(([url]) => String(url) === '/api/server/agents/bulk-upsert')).toBe(false);
    expect(removeAgent).toHaveBeenCalledWith('central-stale');
    expect(upsertAgent).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);

    sync.__resetCentralAgentSyncForTests();
  });

  test('guest mode falls back to polling instead of central SSE', async () => {
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    const setIntervalSpy = jest.fn(() => 123);
    global.setInterval = setIntervalSpy;
    global.clearInterval = jest.fn();

    global.fetch = jest.fn(async (url, options) => {
      if (String(url) === '/api/server/config') {
        return makeJsonResponse({ agentSyncEnabled: true, workerEnabled: false, remoteMode: 'guest' });
      }
      if (String(url) === '/api/agents') {
        return makeJsonResponse([]);
      }
      if (String(url) === '/api/server/agents/bulk-upsert') {
        return makeJsonResponse({ agents: JSON.parse(options.body).agents });
      }
      if (String(url) === '/api/server/agents') {
        return makeJsonResponse({ agents: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const sync = require('../src/client/dashboard/centralAgents/index.ts');
    const upsertAgent = jest.fn();
    const removeAgent = jest.fn();

    sync.startCentralAgentSync({ upsertAgent, removeAgent });
    await flushAsyncWork();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(setIntervalSpy).toHaveBeenCalled();

    sync.__resetCentralAgentSyncForTests();

    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });
});
