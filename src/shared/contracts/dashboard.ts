import type { JsonObject } from './base.js';
import type { TerminalAddonLike, TerminalLike } from './office.js';

export type AgentStatus =
  | 'working'
  | 'thinking'
  | 'waiting'
  | 'done'
  | 'completed'
  | 'offline'
  | 'error'
  | 'help'
  | 'idle';

export type DashboardWorkspace = {
  type?: string | null;
  repositoryPath?: string | null;
  branch?: string | null;
  repositoryName?: string | null;
  worktreePath?: string | null;
  workspaceParent?: string | null;
  startPoint?: string | null;
  baseBranch?: string | null;
  copyPaths?: string[];
  symlinkPaths?: string[];
  bootstrapCommand?: string | null;
};

export type DashboardAgentMetadata = {
  projectSlug?: string | null;
  projectPath?: string | null;
  provider?: string | null;
  tool?: string | null;
  workspace?: DashboardWorkspace | null;
  isSubagent?: boolean;
  isTeammate?: boolean;
  parentId?: string | null;
  permissionMode?: string | null;
  teammateName?: string | null;
  teamName?: string | null;
  endReason?: string | null;
  runtimeSessionId?: string | null;
  resumeSessionId?: string | null;
  source?: string | null;
};

export type DashboardAgent = {
  id: string;
  name?: string | null;
  nickname?: string | null;
  role?: string | null;
  status: AgentStatus | string;
  project?: string | null;
  registryId?: string | null;
  isRegistered?: boolean;
  avatarIndex?: number | null;
  currentTool?: string | null;
  model?: string | null;
  provider?: string | null;
  resumeSessionId?: string | null;
  runtimeSessionId?: string | null;
  sessionId?: string | null;
  tokenUsage?: any | null;
  metadata?: DashboardAgentMetadata | null;
  enabled?: boolean;
  type?: 'main' | 'subagent' | 'teammate' | string;
  lastMessage?: string | null;
  reportTaskId?: string | null;
  reportTeamId?: string | null;
  teamId?: string | null;
  timing?: {
    elapsed?: number;
    active?: boolean;
  };
};

export type DashboardAgentHistoryEntry = {
  state: string;
  ts: number;
};

export type DashboardArchiveItem = {
  id: string;
  name?: string | null;
  role?: string | null;
  archivedAt?: string | number | Date | null;
  projectPath?: string | null;
  workspace?: DashboardWorkspace | null;
  sessionHistory?: Array<{
    startedAt?: number | string | null;
    endedAt?: number | string | null;
  }>;
  cumulativeTokens?: any | null;
};

export type DashboardDayStats = {
  sessions?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  toolUses?: number;
  byModel?: Record<string, any>;
};

export type DashboardHistoryResponse = {
  days: Record<string, DashboardDayStats>;
};

export type DashboardTerminalProfile = {
  id: string;
  title: string;
  command?: string;
  args?: string[];
};

export type DashboardTerminalEntry = {
  xterm: TerminalLike;
  fitAddon: TerminalAddonLike | null;
  element: HTMLDivElement;
  tab: HTMLDivElement;
};

export type DashboardOpenOptions = {
  cwd?: string | null;
  label?: string | null;
  skipAutoResume?: boolean;
  skipProviderBoot?: boolean;
  profileId?: string | null;
  shell?: string | null;
  command?: string | null;
  args?: string[];
  cols?: number;
  rows?: number;
  forceTerminalTab?: boolean;
};

export type DashboardActionResult = {
  success?: boolean;
  error?: string | null;
};

export type DashboardWindowActionResult = DashboardActionResult & {
  action?: 'opened' | 'closed';
};

export type DashboardRecoveryActionResult = DashboardActionResult & {
  reason?: string | null;
};

export type DashboardNicknameResult = DashboardActionResult & {
  nickname?: string | null;
};

export type DashboardAgentRecord = {
  id: string;
  name?: string | null;
  role?: string | null;
  provider?: string | null;
  projectPath?: string | null;
  avatarIndex?: number | null;
  workspace?: DashboardWorkspace | null;
  currentSessionId?: string | null;
  enabled?: boolean;
  archived?: boolean;
  cumulativeTokens?: any | null;
};

export type DashboardRepoInspection = {
  repositoryPath?: string | null;
  repositoryName?: string | null;
  currentBranch?: string | null;
  branches?: string[];
};

export type DashboardRepoInspectionResult = DashboardActionResult & {
  repository?: DashboardRepoInspection;
};

export type DashboardPathRegistrationStrategy = 'auto' | 'existing' | 'worktree';

export type DashboardRegistrationPreview = {
  requestedPath?: string | null;
  normalizedPath?: string | null;
  isGitRepository?: boolean;
  repositoryPath?: string | null;
  repositoryName?: string | null;
  currentBranch?: string | null;
  branches?: string[];
  repositoryInUse?: boolean;
  recommendedStrategy?: DashboardPathRegistrationStrategy;
  effectiveStrategy?: Exclude<DashboardPathRegistrationStrategy, 'auto'>;
  reason?: string | null;
  summary?: string | null;
  worktreeDefaults?: {
    branchName?: string | null;
    baseBranch?: string | null;
    startPoint?: string | null;
    workspaceParent?: string | null;
  } | null;
};

export type DashboardRegistrationPreviewResult = DashboardActionResult & {
  preview?: DashboardRegistrationPreview | null;
};

export type DashboardCreateFromPathPayload = DashboardOpenOptions & {
  name: string;
  role?: string;
  provider?: string | null;
  workspacePath: string;
  strategy?: DashboardPathRegistrationStrategy;
  branchName?: string;
  baseBranch?: string;
  workspaceParent?: string;
  startPoint?: string;
  copyPaths?: string[];
  symlinkPaths?: string[];
  bootstrapCommand?: string;
};

export type DashboardDirectoryPickerOptions = {
  title?: string;
  defaultPath?: string | null;
  buttonLabel?: string;
};

export type DashboardDirectoryPickerResult = DashboardActionResult & {
  canceled?: boolean;
  path?: string | null;
};

export type DashboardWorkspaceActionResult = DashboardActionResult & {
  agent?: DashboardAgentRecord;
  workspace?: DashboardWorkspace | null;
  bootstrapCommand?: string;
  effectiveStrategy?: Exclude<DashboardPathRegistrationStrategy, 'auto'>;
  projectPath?: string | null;
  result?: JsonObject | null;
};

export type DashboardClearInactiveResult = DashboardActionResult & {
  clearedCount?: number;
  clearedIds?: string[];
};

export type DashboardSessionHistoryEntry = {
  startedAt?: number | string | null;
  endedAt?: number | string | null;
  summary?: { messageCount?: number };
  transcriptPath?: string | null;
  sessionId?: string | null;
  resumeSessionId?: string | null;
  runtimeSessionId?: string | null;
};

export type DashboardConversationMessage = {
  role?: string;
  content?: string;
  timestamp?: number | string | null;
  toolUses?: Array<{ name?: string }>;
  tokens?: { input?: number; output?: number };
  model?: string;
};

export type DashboardConversationResponse = {
  error?: string;
  messages?: DashboardConversationMessage[];
};

export type DashboardAgentRemoval = {
  id?: string;
  displayName?: string | null;
  type?: 'single' | 'batch';
  removedIds?: string[];
};

export type DashboardErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export type DashboardErrorContext = {
  id: string;
  timestamp: string;
  code: string;
  name: string;
  message: string;
  userMessage: string;
  explanation: string;
  severity: DashboardErrorSeverity;
  category: string;
  stack?: string;
  recovery: string[];
  context?: JsonObject | null;
};

export type DashboardResumeUtils = {
  findLatestResumableSession?: (history: DashboardSessionHistoryEntry[]) => DashboardSessionHistoryEntry | null | undefined;
  getDirectResumeSessionId?: (agent: DashboardAgent | undefined, openOptions?: DashboardOpenOptions) => string | null;
  shouldAutoResumeRegisteredAgent?: (agent: DashboardAgent | undefined, openOptions?: DashboardOpenOptions) => boolean;
};
export type { DashboardAPI } from './dashboard/api.js';
