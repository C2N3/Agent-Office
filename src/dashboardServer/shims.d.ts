declare module '../dashboardAdapter' {
  export function adaptAgentToDashboard(agent: any): any;
}

declare module '../officeLayout' {
  export function loadOfficeLayoutManifest(): any;
  export function resolveOfficeLayoutAssetPath(assetPath: string): string | null;
}

declare module '../main/conversationParser' {
  export function parseConversation(transcriptPath: string, options?: { limit?: number; offset?: number }): any;
  export function getConversationSummary(transcriptPath: string): any;
}
