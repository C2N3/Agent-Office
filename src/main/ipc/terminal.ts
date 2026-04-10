// @ts-nocheck

const { ipcMain } = require('electron');
const { dashboardIpcChannels } = require('../../shared/contracts/ipc');

function registerTerminalHandlers({
  agentManager,
  terminalManager,
  terminalProfileService,
  nicknameStore,
  debugLog,
}) {
  if (nicknameStore) {
    ipcMain.handle(dashboardIpcChannels.nicknameSet, async (_event, agentId, nickname) => {
      const result = nicknameStore.setNickname(agentId, nickname);
      const agent = agentManager?.getAgent(agentId);
      if (agent) {
        agentManager.updateAgent({ sessionId: agentId, state: agent.state }, 'nickname');
      }
      return { success: true, nickname: result };
    });

    ipcMain.handle(dashboardIpcChannels.nicknameGet, async (_event, agentId) => {
      return { nickname: nicknameStore.getNickname(agentId) };
    });

    ipcMain.handle(dashboardIpcChannels.nicknameRemove, async (_event, agentId) => {
      nicknameStore.removeNickname(agentId);
      const agent = agentManager?.getAgent(agentId);
      if (agent) {
        agentManager.updateAgent({ sessionId: agentId, state: agent.state }, 'nickname');
      }
      return { success: true };
    });
  }

  if (!terminalManager) {
    return;
  }

  if (terminalProfileService) {
    ipcMain.handle(dashboardIpcChannels.terminalProfiles, async () => {
      return terminalProfileService.getProfilesWithDefault();
    });

    ipcMain.handle(dashboardIpcChannels.terminalDefaultProfileSet, async (_event, profileId) => {
      try {
        return {
          success: true,
          ...terminalProfileService.setDefaultProfile(profileId),
        };
      } catch (error) {
        debugLog(`[Terminal] Default profile error: ${error.message}`);
        return { success: false, error: error.message };
      }
    });
  }

  ipcMain.handle(dashboardIpcChannels.terminalCreate, async (_event, agentId, options) => {
    try {
      return terminalManager.createTerminal(agentId, options);
    } catch (error) {
      debugLog(`[Terminal] Create error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.terminalWrite, async (_event, agentId, data) => {
    terminalManager.writeToTerminal(agentId, data);
  });

  ipcMain.handle(dashboardIpcChannels.terminalResize, async (_event, agentId, cols, rows) => {
    terminalManager.resizeTerminal(agentId, cols, rows);
  });

  ipcMain.handle(dashboardIpcChannels.terminalDestroy, async (_event, agentId) => {
    terminalManager.destroyTerminal(agentId);
    return { success: true };
  });

  ipcMain.handle(dashboardIpcChannels.powershellOpenPolicyTerminal, async () => {
    if (process.platform !== 'win32') return { success: false };

    const { spawn } = require('child_process');
    const cmd = 'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; Write-Host "완료! 이 창을 닫아도 됩니다." -ForegroundColor Green';
    spawn('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit', '-Command', cmd], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    }).unref();
    return { success: true };
  });
}

module.exports = {
  registerTerminalHandlers,
};
