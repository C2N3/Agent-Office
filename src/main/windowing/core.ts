import { BrowserWindow, screen } from 'electron';
import { resolveFromModule } from '../../runtime/module';
import { loadDashboardServerModule } from '../dashboardRuntimeLoader';
import { createSecondaryWindowControls } from './secondary/windows';

const moduleUrl = import.meta.url;

export function createWindowManagerCore(context) {
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
  let dashboardServer: any = null;
  let dashboardServerStartPromise: Promise<any> | null = null;
  const browserDevServerUrl = process.env.DASHBOARD_DEV_SERVER_URL || 'http://127.0.0.1:3001';
  const dashboardRootUrl = process.argv.includes('--dev') ? browserDevServerUrl : 'http://localhost:3000';
  const taskChatWindows = new Map();
  const refs = {
    get dashboardWindow() { return dashboardWindow; },
    set dashboardWindow(value) { dashboardWindow = value; },
    get pipWindow() { return pipWindow; },
    set pipWindow(value) { pipWindow = value; },
    get overlayWindow() { return overlayWindow; },
    set overlayWindow(value) { overlayWindow = value; },
    taskChatWindows,
  };
  const {
    closeAllTaskChatWindows,
    closeDashboardWindow,
    closeOverlayWindow,
    closePipWindow,
    closeTaskChatWindow,
    createDashboardWindow,
    createOverlayWindow,
    createPipWindow,
    focusDashboardWindow,
    openTaskChatWindow,
    resizeOverlayWindow,
    toggleOverlayWindow,
  } = createSecondaryWindowControls({
    refs,
    dashboardRootUrl,
    agentManager,
    adaptAgentToDashboard,
    debugLog,
  });

  function resolveBrowserDevUrl(targetPath) {
    return new URL(targetPath, `${browserDevServerUrl}/`).toString();
  }

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
        preload: resolveFromModule(moduleUrl, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    if (process.argv.includes('--dev')) {
      mainWindow.loadURL(resolveBrowserDevUrl('/index.html'));
    } else {
      mainWindow.loadFile(resolveFromModule(moduleUrl, '..', '..', 'index.html'));
    }
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

  function waitForServerListening(server: any): Promise<any> {
    if (!server || typeof server.once !== 'function' || typeof server.off !== 'function') {
      return Promise.resolve(server);
    }
    if (server.listening) {
      return Promise.resolve(server);
    }
    return new Promise((resolve, reject) => {
      const handleListening = () => {
        cleanup();
        resolve(server);
      };
      const handleError = (error: any) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        server.off('listening', handleListening);
        server.off('error', handleError);
      };
      server.once('listening', handleListening);
      server.once('error', handleError);
    });
  }

  async function startDashboardServer() {
    if (dashboardServer) {
      debugLog('[Dashboard] Server is already running.');
      return dashboardServer;
    }
    if (dashboardServerStartPromise) {
      return dashboardServerStartPromise;
    }

    debugLog('[Dashboard] Starting server...');
    dashboardServerStartPromise = (async () => {
      const serverModule = await loadDashboardServerModule();
      if (agentManager) serverModule.setAgentManager(agentManager);
      if (sessionScanner) serverModule.setSessionScanner(sessionScanner);
      if (heatmapScanner) serverModule.setHeatmapScanner(heatmapScanner);
      if (agentRegistry) serverModule.setAgentRegistry(agentRegistry);
      const startedServer = serverModule.startServer();
      dashboardServer = await waitForServerListening(startedServer);
      debugLog('[Dashboard] Server started (port 3000)');
      return dashboardServer;
    })().catch((error) => {
      dashboardServer = null;
      debugLog(`[Dashboard] Failed to start: ${error.message}`);
      throw error;
    }).finally(() => {
      dashboardServerStartPromise = null;
    });
    return dashboardServerStartPromise;
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
    openTaskChatWindow,
    closeTaskChatWindow,
    closeAllTaskChatWindows,
    startDashboardServer,
    stopDashboardServer,
    resizeWindowForAgents,
  };
}
