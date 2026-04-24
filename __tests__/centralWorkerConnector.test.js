class FakeWebSocket {
  static instances = [];
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;

  constructor(url, options) {
    this.url = url; this.options = options; this.readyState = FakeWebSocket.CONNECTING; this.sent = [];
    this.listeners = new Map(); this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    this.CONNECTING = 0; this.OPEN = 1; this.CLOSING = 2; this.CLOSED = 3;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    this.listeners.set(name, listeners.filter((current) => {
      return current !== listener && current.originalListener !== listener;
    }));
  }

  on(name, listener) {
    const wrapped = name === 'message'
      ? (event) => listener(event.data)
      : name === 'close'
        ? (event) => listener(event.code, event.reason)
        : listener;
    wrapped.originalListener = listener;
    this.addEventListener(name, wrapped);
    return this;
  }

  off(name, listener) {
    this.removeEventListener(name, listener);
    return this;
  }

  send(data) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('FakeWebSocket.send called before open');
    }
    this.sent.push(typeof data === 'string' ? data : data.toString());
  }

  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close', { code: 1000, reason: 'closed by test' }); }

  open() { this.readyState = FakeWebSocket.OPEN; this.emit('open', {}); }

  receive(payload) {
    this.emit('message', {
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  }

  emit(name, event) {
    const handler = this[`on${name}`];
    if (typeof handler === 'function') handler(event);
    for (const listener of this.listeners.get(name) || []) listener(event);
  }
}

global.WebSocket = FakeWebSocket;

const centralWorkerModule = require('../src/main/centralWorker/connector');

const CentralWorkerConnector = centralWorkerModule.CentralWorkerConnector || centralWorkerModule.default;
const buildWorkerWebSocketUrl =
  centralWorkerModule.buildWorkerWebSocketUrl ||
  centralWorkerModule.centralHttpUrlToWorkerWebSocketUrl ||
  centralWorkerModule.toWorkerWebSocketUrl ||
  centralWorkerModule.httpUrlToWorkerWebSocketUrl;

class FakeAgentRegistry {
  constructor(activeAgents = []) {
    this.activeAgents = activeAgents; this.listeners = new Map();
    this.getActiveAgents = jest.fn(() => this.activeAgents);
  }

  on(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener); this.listeners.set(name, listeners);
    return () => this.off(name, listener);
  }

  off(name, listener) {
    const listeners = this.listeners.get(name) || [];
    this.listeners.set(name, listeners.filter((current) => current !== listener));
  }

  emit(name, payload) {
    for (const listener of this.listeners.get(name) || []) listener(payload);
  }
}

function registeredAgent(overrides = {}) {
  return {
    id: 'agent-1',
    name: 'Planner',
    role: 'planning',
    projectPath: '/Users/minijay/workspace/Agent-Office',
    avatarIndex: 3,
    provider: 'codex',
    model: 'gpt-5',
    workspace: {
      type: 'git-worktree', repositoryName: 'Agent-Office',
      repositoryPath: '/Users/minijay/workspace/Agent-Office',
      worktreePath: '/Users/minijay/workspace/Agent-Office',
      branch: 'feat/central-worker-tests',
    },
    ...overrides,
  };
}

function sent(socket, type) {
  const messages = socket.sent.map((message) => JSON.parse(message));
  return type ? messages.filter((message) => message.type === type) : messages;
}

function makeConnector(options = {}) {
  const registry = options.agentRegistry || new FakeAgentRegistry(options.activeAgents || []);
  const setStatus = options.setStatus || jest.fn();
  const connector = new CentralWorkerConnector({
    workerId: options.workerId || 'worker-pc-a',
    agentRegistry: registry,
    heartbeatIntervalMs: 5000,
    debugLog: jest.fn(),
    WebSocketImpl: FakeWebSocket,
    getBaseUrl: () => options.centralServerUrl || 'http://central.example.test',
    getToken: () => options.workerToken ?? 'worker-token',
    getRoomSecret: () => options.roomSecret || '',
    getRemoteMode: () => options.remoteMode || 'local',
    getWorkerEnabled: () => true,
    getAgentSyncEnabled: () => options.agentSyncEnabled ?? true,
    onConfigChanged: () => () => {},
    setStatus,
  });
  return { connector, registry, setStatus };
}

describe('central worker WebSocket URL helper', () => {
  test('converts http central server URLs to worker ws endpoint URLs', () => {
    expect(typeof buildWorkerWebSocketUrl).toBe('function');
    expect(buildWorkerWebSocketUrl('http://127.0.0.1:47823'))
      .toBe('ws://127.0.0.1:47823/api/workers/connect');
  });

  test('converts https central server URLs to worker wss endpoint URLs', () => {
    expect(buildWorkerWebSocketUrl('https://central.example.test'))
      .toBe('wss://central.example.test/api/workers/connect');
  });

  test('uses roomSecret in guest mode worker URLs', () => {
    expect(buildWorkerWebSocketUrl('https://central.example.test', '', 'guest-secret'))
      .toBe('wss://central.example.test/api/workers/connect?roomSecret=guest-secret');
  });
});

describe('CentralWorkerConnector', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-19T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('sends worker.hello first and worker.heartbeat on the configured interval', () => {
    const { connector } = makeConnector();
    connector.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    const hello = sent(socket)[0];
    expect(hello).toEqual(expect.objectContaining({
      type: 'worker.hello',
      workerId: 'worker-pc-a',
      userId: 'local',
      displayName: expect.any(String),
      hostname: expect.any(String),
      platform: `${process.platform}/${process.arch}`,
      protocolVersion: 1,
    }));
    expect(hello.capabilities).toEqual(expect.arrayContaining([
      'heartbeat:v1',
      'agent-sync:v1',
      'agent-office:electron-client',
    ]));
    expect(hello.capabilities).not.toEqual(expect.arrayContaining([
      'task:headless',
      'provider:codex',
      'provider:claude',
      'provider:gemini',
    ]));

    const beforeInterval = sent(socket, 'worker.heartbeat').length;
    jest.advanceTimersByTime(5000);
    const heartbeats = sent(socket, 'worker.heartbeat');
    expect(heartbeats).toHaveLength(beforeInterval + 1);
    expect(heartbeats[heartbeats.length - 1]).toEqual(expect.objectContaining({
      type: 'worker.heartbeat',
      workerId: 'worker-pc-a',
      protocolVersion: 1,
      runningTasks: 0,
      timestamp: Date.parse('2026-04-19T00:00:05.000Z'),
    }));
    connector.stop();
  });

  test('sends active registered agent snapshot as agent.upsert after connecting', () => {
    const { connector, registry } = makeConnector({ activeAgents: [registeredAgent()] });
    connector.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    const upserts = sent(socket, 'agent.upsert');
    expect(registry.getActiveAgents).toHaveBeenCalled();
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toEqual(expect.objectContaining({
      type: 'agent.upsert',
      workerId: 'worker-pc-a',
      protocolVersion: 1,
      id: 'agent-1',
      projectId: 'project_agent-office',
      roomId: 'default',
      name: 'Planner',
      role: 'planning',
      provider: 'codex',
      model: 'gpt-5',
      avatar: { assetId: 'index:3' },
    }));
    expect(upserts[0].workspace).toEqual(expect.objectContaining({
      projectId: 'project_agent-office',
      workerId: 'worker-pc-a',
      branch: 'feat/central-worker-tests',
      localRef: '/Users/minijay/workspace/Agent-Office',
      label: 'Agent-Office',
    }));
    connector.stop();
  });

  test('sends agent.upsert and agent.remove for registry update and remove events', () => {
    const { connector, registry } = makeConnector();
    connector.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    registry.emit('agent.updated', registeredAgent({
      id: 'agent-2',
      name: 'Reviewer',
      role: 'review',
      avatarIndex: 5,
      provider: 'claude',
      model: 'claude-sonnet-4-5',
    }));
    registry.emit('agent.removed', { id: 'agent-2' });

    expect(sent(socket, 'agent.upsert')).toEqual([
      expect.objectContaining({
        workerId: 'worker-pc-a',
        id: 'agent-2',
        name: 'Reviewer',
        role: 'review',
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        avatar: { assetId: 'index:5' },
      }),
    ]);
    expect(sent(socket, 'agent.remove')).toEqual([
      expect.objectContaining({
        type: 'agent.remove',
        workerId: 'worker-pc-a',
        protocolVersion: 1,
        agentId: 'agent-2',
      }),
    ]);
    connector.stop();
  });

  test('fails server.task.start with an unsupported bridge error', () => {
    const { connector } = makeConnector();
    connector.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ type: 'server.task.start', protocolVersion: 1, taskId: 'task-unsupported-1' });

    expect(sent(socket, 'worker.task.failed')).toEqual([
      expect.objectContaining({
        type: 'worker.task.failed',
        workerId: 'worker-pc-a',
        protocolVersion: 1,
        taskId: 'task-unsupported-1',
        error: expect.stringMatching(/unsupported|not implemented|bridge/i),
        timestamp: Date.parse('2026-04-19T00:00:00.000Z'),
      }),
    ]);
    connector.stop();
  });

  test('uses roomSecret instead of worker token in guest mode', () => {
    const { connector } = makeConnector({
      remoteMode: 'guest',
      roomSecret: 'guest-secret',
      workerToken: 'worker-token',
    });
    connector.start();
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://central.example.test/api/workers/connect?roomSecret=guest-secret');
    connector.stop();
  });

  test('does not reconnect host mode without host access or a worker token', () => {
    const { connector, setStatus } = makeConnector({
      remoteMode: 'host',
      roomSecret: '',
      workerToken: '',
    });
    connector.start();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(setStatus).toHaveBeenCalledWith('error');
    connector.stop();
  });
});
