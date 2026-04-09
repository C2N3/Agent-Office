import type {
  DashboardAPI,
  DashboardAgent,
  DashboardResumeUtils,
  OfficeCharacters,
  OfficeRenderer,
  TerminalCtor,
} from './shared.js';

export {};

declare global {
  var dashboardAPI: DashboardAPI | undefined;
  var dashboardResumeUtils: DashboardResumeUtils | undefined;
  var openTerminalForAgent: ((agentId: string, openOptions?: Record<string, unknown>) => Promise<unknown> | void) | undefined;
  var openSessionHistory: ((registryId: string, agentName?: string) => void) | undefined;
  var initOffice: (() => void) | undefined;
  var officeCharacters: OfficeCharacters | undefined;
  var officeRenderer: OfficeRenderer | undefined;
  var officeOnAgentCreated: ((agent: DashboardAgent | Record<string, unknown>) => void) | undefined;
  var officeOnAgentUpdated: ((agent: DashboardAgent | Record<string, unknown>) => void) | undefined;
  var officeOnAgentRemoved: ((agent: { id: string } | Record<string, unknown>) => void) | undefined;
  var OFFICE: (Record<string, unknown> & { FRAME_W?: number; FRAME_H?: number }) | undefined;
  var Terminal: TerminalCtor | undefined;
  var FitAddon: { FitAddon: new () => { fit?: () => void } } | undefined;
  var WebLinksAddon: { WebLinksAddon: new () => unknown } | undefined;
}
