import type { DashboardAgent } from '../shared.js';

export type DashboardModalRegistry = {
  openAssignTaskModal?: (agent: DashboardAgent) => void;
  openAvatarPickerModal?: (agentId: string, registryId: string) => Promise<void> | void;
  openSessionHistory?: (historyId: string, agentName?: string) => void;
  openTaskReportModal?: (taskId: string) => Promise<void> | void;
  openTeamFormationModal?: (agentId: string, registryId: string) => void;
  openTeamReportModal?: (teamId: string) => Promise<void> | void;
};

export const dashboardModalRegistry: DashboardModalRegistry = {};
