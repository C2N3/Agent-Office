const http = require('http');

const { PORT } = require('./constants');
const { attachAgentManagerBroadcasts, broadcastSSE, broadcastUpdate } = require('./broadcast');
const {
  getRefs,
  setAgentManager: setAgentManagerRef,
  setAgentRegistry: setAgentRegistryRef,
  setDashboardWindow: setDashboardWindowRef,
  setHeatmapScanner: setHeatmapScannerRef,
  setSessionScanner: setSessionScannerRef,
} = require('./context');
const { calculateStats } = require('./stats');
const { handleRequest } = require('./routes');
const { attachWebSocketUpgrade } = require('./websocket');

const server = http.createServer(handleRequest);
attachWebSocketUpgrade(server);

function setAgentManager(manager) {
  setAgentManagerRef(manager);
  attachAgentManagerBroadcasts(manager);
}

function setSessionScanner(scanner) {
  setSessionScannerRef(scanner);
}

function setHeatmapScanner(scanner) {
  setHeatmapScannerRef(scanner);
}

function setAgentRegistry(registry) {
  setAgentRegistryRef(registry);
}

function setDashboardWindow(window) {
  setDashboardWindowRef(window);
}

function startServer() {
  server.listen(PORT, () => {
    // Startup logging is handled elsewhere.
  });

  server.on('error', (err) => {
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
  const { wsClients } = require('./context').getClients();
  wsClients.forEach((client) => {
    try {
      client.close();
    } catch (e) {
      // Ignore shutdown errors.
    }
  });
  wsClients.clear();

  server.close(() => {
    process.exit(0);
  });
});

module.exports = {
  PORT,
  broadcastSSE,
  broadcastUpdate,
  calculateStats: () => calculateStats(getRefs().agentManager),
  setAgentManager,
  setAgentRegistry,
  setDashboardWindow,
  setHeatmapScanner,
  setSessionScanner,
  startServer,
};

if (require.main === module) {
  startServer();
}
