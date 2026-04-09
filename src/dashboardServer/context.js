const refs = {
  agentManager: null,
  sessionScanner: null,
  heatmapScanner: null,
  agentRegistryRef: null,
  missionControlWindow: null,
};

const clients = {
  wsClients: new Set(),
  sseClients: new Set(),
};

function setAgentManager(manager) {
  refs.agentManager = manager;
}

function setSessionScanner(scanner) {
  refs.sessionScanner = scanner;
}

function setHeatmapScanner(scanner) {
  refs.heatmapScanner = scanner;
}

function setAgentRegistry(registry) {
  refs.agentRegistryRef = registry;
}

function setDashboardWindow(window) {
  refs.missionControlWindow = window;
}

function getRefs() {
  return refs;
}

function getClients() {
  return clients;
}

module.exports = {
  clients,
  getClients,
  getRefs,
  refs,
  setAgentManager,
  setAgentRegistry,
  setDashboardWindow,
  setHeatmapScanner,
  setSessionScanner,
};
