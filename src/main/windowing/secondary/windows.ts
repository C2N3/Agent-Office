import { BrowserWindow, screen, shell } from 'electron';
import { pathToFileURL } from 'url';
import { resolveFromModule } from '../../../runtime/module';
import { saveUiState } from '../../uiState';

const moduleUrl = pathToFileURL(module.filename);

function createSecondaryWindowControls(options) {
  const {
    refs,
    dashboardRootUrl,
    agentManager,
    adaptAgentToDashboard,
    debugLog,
  } = options;

  function notifyDashboardPipState(isOpen) {
    if (refs.dashboardWindow && !refs.dashboardWindow.isDestroyed()) {
      refs.dashboardWindow.webContents.send('pip-state-changed', isOpen);
    }
  }

  function notifyDashboardOverlayState(isOpen) {
    if (refs.dashboardWindow && !refs.dashboardWindow.isDestroyed()) {
      refs.dashboardWindow.webContents.send('overlay-state-changed', isOpen);
    }
  }

  function closePipWindow() {
    if (refs.pipWindow && !refs.pipWindow.isDestroyed()) {
      refs.pipWindow.close();
    }
    refs.pipWindow = null;
  }

  function closeOverlayWindow() {
    if (refs.overlayWindow && !refs.overlayWindow.isDestroyed()) {
      refs.overlayWindow.close();
    }
    refs.overlayWindow = null;
  }

  function createOverlayWindow() {
    if (refs.overlayWindow && !refs.overlayWindow.isDestroyed()) {
      refs.overlayWindow.focus();
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    refs.overlayWindow = new BrowserWindow({
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
        preload: resolveFromModule(moduleUrl, '..', '..', '..', 'overlayPreload.mjs'),
      },
    });

    refs.overlayWindow.once('ready-to-show', () => {
      if (!refs.overlayWindow || refs.overlayWindow.isDestroyed()) return;
      refs.overlayWindow.show();
      refs.overlayWindow.setAlwaysOnTop(true, 'floating');
      debugLog('[Overlay] Window shown');
    });
    refs.overlayWindow.loadURL(`${dashboardRootUrl}/overlay`);
    refs.overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      debugLog(`[Overlay] Failed to load: ${errorCode} - ${errorDescription}`);
      if (refs.overlayWindow && !refs.overlayWindow.isDestroyed()) refs.overlayWindow.destroy();
      refs.overlayWindow = null;
    });
    refs.overlayWindow.on('closed', () => {
      refs.overlayWindow = null;
      notifyDashboardOverlayState(false);
      saveUiState({ overlayOpen: false });
      debugLog('[Overlay] Window closed');
    });

    notifyDashboardOverlayState(true);
    saveUiState({ overlayOpen: true });
    debugLog('[Overlay] Window created');
  }

  function createDashboardWindow() {
    if (refs.dashboardWindow && !refs.dashboardWindow.isDestroyed()) {
      debugLog('[MissionControl] Window already open, focusing existing window');
      if (refs.dashboardWindow.isMinimized()) refs.dashboardWindow.restore();
      refs.dashboardWindow.focus();
      return { success: true, alreadyOpen: true };
    }

    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const dashW = Math.min(Math.max(1280, Math.floor(width * 0.9)), width - 20);
      const dashH = Math.min(Math.max(980, Math.floor(height * 0.95)), height - 10);

      refs.dashboardWindow = new BrowserWindow({
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
          preload: resolveFromModule(moduleUrl, '..', '..', '..', 'dashboardPreload.js'),
        },
      });

      refs.dashboardWindow.loadURL(`${dashboardRootUrl}/`);
      refs.dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
      refs.dashboardWindow.webContents.on('did-finish-load', () => {
        debugLog('[MissionControl] Window loaded successfully');
        if (agentManager) {
          const adaptedAgents = agentManager.getAllAgents().map((agent) => adaptAgentToDashboard(agent));
          debugLog(`[MissionControl] Sending ${adaptedAgents.length} agents to dashboard`);
          refs.dashboardWindow.webContents.send('dashboard-initial-data', adaptedAgents);
        }
      });
      refs.dashboardWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        debugLog(`[MissionControl] Failed to load: ${errorCode} - ${errorDescription}`);
        refs.dashboardWindow.destroy();
        refs.dashboardWindow = null;
      });
      refs.dashboardWindow.on('closed', () => {
        debugLog('[MissionControl] Window closed');
        refs.dashboardWindow = null;
        closePipWindow();
        if (agentManager) {
          const activeAgents = agentManager.getAllAgents().filter((a) => a.state !== 'Offline');
          if (activeAgents.length > 0 && (!refs.overlayWindow || refs.overlayWindow.isDestroyed())) {
            createOverlayWindow();
            debugLog(`[Overlay] Auto-shown with ${activeAgents.length} active agent(s)`);
          }
        }
      });

      debugLog('[MissionControl] Window created');
      return { success: true };
    } catch (error) {
      debugLog(`[MissionControl] Failed to create window: ${error.message}`);
      refs.dashboardWindow = null;
      return { success: false, error: error.message };
    }
  }

  function createPipWindow() {
    if (refs.pipWindow && !refs.pipWindow.isDestroyed()) {
      refs.pipWindow.focus();
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    refs.pipWindow = new BrowserWindow({
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
        preload: resolveFromModule(moduleUrl, '..', '..', '..', 'pipPreload.js'),
      },
    });

    refs.pipWindow.setAspectRatio(864 / 800);
    refs.pipWindow.once('ready-to-show', () => {
      if (!refs.pipWindow || refs.pipWindow.isDestroyed()) return;
      refs.pipWindow.show();
      refs.pipWindow.setAlwaysOnTop(true, 'floating');
      notifyDashboardPipState(true);
      debugLog('[PiP] Window shown');
    });
    refs.pipWindow.loadURL(`${dashboardRootUrl}/pip`);
    refs.pipWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      debugLog(`[PiP] Failed to load: ${errorCode} - ${errorDescription}`);
      if (refs.pipWindow && !refs.pipWindow.isDestroyed()) refs.pipWindow.destroy();
      refs.pipWindow = null;
    });
    refs.pipWindow.on('closed', () => {
      refs.pipWindow = null;
      notifyDashboardPipState(false);
      debugLog('[PiP] Window closed');
    });
    debugLog('[PiP] Window created');
  }

  function toggleOverlayWindow() {
    if (refs.overlayWindow && !refs.overlayWindow.isDestroyed()) closeOverlayWindow();
    else createOverlayWindow();
  }

  function openTaskChatWindow({ agentRegistryId, agentName, avatarFile }) {
    if (!agentRegistryId) return { success: false, error: 'agentRegistryId required' };
    if (!refs.taskChatWindows) refs.taskChatWindows = new Map();
    const existing = refs.taskChatWindows.get(agentRegistryId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return { success: true, alreadyOpen: true };
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const winWidth = 420;
    const winHeight = 560;
    const existingCount = Array.from(refs.taskChatWindows.values()).filter((win: any) => win && !win.isDestroyed()).length;
    const xOffset = 28 * existingCount;
    const yOffset = 28 * existingCount;
    const x = Math.max(20, width - winWidth - 24 - xOffset);
    const y = Math.max(20, height - winHeight - 24 - yOffset);

    const win = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      minWidth: 320,
      minHeight: 360,
      title: agentName || 'Agent Chat',
      backgroundColor: '#0b0d0f',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: resolveFromModule(moduleUrl, '..', '..', '..', 'taskChatPreload.js'),
        additionalArguments: [`--task-chat-agent=${agentRegistryId}`],
      },
    });

    const params = new URLSearchParams({
      agentRegistryId: String(agentRegistryId),
      agentName: String(agentName || 'Agent'),
      avatarFile: String(avatarFile || ''),
    });
    win.loadURL(`${dashboardRootUrl}/task-chat?${params.toString()}`);
    win.once('ready-to-show', () => {
      if (!win || win.isDestroyed()) return;
      win.show();
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      debugLog(`[TaskChat] Failed to load: ${errorCode} - ${errorDescription}`);
      if (win && !win.isDestroyed()) win.destroy();
      refs.taskChatWindows.delete(agentRegistryId);
    });
    win.on('closed', () => {
      refs.taskChatWindows.delete(agentRegistryId);
      debugLog(`[TaskChat] Window closed: ${agentRegistryId}`);
    });

    refs.taskChatWindows.set(agentRegistryId, win);
    debugLog(`[TaskChat] Window created: ${agentRegistryId}`);
    return { success: true };
  }

  function closeTaskChatWindow(agentRegistryId) {
    if (!refs.taskChatWindows) return;
    const win = refs.taskChatWindows.get(agentRegistryId);
    if (win && !win.isDestroyed()) win.close();
    refs.taskChatWindows.delete(agentRegistryId);
  }

  function closeAllTaskChatWindows() {
    if (!refs.taskChatWindows) return;
    for (const win of refs.taskChatWindows.values()) {
      if (win && !win.isDestroyed()) win.close();
    }
    refs.taskChatWindows.clear();
  }

  function resizeOverlayWindow(width, height) {
    if (refs.overlayWindow && !refs.overlayWindow.isDestroyed()) {
      refs.overlayWindow.setSize(Math.round(width), Math.round(height));
    }
  }

  function focusDashboardWindow() {
    if (refs.dashboardWindow && !refs.dashboardWindow.isDestroyed()) {
      if (refs.dashboardWindow.isMinimized()) refs.dashboardWindow.restore();
      refs.dashboardWindow.focus();
    }
  }

  function closeDashboardWindow() {
    closePipWindow();
    if (refs.dashboardWindow && !refs.dashboardWindow.isDestroyed()) {
      refs.dashboardWindow.close();
      debugLog('[MissionControl] Window closed by request');
    }
    refs.dashboardWindow = null;
  }

  return {
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
  };
}

export { createSecondaryWindowControls };
