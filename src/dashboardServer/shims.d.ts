declare module '../dashboardAdapter.js' {
  export function adaptAgentToDashboard(agent: any): any;
}

declare module '../officeLayout.js' {
  export function loadOfficeLayoutManifest(): any;
  export function resolveOfficeLayoutAssetPath(assetPath: string): string | null;
}

declare module '../main/conversationParser.js' {
  export function parseConversation(transcriptPath: string, options?: { limit?: number; offset?: number }): any;
  export function getConversationSummary(transcriptPath: string): any;
}
