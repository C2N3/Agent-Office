const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { createSecondaryWindowControls } = require('./secondary/windows');

function createWindowManagerCore(context) {
  const {
    agentManager,
    agentRegistry,
    sessionScanner,
    heatmapScanner,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    getWindowSizeForAgents,
  } = context;

  let mainWindow = null;
  let dashboardWindow = null;
  let pipWindow = null;
  let overlayWindow = null;
  let keepAliveInterval = null;
  let dashboardServer = null;
  const dashboardClientUrl = process.env.DASHBOARD_DEV_SERVER_URL || 'http://localhost:3000';
  const dashboardRootUrl = process.argv.includes('--dev') ? dashboardClientUrl : 'http://localhost:3000';
  const refs = {
    get dashboardWindow() { return dashboardWindow; },
    set dashboardWindow(value) { dashboardWindow = value; },
    get pipWindow() { return pipWindow; },
    set pipWindow(value) { pipWindow = value; },
    get overlayWindow() { return overlayWindow; },
    set overlayWindow(value) { overlayWindow = value; },
  };
  const {
    closeDashboardWindow,
    closeOverlayWindow,
    closePipWindow,
    createDashboardWindow,
    createOverlayWindow,
    createPipWindow,
    focusDashboardWindow,
    resizeOverlayWindow,
    toggleOverlayWindow,
  } = createSecondaryWindowControls({
    refs,
    dashboardRootUrl,
    agentManager,
    adaptAgentToDashboard,
    debugLog,
  });

  function resizeWindowForAgents(agentsOrCount) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width, height } = getWindowSizeForAgents(agentsOrCount);
    const bounds = mainWindow.getBounds();
    if (width === bounds.width && height === bounds.height) return;
    const wa = screen.getDisplayMatching(bounds).bounds;
    const dh = height - bounds.height;
    const newY = Math.max(wa.y, Math.min(bounds.y - dh, wa.y + wa.height - height));
    const newX = Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - width));
    mainWindow.setBounds({ x: newX, y: newY, width, height });
    const info = Array.isArray(agentsOrCount) ? agentsOrCount.length : agentsOrCount;
    debugLog(`[Main] Window → ${width}x${height} (${info} agents)`);
  }

  function startKeepAlive() {
    if (keepAliveInterval) return;
    keepAliveInterval = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    }, 5000);
    debugLog('[Main] Keep-alive interval started');
  }

  function stopKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
      debugLog('[Main] Keep-alive interval stopped');
    }
  }

  function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const winSize = getWindowSizeForAgents(0);

    mainWindow = new BrowserWindow({
      width: winSize.width,
      height: winSize.height,
      x: Math.round((width - winSize.width) / 2),
      y: Math.round((height - winSize.height) / 2),
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      focusable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    mainWindow.loadFile(path.join(__dirname, '..', '..', 'index.html'));
    errorHandler.setMainWindow(mainWindow);

    let constraining = false;
    mainWindow.on('moved', () => {
      if (constraining || mainWindow.isDestroyed()) return;
      const b = mainWindow.getBounds();
      const wa = screen.getDisplayMatching(b).bounds;
      const cx = Math.max(wa.x, Math.min(b.x, wa.x + wa.width - b.width));
      const cy = Math.max(wa.y, Math.min(b.y, wa.y + wa.height - b.height));
      if (cx !== b.x || cy !== b.y) {
        constraining = true;
        mainWindow.setPosition(cx, cy);
        constraining = false;
      }
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    startKeepAlive();
  }

  function startDashboardServer() {
    if (dashboardServer) {
      debugLog('[Dashboard] Server is already running.');
      return;
    }

    debugLog('[Dashboard] Starting server...');
    try {
      const serverModule = require('../../dashboardServer/index.js');
      if (agentManager) serverModule.setAgentManager(agentManager);
      if (sessionScanner) serverModule.setSessionScanner(sessionScanner);
      if (heatmapScanner) serverModule.setHeatmapScanner(heatmapScanner);
      if (agentRegistry) serverModule.setAgentRegistry(agentRegistry);
      dashboardServer = serverModule.startServer();
      debugLog('[Dashboard] Server started (port 3000)');
    } catch (error) {
      debugLog(`[Dashboard] Failed to start: ${error.message}`);
    }
  }

  function stopDashboardServer() {
    if (dashboardServer) {
      debugLog('[Dashboard] Shutting down server...');
      try {
        dashboardServer.close(() => {
          debugLog('[Dashboard] Server shutdown complete');
        });
      } catch (error) {
        debugLog(`[Dashboard] Error during shutdown: ${error.message}`);
      }
      dashboardServer = null;
    }
  }

  return {
    get mainWindow() { return mainWindow; },
    get dashboardWindow() { return dashboardWindow; },
    get pipWindow() { return pipWindow; },
    get overlayWindow() { return overlayWindow; },
    createWindow,
    startKeepAlive,
    stopKeepAlive,
    createDashboardWindow,
    closeDashboardWindow,
    createPipWindow,
    closePipWindow,
    createOverlayWindow,
    closeOverlayWindow,
    toggleOverlayWindow,
    resizeOverlayWindow,
    focusDashboardWindow,
    startDashboardServer,
    stopDashboardServer,
    resizeWindowForAgents,
  };
}

module.exports = { createWindowManagerCore };
