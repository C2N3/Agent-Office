import { ipcMain } from 'electron';
import { dashboardIpcChannels } from '../../shared/contracts/ipc';
import { terminateAgentSession } from '../sessionTermination';

export function registerAgentSessionHandlers({
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
