const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');

jest.mock('../src/dashboardServer/index.ts', () => ({
  setAgentManager: jest.fn(),
  setSessionScanner: jest.fn(),
  setHeatmapScanner: jest.fn(),
  setAgentRegistry: jest.fn(),
  startServer: jest.fn(() => ({ close: jest.fn(), listening: true })),
}));

import * as dashboardServer from '../src/dashboardServer/index.ts';
import { createWindowManagerCore } from '../src/main/windowing/core';

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

  test('starts the dashboard server from the emitted windowing module path', async () => {
    const windowManager = createWindowManager();

    await windowManager.startDashboardServer();

    expect(dashboardServer.setAgentManager).toHaveBeenCalled();
    expect(dashboardServer.setSessionScanner).toHaveBeenCalled();
    expect(dashboardServer.setHeatmapScanner).toHaveBeenCalled();
    expect(dashboardServer.setAgentRegistry).toHaveBeenCalled();
    expect(dashboardServer.startServer).toHaveBeenCalledTimes(1);
  });

  test('rejects startup when the dashboard server emits a listen error', async () => {
    const EventEmitter = require('events');
    const debugLog = jest.fn();
    const windowManager = createWindowManager({ debugLog });
    dashboardServer.startServer.mockImplementationOnce(() => {
      const server = new EventEmitter();
      server.close = jest.fn();
      server.listening = false;
      setImmediate(() => server.emit('error', new Error('Port 3000 already in use')));
      return server;
    });

    await expect(windowManager.startDashboardServer()).rejects.toThrow('Port 3000 already in use');
    expect(debugLog).toHaveBeenCalledWith('[Dashboard] Failed to start: Port 3000 already in use');
  });

  test('resolves window preload paths to existing files', () => {
    BrowserWindow.mockImplementation(createBrowserWindowMock);
    const windowManager = createWindowManager();

    windowManager.createDashboardWindow();
    windowManager.createPipWindow();
    windowManager.createOverlayWindow();

    const preloadPaths = BrowserWindow.mock.calls.map(([options]) => options.webPreferences.preload);
    const overlayWebPreferences = BrowserWindow.mock.calls[2][0].webPreferences;

    expect(preloadPaths.map((preloadPath) => path.basename(preloadPath))).toEqual([
      'dashboardPreload.js',
      'pipPreload.js',
      'overlayPreload.mjs',
    ]);
    expect(overlayWebPreferences).toEqual(expect.objectContaining({
      contextIsolation: true,
      sandbox: false,
    }));
    preloadPaths.forEach((preloadPath) => {
      const sourcePath = preloadPath.endsWith('.mjs')
        ? preloadPath.replace(/\.mjs$/, '.mts')
        : preloadPath.replace(/\.js$/, '.ts');
      expect(fs.existsSync(preloadPath) || fs.existsSync(sourcePath)).toBe(true);
    });
  });

  test('keeps dashboard dev URLs on slash routes for dashboard, pip, and overlay windows', () => {
    BrowserWindow.mockImplementation(createBrowserWindowMock);
    const originalArgv = process.argv;
    process.argv = [...process.argv, '--dev'];
    process.env.DASHBOARD_DEV_SERVER_URL = 'http://127.0.0.1:3001';

    try {
      const windowManager = createWindowManager();
      windowManager.createDashboardWindow();
      windowManager.createPipWindow();
      windowManager.createOverlayWindow();

      const loadUrls = BrowserWindow.mock.results.map((result) => result.value.loadURL.mock.calls[0][0]);
      expect(loadUrls).toEqual([
        'http://127.0.0.1:3001/',
        'http://127.0.0.1:3001/pip',
        'http://127.0.0.1:3001/overlay',
      ]);
    } finally {
      process.argv = originalArgv;
      delete process.env.DASHBOARD_DEV_SERVER_URL;
    }
  });

  test('loads the main renderer from the Vite dev server in dev mode', () => {
    BrowserWindow.mockImplementation(createBrowserWindowMock);
    const originalArgv = process.argv;
    process.argv = [...process.argv, '--dev'];
    process.env.DASHBOARD_DEV_SERVER_URL = 'http://127.0.0.1:3001';

    try {
      const windowManager = createWindowManager();
      windowManager.createWindow();

      const mainWindow = BrowserWindow.mock.results[0].value;
      expect(mainWindow.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3001/index.html');
      expect(mainWindow.loadFile).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgv;
      delete process.env.DASHBOARD_DEV_SERVER_URL;
    }
  });
});
