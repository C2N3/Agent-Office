import type { CleanupFn } from '../base';
import type {
  DashboardActionResult,
  DashboardAgent,
  DashboardAgentRecord,
  DashboardAgentRemoval,
  DashboardArchiveItem,
  DashboardClearInactiveResult,
  DashboardConversationResponse,
  DashboardCreateFromPathPayload,
  DashboardDirectoryPickerOptions,
  DashboardDirectoryPickerResult,
  DashboardNicknameResult,
  DashboardOpenOptions,
  DashboardRecoveryActionResult,
  DashboardRegistrationPreviewResult,
  DashboardRepoInspectionResult,
  DashboardSessionHistoryEntry,
  DashboardTerminalProfile,
  DashboardWindowActionResult,
  DashboardWorkspaceActionResult,
  DashboardPathRegistrationStrategy,
} from '../dashboard';

export type DashboardAPI = {
  platform?: NodeJS.Platform;
  getInitialAgents?: () => Promise<DashboardAgent[]>;
  onInitialData?: (callback: (data: DashboardAgent[]) => void) => CleanupFn | void;
  onAgentAdded?: (callback: (data: DashboardAgent) => void) => CleanupFn | void;
  onAgentUpdated?: (callback: (data: DashboardAgent) => void) => CleanupFn | void;
  onAgentRemoved?: (callback: (data: DashboardAgentRemoval) => void) => CleanupFn | void;
  togglePip?: () => Promise<DashboardWindowActionResult> | void;
  onPipStateChanged?: (callback: (isOpen: boolean) => void) => CleanupFn | void;
  toggleOverlay?: () => Promise<DashboardWindowActionResult> | void;
  onOverlayStateChanged?: (callback: (isOpen: boolean) => void) => CleanupFn | void;
  focusAgent?: (agentId: string) => Promise<DashboardRecoveryActionResult>;
  createRegisteredAgent?: (data: Partial<DashboardAgentRecord> & { name: string; projectPath: string }) => Promise<(DashboardActionResult & { agent?: DashboardAgentRecord }) | undefined>;
  pickDirectory?: (options?: DashboardDirectoryPickerOptions) => Promise<DashboardDirectoryPickerResult | undefined>;
  inspectWorkspaceRepo?: (repoPath: string) => Promise<DashboardRepoInspectionResult | undefined>;
  resolveWorkspaceRegistration?: (data: {
    workspacePath: string;
    name?: string;
    provider?: string | null;
    strategy?: DashboardPathRegistrationStrategy;
    branchName?: string;
  }) => Promise<DashboardRegistrationPreviewResult | undefined>;
  createWorkspaceAgent?: (data: DashboardOpenOptions & {
    name: string;
    role?: string;
    provider?: string | null;
    repoPath: string;
    branchName?: string;
    baseBranch?: string;
    workspaceParent?: string;
    startPoint?: string;
    copyPaths?: string[];
    symlinkPaths?: string[];
    bootstrapCommand?: string;
  }) => Promise<DashboardWorkspaceActionResult | undefined>;
  createAgentFromPath?: (data: DashboardCreateFromPathPayload) => Promise<DashboardWorkspaceActionResult | undefined>;
  mergeWorkspaceAgent?: (registryId: string) => Promise<DashboardWorkspaceActionResult | undefined>;
  removeWorkspaceAgent?: (registryId: string) => Promise<DashboardWorkspaceActionResult | undefined>;
  listRegisteredAgents?: () => Promise<DashboardAgentRecord[] | undefined>;
  listArchivedAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  listArchivedWorkspaceAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  updateRegisteredAgent?: (id: string, fields: Partial<DashboardAgentRecord>) => Promise<(DashboardActionResult & { agent?: DashboardAgentRecord }) | undefined>;
  toggleRegisteredAgent?: (id: string, enabled: boolean) => Promise<DashboardActionResult | undefined>;
  archiveRegisteredAgent?: (id: string) => Promise<DashboardActionResult | undefined>;
  deleteRegisteredAgent?: (id: string) => Promise<DashboardActionResult | undefined>;
  terminateAgentSession?: (agentId: string) => Promise<DashboardActionResult | undefined>;
  clearInactiveUnregisteredAgents?: () => Promise<DashboardClearInactiveResult | undefined>;
  getSessionHistory?: (registryId: string) => Promise<DashboardSessionHistoryEntry[] | undefined>;
  getConversation?: (registryId: string, sessionId: string, options?: { limit?: number; offset?: number }) => Promise<DashboardConversationResponse | undefined>;
  resumeSession?: (registryId: string, sessionId: string) => Promise<(DashboardActionResult & {
    terminalId?: string;
    sessionId?: string | null;
    profileLabel?: string | null;
  }) | undefined>;
  setNickname?: (agentId: string, nickname: string) => Promise<DashboardNicknameResult | undefined>;
  getNickname?: (agentId: string) => Promise<DashboardNicknameResult | undefined>;
  removeNickname?: (agentId: string) => Promise<DashboardActionResult | undefined>;
  getTerminalProfiles?: () => Promise<{ profiles?: DashboardTerminalProfile[]; defaultProfileId?: string | null } | undefined>;
  setDefaultTerminalProfile?: (profileId: string) => Promise<(DashboardActionResult & { profiles?: DashboardTerminalProfile[]; defaultProfileId?: string | null }) | undefined>;
  createTerminal?: (agentId: string, options?: DashboardOpenOptions) => Promise<(DashboardActionResult & {
    existing?: boolean;
    pid?: number;
    profileId?: string | null;
    profileLabel?: string | null;
  }) | undefined>;
  writeTerminal?: (agentId: string, data: string) => Promise<void> | void;
  resizeTerminal?: (agentId: string, cols: number, rows: number) => Promise<void> | void;
  destroyTerminal?: (agentId: string) => Promise<DashboardActionResult | void> | void;
  onTerminalData?: (callback: (agentId: string, data: string) => void) => CleanupFn | void;
  onTerminalExit?: (callback: (agentId: string, exitCode: number) => void) => CleanupFn | void;
  onPsPolicyBlocked?: (callback: () => void) => CleanupFn | void;
  openPsPolicyTerminal?: () => Promise<DashboardActionResult> | void;
  openTaskChatWindow?: (params: {
    agentRegistryId: string;
    agentName?: string | null;
    avatarFile?: string | null;
  }) => Promise<(DashboardActionResult & { alreadyOpen?: boolean }) | undefined>;
  closeTaskChatWindow?: (agentRegistryId: string) => void;
};
