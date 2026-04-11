// @ts-nocheck
const { BrowserWindow, screen, shell } = require('electron');
const path = require('path');
const { saveUiState } = require('../uiState');

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

  function notifyDashboardPipState(isOpen) {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('pip-state-changed', isOpen);
    }
  }

  function notifyDashboardOverlayState(isOpen) {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('overlay-state-changed', isOpen);
    }
  }

  function closePipWindow() {
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.close();
    }
    pipWindow = null;
  }

  function closeOverlayWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
    overlayWindow = null;
  }

  function createOverlayWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.focus();
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    overlayWindow = new BrowserWindow({
      width: 80,
      height: 150,
      x: width - 110,
      y: height - 180,
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: false,
      movable: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '..', 'overlayPreload.js'),
      },
    });

    overlayWindow.once('ready-to-show', () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      overlayWindow.show();
      overlayWindow.setAlwaysOnTop(true, 'floating');
      debugLog('[Overlay] Window shown');
    });
    overlayWindow.loadURL(`${dashboardRootUrl}/overlay`);
    overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      debugLog(`[Overlay] Failed to load: ${errorCode} - ${errorDescription}`);
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
      overlayWindow = null;
    });
    overlayWindow.on('closed', () => {
      overlayWindow = null;
      notifyDashboardOverlayState(false);
      saveUiState({ overlayOpen: false });
      debugLog('[Overlay] Window closed');
    });

    notifyDashboardOverlayState(true);
    saveUiState({ overlayOpen: true });
    debugLog('[Overlay] Window created');
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
        preload: path.join(__dirname, '..', 'preload.js'),
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

  function createDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      debugLog('[MissionControl] Window already open, focusing existing window');
      if (dashboardWindow.isMinimized()) dashboardWindow.restore();
      dashboardWindow.focus();
      return { success: true, alreadyOpen: true };
    }

    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const dashW = Math.min(Math.max(1280, Math.floor(width * 0.9)), width - 20);
      const dashH = Math.min(Math.max(980, Math.floor(height * 0.95)), height - 10);

      dashboardWindow = new BrowserWindow({
        width: dashW,
        height: dashH,
        x: Math.floor((width - dashW) / 2),
        y: Math.floor((height - dashH) / 2),
        title: 'Agent-Office',
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          preload: path.join(__dirname, '..', 'dashboardPreload.js'),
        },
      });

      dashboardWindow.loadURL(`${dashboardRootUrl}/`);
      dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
      dashboardWindow.webContents.on('did-finish-load', () => {
        debugLog('[MissionControl] Window loaded successfully');
        if (agentManager) {
          const adaptedAgents = agentManager.getAllAgents().map((agent) => adaptAgentToDashboard(agent));
          debugLog(`[MissionControl] Sending ${adaptedAgents.length} agents to dashboard`);
          dashboardWindow.webContents.send('dashboard-initial-data', adaptedAgents);
        }
      });
      dashboardWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        debugLog(`[MissionControl] Failed to load: ${errorCode} - ${errorDescription}`);
        dashboardWindow.destroy();
        dashboardWindow = null;
      });
      dashboardWindow.on('closed', () => {
        debugLog('[MissionControl] Window closed');
        dashboardWindow = null;
        closePipWindow();
        if (agentManager) {
          const activeAgents = agentManager.getAllAgents().filter((a) => a.state !== 'Offline');
          if (activeAgents.length > 0 && (!overlayWindow || overlayWindow.isDestroyed())) {
            createOverlayWindow();
            debugLog(`[Overlay] Auto-shown with ${activeAgents.length} active agent(s)`);
          }
        }
      });

      debugLog('[MissionControl] Window created');
      return { success: true };
    } catch (error) {
      debugLog(`[MissionControl] Failed to create window: ${error.message}`);
      dashboardWindow = null;
      return { success: false, error: error.message };
    }
  }

  function createPipWindow() {
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.focus();
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    pipWindow = new BrowserWindow({
      width: 480,
      height: 450,
      x: width - 500,
      y: height - 470,
      frame: true,
      resizable: true,
      maximizable: false,
      title: 'Office PiP',
      backgroundColor: '#050709',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '..', 'pipPreload.js'),
      },
    });

    pipWindow.setAspectRatio(864 / 800);
    pipWindow.once('ready-to-show', () => {
      if (!pipWindow || pipWindow.isDestroyed()) return;
      pipWindow.show();
      pipWindow.setAlwaysOnTop(true, 'floating');
      notifyDashboardPipState(true);
      debugLog('[PiP] Window shown');
    });
    pipWindow.loadURL(`${dashboardRootUrl}/pip`);
    pipWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      debugLog(`[PiP] Failed to load: ${errorCode} - ${errorDescription}`);
      if (pipWindow && !pipWindow.isDestroyed()) pipWindow.destroy();
      pipWindow = null;
    });
    pipWindow.on('closed', () => {
      pipWindow = null;
      notifyDashboardPipState(false);
      debugLog('[PiP] Window closed');
    });
    debugLog('[PiP] Window created');
  }

  function toggleOverlayWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      closeOverlayWindow();
    } else {
      createOverlayWindow();
    }
  }

  function resizeOverlayWindow(width, height) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setSize(Math.round(width), Math.round(height));
    }
  }

  function focusDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      if (dashboardWindow.isMinimized()) dashboardWindow.restore();
      dashboardWindow.focus();
    }
  }

  function closeDashboardWindow() {
    closePipWindow();
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.close();
      debugLog('[MissionControl] Window closed by request');
    }
    dashboardWindow = null;
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
