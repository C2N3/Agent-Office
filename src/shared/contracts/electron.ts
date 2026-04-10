import type {
  DashboardAgent,
  DashboardAgentRemoval,
  DashboardErrorContext,
  DashboardRecoveryActionResult,
  DashboardWindowActionResult,
} from './dashboard.js';

export type DashboardResizeRequest = {
  width: number;
  height: number;
};

export type ElectronAPI = {
  formatTime: (ms: number) => string;
  resizeWindow: (size: DashboardResizeRequest) => void;
  rendererReady: () => void;
  onAgentAdded: (callback: (data: DashboardAgent) => void) => void;
  onAgentUpdated: (callback: (data: DashboardAgent) => void) => void;
  onAgentRemoved: (callback: (data: DashboardAgentRemoval) => void) => void;
  onAgentsCleaned: (callback: (data: DashboardAgentRemoval) => void) => void;
  onErrorOccurred?: (callback: (data: DashboardErrorContext) => void) => void;
  getAllAgents: () => Promise<DashboardAgent[]>;
  getAvatars: () => Promise<string[]>;
  focusTerminal?: (agentId: string) => Promise<DashboardRecoveryActionResult>;
  openWebDashboard?: () => Promise<DashboardWindowActionResult>;
  executeRecoveryAction?: (errorId: string, action: string) => Promise<DashboardRecoveryActionResult>;
};
