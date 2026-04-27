import { savePersistedState } from '../sessionPersistence.js';
import {
  loadDashboardRemoteAuthModule,
  loadDashboardServerModule,
} from '../dashboardRuntimeLoader.js';
import { createWindowManager } from '../windowing/index.js';

export function createApplicationWindowManager({
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

export async function startDashboardRuntime({
  windowManager,
  orchestrator,
  workspaceManager,
  terminalManager,
  sessionPids,
  debugLog,
  isDev,
}) {
  await windowManager.startDashboardServer();

  // Initialize remote access token and print info
  try {
    const { loadOrCreateToken } = await loadDashboardRemoteAuthModule();
    const token = loadOrCreateToken();
    const port = 3000;
    debugLog(`[Remote] Token: ${token}`);
    debugLog(`[Remote] Local:  http://localhost:${port}/remote?token=${token}`);
    debugLog(`[Remote] Run start-tunnel.bat to expose via Cloudflare`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Remote Access Token:', token);
    console.log(`  Local URL: http://localhost:${port}/remote?token=${token}`);
    console.log('  Token file: ~/.agent-office/remote-token.txt');
    console.log('  Run start-tunnel.bat for Cloudflare public URL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    debugLog(`[Remote] Failed to initialize token: ${error.message}`);
  }

  if (!orchestrator) {
    return;
  }

  try {
    const serverModule = await loadDashboardServerModule();
    serverModule.setAppMeta({ isDev: !!isDev });
    serverModule.setOrchestrator(orchestrator);
    if (workspaceManager) serverModule.setWorkspaceManager(workspaceManager);
    if (terminalManager) serverModule.setTerminalManager(terminalManager);
    if (sessionPids) serverModule.setSessionPids(sessionPids);
  } catch (error) {
    debugLog(`[Main] Failed to wire orchestrator to dashboard: ${error.message}`);
  }
}

export function attachAgentBroadcasts({
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
      broadcast('agent-removed', 'dashboard-agent-removed', data, data);
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
