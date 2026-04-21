function loadPollingWithMocks({ activeElement = null } = {}) {
  const refreshRemoteViewData = jest.fn(() => Promise.resolve());
  const startCentralServerConnection = jest.fn();
  const stopCentralServerConnection = jest.fn();
  const cleanupCentralServerConnection = jest.fn();
  let centralServerListener = null;

  jest.doMock('../controller.ts', () => ({
    refreshRemoteViewData,
  }));

  jest.doMock('../../serverConnection.ts', () => ({
    startCentralServerConnection,
    stopCentralServerConnection,
    subscribeCentralServerConnection: jest.fn((listener) => {
      centralServerListener = listener;
      return cleanupCentralServerConnection;
    }),
  }));

  global.document = {
    activeElement,
    getElementById: jest.fn(),
  };

  const polling = require('../polling.ts');
  return {
    cleanupCentralServerConnection,
    centralServerListener: () => centralServerListener,
    polling,
    refreshRemoteViewData,
    startCentralServerConnection,
    stopCentralServerConnection,
  };
}

describe('remote view polling adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('../controller.ts');
    jest.dontMock('../../serverConnection.ts');
    delete global.document;
  });

  test('refreshes without rediscovering the React-owned remote view element', async () => {
    const { polling, refreshRemoteViewData } = loadPollingWithMocks();

    await polling.renderRemoteView();

    expect(refreshRemoteViewData).toHaveBeenCalledTimes(1);
    expect(global.document.getElementById).not.toHaveBeenCalled();
  });

  test('uses the React-owned active lifecycle instead of polling the remote view class', () => {
    const { polling, refreshRemoteViewData, startCentralServerConnection } = loadPollingWithMocks();

    polling.startRemoteViewPolling();
    jest.advanceTimersByTime(3000);

    expect(startCentralServerConnection).toHaveBeenCalledTimes(1);
    expect(refreshRemoteViewData).toHaveBeenCalledTimes(1);
    expect(global.document.getElementById).not.toHaveBeenCalled();

    polling.stopRemoteViewPolling();
  });

  test('does not refresh while a remote input keeps focus', () => {
    const { centralServerListener, polling, refreshRemoteViewData } = loadPollingWithMocks({
      activeElement: { id: 'centralServerUrlInput', name: '' },
    });

    polling.startRemoteViewPolling();
    jest.advanceTimersByTime(3000);
    const listener = centralServerListener();
    expect(listener).toEqual(expect.any(Function));
    listener();

    expect(refreshRemoteViewData).not.toHaveBeenCalled();

    polling.stopRemoteViewPolling();
  });
});
