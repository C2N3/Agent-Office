import type {
  DashboardAPI,
  DashboardAgent,
  DashboardAgentRemoval,
  DashboardOfficeConfig,
  DashboardOpenOptions,
  DashboardResumeUtils,
  OfficeCharacters,
  OfficeRenderer,
  TerminalAddonLike,
  TerminalCtor,
  WebLinksAddonLike,
} from './shared.js';

export {};

declare global {
  var dashboardAPI: DashboardAPI | undefined;
  var dashboardResumeUtils: DashboardResumeUtils | undefined;
  var openTerminalForAgent: ((agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void) | undefined;
  var openSessionHistory: ((registryId: string, agentName?: string) => void) | undefined;
  var initOffice: (() => void) | undefined;
  var officeCharacters: OfficeCharacters | undefined;
  var officeRenderer: OfficeRenderer | undefined;
  var officeOnAgentCreated: ((agent: DashboardAgent) => void) | undefined;
  var officeOnAgentUpdated: ((agent: DashboardAgent) => void) | undefined;
  var officeOnAgentRemoved: ((agent: DashboardAgentRemoval) => void) | undefined;
  var OFFICE: DashboardOfficeConfig | undefined;
  var Terminal: TerminalCtor | undefined;
  var FitAddon: { FitAddon: new () => TerminalAddonLike } | undefined;
  var WebLinksAddon: { WebLinksAddon: new () => WebLinksAddonLike } | undefined;
}
