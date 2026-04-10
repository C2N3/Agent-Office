export interface DashboardRefs {
  agentManager: any;
  sessionScanner: any;
  heatmapScanner: any;
  agentRegistryRef: any;
  orchestrator: any;
  workspaceManager: any;
  terminalManager: any;
  missionControlWindow: any;
}

export interface DashboardClients {
  wsClients: Set<any>;
  sseClients: Set<any>;
}

export const refs: DashboardRefs = {
  agentManager: null,
  sessionScanner: null,
  heatmapScanner: null,
  agentRegistryRef: null,
  orchestrator: null,
  workspaceManager: null,
  terminalManager: null,
  missionControlWindow: null,
};

export const clients: DashboardClients = {
  wsClients: new Set(),
  sseClients: new Set(),
};

export function setAgentManager(manager: any): void {
  refs.agentManager = manager;
}

export function setSessionScanner(scanner: any): void {
  refs.sessionScanner = scanner;
}

export function setHeatmapScanner(scanner: any): void {
  refs.heatmapScanner = scanner;
}

export function setAgentRegistry(registry: any): void {
  refs.agentRegistryRef = registry;
}

export function setOrchestrator(orchestrator: any): void {
  refs.orchestrator = orchestrator;
}

export function setWorkspaceManager(wm: any): void {
  refs.workspaceManager = wm;
}

export function setTerminalManager(tm: any): void {
  refs.terminalManager = tm;
}

export function setDashboardWindow(window: any): void {
  refs.missionControlWindow = window;
}

export function getRefs(): DashboardRefs {
  return refs;
}

export function getClients(): DashboardClients {
  return clients;
}
