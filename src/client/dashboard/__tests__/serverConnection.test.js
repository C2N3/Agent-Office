describe('central server connection adapter', () => {
  let eventSources;

  class MockEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      this.listeners = new Map();
      this.onopen = null;
      this.onerror = null;
      eventSources.push(this);
    }

    addEventListener(eventName, listener) {
      const listeners = this.listeners.get(eventName) || [];
      listeners.push(listener);
      this.listeners.set(eventName, listeners);
    }

    close() {
      this.closed = true;
    }

    emit(eventName) {
      for (const listener of this.listeners.get(eventName) || []) {
        listener();
      }
    }
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    eventSources = [];
    global.EventSource = MockEventSource;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ remoteMode: 'host' }),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.EventSource;
    delete global.fetch;
  });

  test('notifies subscribers when the SSE connection changes', async () => {
    const {
      startCentralServerConnection,
      stopCentralServerConnection,
      subscribeCentralServerConnection,
    } = require('../serverConnection.ts');
    const listener = jest.fn();

    subscribeCentralServerConnection(listener);
    await startCentralServerConnection();

    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toBe('/api/server/events');

    eventSources[0].onopen();
    jest.advanceTimersByTime(249);
    expect(listener).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);

    eventSources[0].emit('worker.heartbeat');
    jest.advanceTimersByTime(250);
    expect(listener).toHaveBeenCalledTimes(2);

    stopCentralServerConnection();
    expect(eventSources[0].closed).toBe(true);
  });

  test('guest mode avoids opening an SSE connection and still requests a refresh', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ remoteMode: 'guest' }),
    }));
    const {
      startCentralServerConnection,
      subscribeCentralServerConnection,
    } = require('../serverConnection.ts');
    const listener = jest.fn();

    subscribeCentralServerConnection(listener);
    await startCentralServerConnection();

    expect(eventSources).toHaveLength(0);
    jest.advanceTimersByTime(250);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
