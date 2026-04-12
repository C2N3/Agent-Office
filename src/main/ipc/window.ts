// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { ipcMain, screen } = require('electron');
const { electronIpcChannels, dashboardIpcChannels } = require('../../shared/contracts/ipc');

function registerWindowHandlers({
  agentManager,
  windowManager,
  debugLog,
  adaptAgentToDashboard,
  errorHandler,
}) {
  ipcMain.on(electronIpcChannels.resizeWindow, (_event, size) => {
    const mainWindow = windowManager.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const { width, height, x, y } = mainWindow.getBounds();
    const newWidth = Math.max(150, Math.ceil(size.width ? size.width + 20 : width));
    const newHeight = Math.max(180, Math.ceil(size.height ? size.height + 30 : height));
    if (newWidth === width && newHeight === height) return;

    const workArea = screen.getDisplayMatching(mainWindow.getBounds()).bounds;
    const deltaHeight = newHeight - height;
    const newY = Math.max(workArea.y, Math.min(y - deltaHeight, workArea.y + workArea.height - newHeight));
    const newX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - newWidth));
    mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
    debugLog(`[Main] Resize -> ${newWidth}x${newHeight}`);
  });

  ipcMain.on(electronIpcChannels.getAvatars, (event) => {
    const imgRegex = /\.(webp|png|jpg|jpeg|gif)$/i;
    try {
      const charsDir = path.join(__dirname, '..', '..', '..', 'public', 'characters');
      if (fs.existsSync(charsDir)) {
        const entries = fs.readdirSync(charsDir, { withFileTypes: true });
        const categories = [];
        const allFiles = [];
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (!entry.isDirectory()) continue;
          const folderFiles = fs.readdirSync(path.join(charsDir, entry.name))
            .filter(f => imgRegex.test(f))
            .sort();
          const prefixed = folderFiles.map(f => `${entry.name}/${f}`);
          if (prefixed.length > 0) {
            categories.push({ name: entry.name, files: prefixed });
            allFiles.push(...prefixed);
          }
        }
        event.reply(electronIpcChannels.avatarsResponse, { categories, allFiles });
      } else {
        event.reply(electronIpcChannels.avatarsResponse, { categories: [], allFiles: [] });
      }
    } catch (error) {
      errorHandler.capture(error, {
        code: 'E003',
        category: 'FILE_IO',
        severity: 'WARNING',
      });
      debugLog(`[Main] get-avatars error: ${error.message}`);
      event.reply(electronIpcChannels.avatarsResponse, { categories: [], allFiles: [] });
    }
  });

  ipcMain.on(electronIpcChannels.getAllAgents, (event) => {
    event.reply(electronIpcChannels.allAgentsResponse, agentManager?.getAllAgents() ?? []);
  });

  ipcMain.handle(electronIpcChannels.openWebDashboard, async () => {
    try {
      return windowManager.createDashboardWindow();
    } catch (error) {
      debugLog(`[MissionControl] Error opening dashboard: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on(dashboardIpcChannels.getDashboardAgents, (event) => {
    if (!agentManager) {
      event.reply(dashboardIpcChannels.dashboardAgentsResponse, []);
      return;
    }

    const agents = agentManager.getAllAgents().map((agent) => adaptAgentToDashboard(agent));
    event.reply(dashboardIpcChannels.dashboardAgentsResponse, agents);
  });

  ipcMain.handle(dashboardIpcChannels.agentsClearInactiveUnregistered, async () => {
    if (!agentManager) return { success: false, clearedCount: 0, clearedIds: [] };

    const removableAgents = agentManager.getAllAgents().filter((agent) => {
      if (!agent || agent.isRegistered) return false;
      return agent.state === 'Done' || agent.state === 'Offline';
    });

    const clearedIds = [];
    for (const agent of removableAgents) {
      if (agentManager.removeAgent(agent.id)) {
        clearedIds.push(agent.id);
      }
    }

    return {
      success: true,
      clearedCount: clearedIds.length,
      clearedIds,
    };
  });

  ipcMain.handle(dashboardIpcChannels.togglePip, async () => {
    try {
      const pipWindow = windowManager.pipWindow;
      if (pipWindow && !pipWindow.isDestroyed()) {
        windowManager.closePipWindow();
        return { success: true, action: 'closed' };
      }

      windowManager.createPipWindow();
      return { success: true, action: 'opened' };
    } catch (error) {
      debugLog(`[PiP] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on(dashboardIpcChannels.pipClose, () => {
    windowManager.closePipWindow();
  });

  ipcMain.on(dashboardIpcChannels.pipBackToDashboard, () => {
    windowManager.closePipWindow();
    windowManager.focusDashboardWindow();
  });

  ipcMain.handle(dashboardIpcChannels.toggleOverlay, async () => {
    try {
      const overlayWindow = windowManager.overlayWindow;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        windowManager.closeOverlayWindow();
        return { success: true, action: 'closed' };
      }

      windowManager.createOverlayWindow();
      return { success: true, action: 'opened' };
    } catch (error) {
      debugLog(`[Overlay] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on(dashboardIpcChannels.overlayClose, () => {
    windowManager.closeOverlayWindow();
  });

  ipcMain.on(dashboardIpcChannels.overlayBackToDashboard, () => {
    windowManager.closeOverlayWindow();
    windowManager.focusDashboardWindow();
  });

  ipcMain.on(dashboardIpcChannels.overlayResize, (_event, { width, height }) => {
    windowManager.resizeOverlayWindow(width, height);
  });
}

module.exports = {
  registerWindowHandlers,
};
