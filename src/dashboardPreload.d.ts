export {};

declare global {
  interface DashboardAPI {
    getInitialAgents(): Promise<unknown>;
    onInitialData(callback: (data: unknown) => void): () => void;
    onAgentAdded(callback: (data: unknown) => void): () => void;
    onAgentUpdated(callback: (data: unknown) => void): () => void;
    onAgentRemoved(callback: (data: unknown) => void): () => void;
    focusAgent(agentId: string): void;
    togglePip(): Promise<unknown>;
    onPipStateChanged(callback: (isOpen: boolean) => void): () => void;
    createRegisteredAgent(data: unknown): Promise<unknown>;
    inspectWorkspaceRepo(repoPath: string): Promise<unknown>;
    createWorkspaceAgent(data: unknown): Promise<unknown>;
    mergeWorkspaceAgent(registryId: string): Promise<unknown>;
    removeWorkspaceAgent(registryId: string): Promise<unknown>;
    listRegisteredAgents(): Promise<unknown>;
    listArchivedAgents(): Promise<unknown>;
    listArchivedWorkspaceAgents(): Promise<unknown>;
    updateRegisteredAgent(id: string, fields: unknown): Promise<unknown>;
    toggleRegisteredAgent(id: string, enabled: boolean): Promise<unknown>;
    archiveRegisteredAgent(id: string): Promise<unknown>;
    deleteRegisteredAgent(id: string): Promise<unknown>;
    clearInactiveUnregisteredAgents(): Promise<unknown>;
    getSessionHistory(registryId: string): Promise<unknown>;
    getConversation(registryId: string, sessionId: string, options: unknown): Promise<unknown>;
    resumeSession(registryId: string, sessionId: string): Promise<unknown>;
    setNickname(agentId: string, nickname: string): Promise<unknown>;
    getNickname(agentId: string): Promise<unknown>;
    removeNickname(agentId: string): Promise<unknown>;
    getTerminalProfiles(): Promise<unknown>;
    setDefaultTerminalProfile(profileId: string): Promise<unknown>;
    createTerminal(agentId: string, options: unknown): Promise<unknown>;
    writeTerminal(agentId: string, data: string): Promise<unknown>;
    resizeTerminal(agentId: string, cols: number, rows: number): Promise<unknown>;
    destroyTerminal(agentId: string): Promise<unknown>;
    onTerminalData(callback: (agentId: string, data: string) => void): () => void;
    onTerminalExit(callback: (agentId: string, exitCode: number) => void): () => void;
    onPsPolicyBlocked(callback: () => void): () => void;
    openPsPolicyTerminal(): Promise<unknown>;
  }

  interface Window {
    dashboardAPI: DashboardAPI;
  }
}
