const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');

jest.mock('../src/dashboardServer/index.ts', () => ({
  setAgentManager: jest.fn(),
  setSessionScanner: jest.fn(),
  setHeatmapScanner: jest.fn(),
  setAgentRegistry: jest.fn(),
  startServer: jest.fn(() => ({ close: jest.fn() })),
}));

const dashboardServer = require('../src/dashboardServer/index.ts');
const { createWindowManagerCore } = require('../src/main/windowing/core');

function createBrowserWindowMock() {
  return {
    close: jest.fn(),
    destroy: jest.fn(),
    focus: jest.fn(),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 300, height: 200 })),
    isDestroyed: jest.fn(() => false),
    isMinimized: jest.fn(() => false),
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    restore: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setAspectRatio: jest.fn(),
    setBounds: jest.fn(),
    setPosition: jest.fn(),
    setSize: jest.fn(),
    show: jest.fn(),
    webContents: {
      id: 1,
      on: jest.fn(),
      send: jest.fn(),
      setWindowOpenHandler: jest.fn(),
    },
  };
}

function createWindowManager(overrides = {}) {
  return createWindowManagerCore({
    agentManager: { getAllAgents: jest.fn(() => []) },
    agentRegistry: {},
    sessionScanner: {},
    heatmapScanner: {},
    debugLog: jest.fn(),
    adaptAgentToDashboard: jest.fn((agent) => agent),
    errorHandler: { setMainWindow: jest.fn() },
    getWindowSizeForAgents: jest.fn(() => ({ width: 300, height: 200 })),
    ...overrides,
  });
}

describe('windowing core', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    screen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1440, height: 1000 },
      bounds: { x: 0, y: 0, width: 1440, height: 1000 },
    });
  });

  test('starts the dashboard server from the emitted windowing module path', () => {
    const windowManager = createWindowManager();

    windowManager.startDashboardServer();

    expect(dashboardServer.setAgentManager).toHaveBeenCalled();
    expect(dashboardServer.setSessionScanner).toHaveBeenCalled();
    expect(dashboardServer.setHeatmapScanner).toHaveBeenCalled();
    expect(dashboardServer.setAgentRegistry).toHaveBeenCalled();
    expect(dashboardServer.startServer).toHaveBeenCalledTimes(1);
  });

  test('resolves window preload paths to existing files', () => {
    BrowserWindow.mockImplementation(createBrowserWindowMock);
    const windowManager = createWindowManager();

    windowManager.createDashboardWindow();
    windowManager.createPipWindow();
    windowManager.createOverlayWindow();

    const preloadPaths = BrowserWindow.mock.calls.map(([options]) => options.webPreferences.preload);

    expect(preloadPaths.map((preloadPath) => path.basename(preloadPath))).toEqual([
      'dashboardPreload.js',
      'pipPreload.js',
      'overlayPreload.js',
    ]);
    preloadPaths.forEach((preloadPath) => {
      const sourcePath = preloadPath.replace(/\.js$/, '.ts');
      expect(fs.existsSync(preloadPath) || fs.existsSync(sourcePath)).toBe(true);
    });
  });
});
