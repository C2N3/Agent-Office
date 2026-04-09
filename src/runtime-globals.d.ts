import type {
  DashboardAPI,
  DashboardAgent,
  DashboardAgentRemoval,
  DashboardOfficeConfig,
  DashboardOpenOptions,
  DashboardResumeUtils,
  ElectronAPI,
  OfficeCharacters,
  OfficeRenderer,
  TerminalAddonLike,
  TerminalCtor,
  WebLinksAddonLike,
} from '../public/dashboard/shared.js';

declare global {
  interface Window {
    dashboardAPI?: DashboardAPI;
    dashboardResumeUtils?: DashboardResumeUtils;
    electronAPI?: ElectronAPI;
    openSessionHistory?: (registryId: string, agentName?: string) => void;
    openTerminalForAgent?: (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void;
    initOffice?: () => void;
    officeOnAgentCreated?: (agent: DashboardAgent) => void;
    officeOnAgentUpdated?: (agent: DashboardAgent) => void;
    officeOnAgentRemoved?: (agent: DashboardAgentRemoval) => void;
    officeCharacters?: OfficeCharacters;
    officeRenderer?: OfficeRenderer;
    OFFICE?: DashboardOfficeConfig;
    Terminal?: TerminalCtor;
    FitAddon?: {
      FitAddon: new () => TerminalAddonLike;
    };
    WebLinksAddon?: {
      WebLinksAddon: new () => WebLinksAddonLike;
    };
  }

  var dashboardAPI: DashboardAPI | undefined;
  var dashboardResumeUtils: DashboardResumeUtils | undefined;
  var electronAPI: ElectronAPI | undefined;
  var openSessionHistory: Window['openSessionHistory'];
  var openTerminalForAgent: Window['openTerminalForAgent'];
  var initOffice: Window['initOffice'];
  var officeOnAgentCreated: Window['officeOnAgentCreated'];
  var officeOnAgentUpdated: Window['officeOnAgentUpdated'];
  var officeOnAgentRemoved: Window['officeOnAgentRemoved'];
  var officeCharacters: OfficeCharacters | undefined;
  var officeRenderer: OfficeRenderer | undefined;
  var OFFICE: Window['OFFICE'];
  var Terminal: TerminalCtor | undefined;
  var FitAddon: Window['FitAddon'];
  var WebLinksAddon: Window['WebLinksAddon'];
}

export {};
