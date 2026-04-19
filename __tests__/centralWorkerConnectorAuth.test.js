class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    FakeWebSocket.instances.push(this);
  }
}

global.WebSocket = FakeWebSocket;

const { CentralWorkerConnector } = require('../src/main/centralWorker/connector.ts');

function startConnector(options = {}) {
  FakeWebSocket.instances = [];
  const connector = new CentralWorkerConnector({
    WebSocketImpl: FakeWebSocket,
    debugLog: jest.fn(),
    onConfigChanged: () => () => {},
    getWorkerEnabled: () => true,
    getAgentSyncEnabled: () => false,
    getBaseUrl: () => options.baseUrl || 'https://central.example.test',
    getToken: () => options.workerToken || '',
    getRoomSecret: () => options.roomSecret || '',
    getRemoteMode: () => options.remoteMode || 'local',
    setStatus: jest.fn(),
  });
  connector.start();
  return FakeWebSocket.instances[0];
}

describe('CentralWorkerConnector host auth', () => {
  test('uses the owner room secret for host mode worker URLs', () => {
    const socket = startConnector({
      remoteMode: 'host',
      workerToken: 'stale-worker-token',
      roomSecret: 'owner-secret',
    });

    expect(socket.url).toBe('wss://central.example.test/api/workers/connect?roomSecret=owner-secret');
  });
});
