const { ipcMain } = require('electron');
const { dashboardIpcChannels } = require('../../shared/contracts/ipc');
const { terminateAgentSession } = require('../sessionTermination');

function registerAgentSessionHandlers({
  agentManager,
  agentRegistry,
  sessionPids,
  terminalManager,
  orchestrator,
  debugLog,
}) {
  ipcMain.handle(dashboardIpcChannels.agentTerminateSession, async (_event, agentId) => {
    try {
      return await terminateAgentSession({
        agentId,
        agentManager,
        agentRegistry,
        sessionPids,
        terminalManager,
        orchestrator,
        debugLog,
      });
    } catch (error) {
      debugLog(`[Terminate] IPC error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerAgentSessionHandlers,
};
