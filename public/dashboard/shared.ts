export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

export const SHARED_AVATAR_FILES = ['avatar_0.webp', 'avatar_1.webp', 'avatar_2.webp', 'avatar_3.webp'] as const;

export type AgentStatus =
  | 'working'
  | 'thinking'
  | 'waiting'
  | 'done'
  | 'completed'
  | 'offline'
  | 'error'
  | 'help';

export type DashboardTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  contextPercent?: number | null;
};

export type DashboardWorkspace = {
  branch?: string | null;
  repositoryName?: string | null;
  worktreePath?: string | null;
};

export type DashboardAgentMetadata = {
  projectSlug?: string | null;
  projectPath?: string | null;
  provider?: string | null;
  tool?: string | null;
  workspace?: DashboardWorkspace | null;
  isSubagent?: boolean;
  [key: string]: unknown;
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
  sessionId?: string | null;
  tokenUsage?: DashboardTokenUsage | null;
  metadata?: DashboardAgentMetadata | null;
  [key: string]: unknown;
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
  cumulativeTokens?: DashboardTokenUsage | null;
  [key: string]: unknown;
};

export type DashboardDayStats = {
  sessions?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  toolUses?: number;
  byModel?: Record<string, DashboardTokenUsage>;
};

export type DashboardHistoryResponse = {
  days: Record<string, DashboardDayStats>;
};

export type DashboardTerminalProfile = {
  id: string;
  title: string;
  [key: string]: unknown;
};

export type DashboardTerminalEntry = {
  xterm: TerminalLike;
  fitAddon: TerminalAddonLike | null;
  element: HTMLDivElement;
  tab: HTMLDivElement;
};

export type CleanupFn = () => void;

export type DashboardResumeUtils = {
  findLatestResumableSession?: (history: unknown[]) => unknown;
  getDirectResumeSessionId?: (agent: DashboardAgent | undefined, openOptions?: Record<string, unknown>) => string | null;
  shouldAutoResumeRegisteredAgent?: (agent: DashboardAgent | undefined, openOptions?: Record<string, unknown>) => boolean;
};

export type DashboardAPI = {
  togglePip?: () => Promise<unknown> | void;
  onPipStateChanged?: (callback: (isOpen: boolean) => void) => CleanupFn | void;
  focusAgent?: (agentId: string) => void;
  createRegisteredAgent?: (data: Record<string, unknown>) => Promise<{ success?: boolean; error?: string | null } | undefined>;
  inspectWorkspaceRepo?: (repoPath: string) => Promise<{ success?: boolean; repository?: Record<string, unknown>; error?: string | null } | undefined>;
  createWorkspaceAgent?: (data: Record<string, unknown>) => Promise<{ success?: boolean; agent?: { id?: string }; workspace?: { worktreePath?: string | null }; bootstrapCommand?: string; error?: string | null } | undefined>;
  mergeWorkspaceAgent?: (registryId: string) => Promise<{ success?: boolean; error?: string | null } | undefined>;
  removeWorkspaceAgent?: (registryId: string) => Promise<{ success?: boolean; error?: string | null } | undefined>;
  listRegisteredAgents?: () => Promise<DashboardAgent[] | undefined>;
  listArchivedAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  listArchivedWorkspaceAgents?: () => Promise<DashboardArchiveItem[] | undefined>;
  updateRegisteredAgent?: (id: string, fields: Record<string, unknown>) => Promise<unknown>;
  toggleRegisteredAgent?: (id: string, enabled: boolean) => Promise<unknown>;
  archiveRegisteredAgent?: (id: string) => Promise<unknown>;
  deleteRegisteredAgent?: (id: string) => Promise<unknown>;
  clearInactiveUnregisteredAgents?: () => Promise<{ success?: boolean; clearedCount?: number; error?: string | null } | undefined>;
  getSessionHistory?: (registryId: string) => Promise<Array<{
    startedAt?: number | string | null;
    endedAt?: number | string | null;
    summary?: { messageCount?: number };
    transcriptPath?: string | null;
    sessionId?: string | null;
    resumeSessionId?: string | null;
    runtimeSessionId?: string | null;
  }> | undefined>;
  getConversation?: (registryId: string, sessionId: string, options?: Record<string, unknown>) => Promise<{
    error?: string;
    messages?: Array<{
      role?: string;
      content?: string;
      timestamp?: number | string | null;
      toolUses?: Array<{ name?: string }>;
      tokens?: { input?: number; output?: number };
      model?: string;
    }>;
  } | undefined>;
  resumeSession?: (registryId: string, sessionId: string) => Promise<{ success?: boolean; error?: string | null } | undefined>;
  setNickname?: (agentId: string, nickname: string) => Promise<unknown>;
  getNickname?: (agentId: string) => Promise<unknown>;
  removeNickname?: (agentId: string) => Promise<unknown>;
  getTerminalProfiles?: () => Promise<{ profiles?: DashboardTerminalProfile[]; defaultProfileId?: string | null } | undefined>;
  setDefaultTerminalProfile?: (profileId: string) => Promise<{ success?: boolean; profiles?: DashboardTerminalProfile[]; defaultProfileId?: string | null } | undefined>;
  createTerminal?: (agentId: string, options?: Record<string, unknown>) => Promise<{ success?: boolean; profileLabel?: string; error?: string | null } | undefined>;
  writeTerminal?: (agentId: string, data: string) => Promise<unknown> | void;
  resizeTerminal?: (agentId: string, cols: number, rows: number) => Promise<unknown> | void;
  destroyTerminal?: (agentId: string) => Promise<unknown> | void;
  onTerminalData?: (callback: (agentId: string, data: string) => void) => CleanupFn | void;
  onTerminalExit?: (callback: (agentId: string, exitCode: number) => void) => CleanupFn | void;
  onPsPolicyBlocked?: (callback: () => void) => CleanupFn | void;
  openPsPolicyTerminal?: () => Promise<unknown> | void;
  [key: string]: unknown;
};

export type ElectronAPI = {
  formatTime: (ms: number) => string;
  resizeWindow: (size: { width: number; height: number }) => void;
  rendererReady: () => void;
  onAgentAdded: (callback: (data: unknown) => void) => void;
  onAgentUpdated: (callback: (data: unknown) => void) => void;
  onAgentRemoved: (callback: (data: unknown) => void) => void;
  onAgentsCleaned: (callback: (data: unknown) => void) => void;
  onErrorOccurred?: (callback: (data: unknown) => void) => void;
  getAllAgents: () => Promise<unknown[]>;
  getAvatars: () => Promise<string[]>;
  focusTerminal?: (agentId: string) => Promise<unknown>;
  openWebDashboard?: () => Promise<unknown>;
  executeRecoveryAction?: (errorId: string, action: string) => Promise<unknown>;
  [key: string]: unknown;
};

export type OfficeCharacter = {
  id: string;
  x: number;
  y: number;
  role?: string | null;
  agentState?: string | null;
  metadata?: Record<string, unknown> | null;
  avatarFile?: string;
  skinIndex?: number;
  [key: string]: unknown;
};

export type OfficeCharacters = {
  characters: Map<string, OfficeCharacter>;
  getCharacterArray: () => OfficeCharacter[];
  [key: string]: unknown;
};

export type OfficeRenderer = {
  screenToWorld?: (clientX: number, clientY: number) => { x: number; y: number };
  [key: string]: unknown;
};

export type TerminalAddonLike = {
  fit?: () => void;
};

export type TerminalLike = {
  cols: number;
  rows: number;
  write: (data: string) => void;
  writeln: (data: string) => void;
  loadAddon: (addon: unknown) => void;
  open: (element: Element) => void;
  focus: () => void;
  dispose: () => void;
  onData: (callback: (data: string) => void) => void;
  hasSelection: () => boolean;
  getSelection: () => string;
  attachCustomKeyEventHandler: (callback: (event: KeyboardEvent) => boolean) => void;
};

export type TerminalCtor = new (options?: Record<string, unknown>) => TerminalLike;

export type DashboardState = {
  agents: Map<string, DashboardAgent>;
  agentHistory: Map<string, DashboardAgentHistoryEntry[]>;
  stats: {
    total: number;
    active: number;
    completed: number;
    totalTokens: number;
    totalCost: number;
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
  stats: { total: 0, active: 0, completed: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
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
  kpiTokens: getElementById('kpiTokens') as HTMLElement,
  kpiCost: getElementById('kpiCost') as HTMLElement,
  kpiErrors: getElementById('kpiErrors') as HTMLElement,
  officeFilterBadge: getElementById('officeFilterBadge') as HTMLElement,
  agentListFilterBadge: getElementById('agentListFilterBadge') as HTMLElement,
  officeFilterToggle: getElementById('officeRegisteredFilterToggle') as HTMLInputElement,
  agentListFilterToggle: getElementById('agentListRegisteredFilterToggle') as HTMLInputElement,
  bulkArchiveBtn: getElementById('bulkArchiveBtn') as HTMLButtonElement,
  archiveGrid: getElementById('archiveGrid') as HTMLElement,
  archiveRefreshBtn: getElementById('archiveRefreshBtn') as HTMLButtonElement,
};

export const dashboardResumeUtils: DashboardResumeUtils = globalThis.dashboardResumeUtils || {};

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

export function escapeText(value: unknown): string {
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
