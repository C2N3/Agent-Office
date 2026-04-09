export {};

declare global {
  interface ElectronAPI {
    formatTime(ms: number): string;
    resizeWindow(size: { width: number; height: number }): void;
    rendererReady(): void;
    onAgentAdded(callback: (data: unknown) => void): void;
    onAgentUpdated(callback: (data: unknown) => void): void;
    onAgentRemoved(callback: (data: unknown) => void): void;
    onAgentsCleaned(callback: (data: unknown) => void): void;
    onErrorOccurred(callback: (data: unknown) => void): void;
    getAllAgents(): Promise<unknown>;
    getAvatars(): Promise<unknown>;
    focusTerminal(agentId: string): Promise<unknown>;
    openWebDashboard(): Promise<unknown>;
    executeRecoveryAction(errorId: string, action: string): Promise<unknown>;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
