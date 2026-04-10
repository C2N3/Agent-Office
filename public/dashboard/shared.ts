import * as dashboardResumeUtilsModule from '../dashboardResume.js';

export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

export const SHARED_AVATAR_FILES = ['avatar_0.webp', 'avatar_1.webp', 'avatar_2.webp', 'avatar_3.webp'] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  [key: string]: JsonValue | undefined;
};

export type DisplayValue = string | number | boolean | null | undefined;

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
};

export type DashboardTerminalEntry = {
  xterm: TerminalLike;
  fitAddon: TerminalAddonLike | null;
  element: HTMLDivElement;
  tab: HTMLDivElement;
};

export type CleanupFn = () => void;

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

export type DashboardResizeRequest = {
  width: number;
  height: number;
};

export type DashboardOfficeConfig = {
  FRAME_W?: number;
  FRAME_H?: number;
};

export type DashboardAPI = {
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
  mergeWorkspaceAgent?: (registryId: string) => Promise<DashboardWorkspaceActionResult | undefined>;
  removeWorkspaceAgent?: (registryId: string) => Promise<DashboardWorkspaceActionResult | undefined>;
  listRegisteredAgents?: () => Promise<DashboardAgentRecord[] | undefined>;
  listArchivedAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  listArchivedWorkspaceAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  updateRegisteredAgent?: (id: string, fields: Partial<DashboardAgentRecord>) => Promise<(DashboardActionResult & { agent?: DashboardAgentRecord }) | undefined>;
  toggleRegisteredAgent?: (id: string, enabled: boolean) => Promise<DashboardActionResult | undefined>;
  archiveRegisteredAgent?: (id: string) => Promise<DashboardActionResult | undefined>;
  deleteRegisteredAgent?: (id: string) => Promise<DashboardActionResult | undefined>;
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
};

export type ElectronAPI = {
  formatTime: (ms: number) => string;
  resizeWindow: (size: DashboardResizeRequest) => void;
  rendererReady: () => void;
  onAgentAdded: (callback: (data: DashboardAgent) => void) => void;
  onAgentUpdated: (callback: (data: DashboardAgent) => void) => void;
  onAgentRemoved: (callback: (data: DashboardAgentRemoval) => void) => void;
  onAgentsCleaned: (callback: (data: DashboardAgentRemoval) => void) => void;
  onErrorOccurred?: (callback: (data: DashboardErrorContext) => void) => void;
  getAllAgents: () => Promise<DashboardAgent[]>;
  getAvatars: () => Promise<string[]>;
  focusTerminal?: (agentId: string) => Promise<DashboardRecoveryActionResult>;
  openWebDashboard?: () => Promise<DashboardWindowActionResult>;
  executeRecoveryAction?: (errorId: string, action: string) => Promise<DashboardRecoveryActionResult>;
};

export type OfficeCharacterMetadata = {
  project?: string | null;
  tool?: string | null;
} & JsonObject;

export type OfficeCharacter = {
  id: string;
  x: number;
  y: number;
  role?: string | null;
  agentState?: string | null;
  metadata?: OfficeCharacterMetadata | null;
  avatarFile?: string;
  skinIndex?: number;
};

export type OfficeCharacters = {
  characters: Map<string, OfficeCharacter>;
  getCharacterArray: () => OfficeCharacter[];
};

export type OfficeRenderer = {
  screenToWorld?: (clientX: number, clientY: number) => { x: number; y: number };
};

export type TerminalAddonLike = {
  fit?: () => void;
};

export type WebLinksAddonLike = {
  activate?: () => void;
  dispose?: () => void;
};

export type TerminalLoadableAddon = TerminalAddonLike | WebLinksAddonLike;

export type TerminalLike = {
  cols: number;
  rows: number;
  write: (data: string) => void;
  writeln: (data: string) => void;
  loadAddon: (addon: TerminalLoadableAddon) => void;
  open: (element: Element) => void;
  focus: () => void;
  dispose: () => void;
  onData: (callback: (data: string) => void) => void;
  hasSelection: () => boolean;
  getSelection: () => string;
  attachCustomKeyEventHandler: (callback: (event: KeyboardEvent) => boolean) => void;
};

export type TerminalCtor = new (options?: {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: Record<string, string>;
  cursorBlink?: boolean;
  scrollback?: number;
}) => TerminalLike;

export type DashboardState = {
  agents: Map<string, DashboardAgent>;
  agentHistory: Map<string, DashboardAgentHistoryEntry[]>;
  stats: {
    total: number;
    active: number;
    completed: number;
    errorCount: number;
  };
  connected: boolean;
  currentView: string;
  filters: {
    registeredOnly: boolean;
  };
};

export type ArchiveState = {
  items: DashboardArchiveItem[] | null;
  loading: boolean;
};

export type HistoryState = {
  data: DashboardHistoryResponse | null;
  mode: 'weeks' | 'months';
};

export type TermState = {
  terminals: Map<string, DashboardTerminalEntry>;
  activeId: string | null;
  dataCleanup: CleanupFn | null;
  exitCleanup: CleanupFn | null;
  profiles: DashboardTerminalProfile[];
  defaultProfileId: string | null;
};

export const state: DashboardState = {
  agents: new Map(),
  agentHistory: new Map(),
  stats: { total: 0, active: 0, completed: 0, errorCount: 0 },
  connected: false,
  currentView: localStorage.getItem('mc-view') || 'office',
  filters: {
    registeredOnly: localStorage.getItem(REGISTERED_FILTER_STORAGE_KEY) !== 'false'
  }
};

export const archiveState: ArchiveState = {
  items: null,
  loading: false,
};

export const historyState: HistoryState = { data: null, mode: 'weeks' };

export const termState: TermState = {
  terminals: new Map(),
  activeId: null,
  dataCleanup: null,
  exitCleanup: null,
  profiles: [],
  defaultProfileId: null,
};

export function getElementById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export const DOM = {
  statusIndicator: getElementById('statusIndicator') as HTMLElement,
  connectionStatus: getElementById('connectionStatus') as HTMLElement,
  agentPanel: getElementById('agentPanel') as HTMLElement,
  standbyMessage: getElementById('standbyMessage') as HTMLElement,
  kpiActiveAgents: getElementById('kpiActiveAgents') as HTMLElement,
  kpiTotalAgents: getElementById('kpiTotalAgents') as HTMLElement,
  kpiErrors: getElementById('kpiErrors') as HTMLElement,
  officeFilterBadge: getElementById('officeFilterBadge') as HTMLElement,
  agentListFilterBadge: getElementById('agentListFilterBadge') as HTMLElement,
  officeFilterToggle: getElementById('officeRegisteredFilterToggle') as HTMLInputElement,
  agentListFilterToggle: getElementById('agentListRegisteredFilterToggle') as HTMLInputElement,
  bulkArchiveBtn: getElementById('bulkArchiveBtn') as HTMLButtonElement,
  archiveGrid: getElementById('archiveGrid') as HTMLElement,
  archiveRefreshBtn: getElementById('archiveRefreshBtn') as HTMLButtonElement,
};

export const dashboardResumeUtils: DashboardResumeUtils = dashboardResumeUtilsModule;

export function getDashboardAPI(): DashboardAPI | undefined {
  return globalThis.dashboardAPI;
}

export function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export function formatDateTime(ts: string | number | Date | null | undefined): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '-';
  }
}

export function escapeText(value: DisplayValue): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createDiv(cls: string, txt: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = txt;
  return div;
}
