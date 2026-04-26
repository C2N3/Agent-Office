export type DashboardModalRegistry = {
  openCreateAgentModal?: () => void;
  openAvatarPickerModal?: (agentId: string, registryId: string) => Promise<void> | void;
};

export const dashboardModalRegistry: DashboardModalRegistry = {};
