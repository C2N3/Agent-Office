import type { DashboardOpenOptions } from '../shared.js';

type OpenTerminalForAgent = (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void;

export function installDashboardRuntimeGlobals(openTerminalForAgent: OpenTerminalForAgent): void {
  globalThis.openTerminalForAgent = openTerminalForAgent;
}
