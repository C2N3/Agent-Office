// @ts-nocheck

const { createWindowManager } = require('../windowManager');
const { savePersistedState } = require('../sessionPersistence');

function createApplicationWindowManager({
  agentManager,
  agentRegistry,
  sessionScanner,
  heatmapScanner,
  debugLog,
  adaptAgentToDashboard,
  errorHandler,
  getWindowSizeForAgents,
}) {
  return createWindowManager({
    agentManager,
    agentRegistry,
    sessionScanner,
    heatmapScanner,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    getWindowSizeForAgents,
  });
}

function startDashboardRuntime({ windowManager, orchestrator, workspaceManager, terminalManager, debugLog }) {
  windowManager.startDashboardServer();

  if (!orchestrator) {
    return;
  }

  try {
    const serverModule = require('../../dashboardServer/index.js');
    serverModule.setOrchestrator(orchestrator);
    if (workspaceManager) serverModule.setWorkspaceManager(workspaceManager);
    if (terminalManager) serverModule.setTerminalManager(terminalManager);
  } catch (error) {
    debugLog(`[Main] Failed to wire orchestrator to dashboard: ${error.message}`);
  }
}

function attachAgentBroadcasts({
  agentManager,
  windowManager,
  sessionPids,
  adaptAgentToDashboard,
  hookProcessor,
  codexProcessor,
}) {
  function broadcast(_mainChannel, dashChannel, data, dashData) {
    const dashboardWindow = windowManager.dashboardWindow;
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send(dashChannel, dashData !== undefined ? dashData : data);
    }
    savePersistedState({ agentManager, sessionPids });
  }

  const agentListeners = {
    onAdded: (agent) => {
      broadcast('agent-added', 'dashboard-agent-added', agent, adaptAgentToDashboard(agent));
    },
    onUpdated: (agent) => {
      broadcast('agent-updated', 'dashboard-agent-updated', agent, adaptAgentToDashboard(agent));
    },
    onRemoved: (data) => {
      broadcast('agent-removed', 'dashboard-agent-removed', data);
    },
    onCleaned: (data) => {
      broadcast('agents-cleaned', 'dashboard-agent-removed', data, { type: 'batch', ...data });
    },
  };

  agentManager.on('agent-added', agentListeners.onAdded);
  agentManager.on('agent-updated', agentListeners.onUpdated);
  agentManager.on('agent-removed', agentListeners.onRemoved);
  agentManager.on('agents-cleaned', agentListeners.onCleaned);

  if (hookProcessor) hookProcessor.flushPendingStarts();
  if (codexProcessor) codexProcessor.flushPendingStarts();

  return agentListeners;
}

module.exports = {
  attachAgentBroadcasts,
  createApplicationWindowManager,
  startDashboardRuntime,
};
