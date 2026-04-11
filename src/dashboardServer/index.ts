import http from 'http';
import { PORT } from './constants.js';
import { attachAgentManagerBroadcasts, attachOrchestratorBroadcasts, attachTeamCoordinatorBroadcasts, broadcastSSE, broadcastUpdate } from './broadcast.js';
import {
  getRefs,
  setAgentManager as setAgentManagerRef,
  setAgentRegistry as setAgentRegistryRef,
  setOrchestrator as setOrchestratorRef,
  setWorkspaceManager as setWorkspaceManagerRef,
  setTerminalManager as setTerminalManagerRef,
  setTeamCoordinator as setTeamCoordinatorRef,
  setDashboardWindow as setDashboardWindowRef,
  setHeatmapScanner as setHeatmapScannerRef,
  setSessionScanner as setSessionScannerRef,
} from './context.js';
import { handleRequest } from './routes.js';
import { attachWebSocketUpgrade } from './websocket.js';
import { calculateStats as calculateStatsImpl } from './stats.js';

const server = http.createServer(handleRequest as any);
attachWebSocketUpgrade(server as any);

export function setAgentManager(manager: any): void {
  setAgentManagerRef(manager);
  attachAgentManagerBroadcasts(manager);
}

export function setSessionScanner(scanner: any): void {
  setSessionScannerRef(scanner);
}

export function setHeatmapScanner(scanner: any): void {
  setHeatmapScannerRef(scanner);
}

export function setAgentRegistry(registry: any): void {
  setAgentRegistryRef(registry);
}

export function setOrchestrator(orch: any): void {
  setOrchestratorRef(orch);
  attachOrchestratorBroadcasts(orch);
}

export function setWorkspaceManager(wm: any): void {
  setWorkspaceManagerRef(wm);
}

export function setTerminalManager(tm: any): void {
  setTerminalManagerRef(tm);
}

export function setTeamCoordinator(tc: any): void {
  setTeamCoordinatorRef(tc);
  attachTeamCoordinatorBroadcasts(tc);
}

export function setDashboardWindow(window: any): void {
  setDashboardWindowRef(window);
}

export function startServer(): any {
  server.listen(PORT, () => {
    // Startup logging is handled elsewhere.
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Dashboard Server] ❌ Port ${PORT} already in use!`);
      console.error('[Dashboard Server] 💡 Another server is already running on this port.');
    } else {
      console.error('[Dashboard Server] ❌ Server error:', err);
    }
  });

  return server;
}

process.on('SIGINT', () => {
  const { wsClients } = require('./context.js').getClients();
  wsClients.forEach((client: any) => {
    try {
      client.close();
    } catch {
      // Ignore shutdown errors.
    }
  });
  wsClients.clear();

  server.close(() => {
    process.exit(0);
  });
});

export {
  PORT,
  broadcastSSE,
  broadcastUpdate,
  getRefs,
};

export function calculateStats() {
  return calculateStatsImpl(getRefs().agentManager);
}

if (require.main === module) {
  startServer();
}
