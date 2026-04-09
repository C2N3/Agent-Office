type Cleanup = () => void;

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  contextPercent?: number | null;
};

type AgentWorkspace = {
  branch?: string | null;
  repositoryName?: string | null;
  worktreePath?: string | null;
};

type AgentMetadata = {
  projectSlug?: string | null;
  projectPath?: string | null;
  provider?: string | null;
  tool?: string | null;
  workspace?: AgentWorkspace | null;
  isSubagent?: boolean;
  [key: string]: unknown;
};

type DashboardAgent = {
  id: string;
  name?: string | null;
  nickname?: string | null;
  role?: string | null;
  status: string;
  project?: string | null;
  registryId?: string | null;
  isRegistered?: boolean;
  avatarIndex?: number | null;
  currentTool?: string | null;
  model?: string | null;
  provider?: string | null;
  resumeSessionId?: string | null;
  sessionId?: string | null;
  tokenUsage?: TokenUsage | null;
  metadata?: AgentMetadata | null;
  [key: string]: unknown;
};

type DashboardTerminalProfile = {
  id: string;
  title: string;
  [key: string]: unknown;
};

type DashboardResumeUtils = {
  findLatestResumableSession?: (history: unknown[]) => unknown;
  getDirectResumeSessionId?: (agent: DashboardAgent | undefined, openOptions?: Record<string, unknown>) => string | null;
  shouldAutoResumeRegisteredAgent?: (agent: DashboardAgent | undefined, openOptions?: Record<string, unknown>) => boolean;
};

type DashboardAPI = {
  togglePip?: () => Promise<unknown> | void;
  onPipStateChanged?: (callback: (isOpen: boolean) => void) => Cleanup | void;
  focusAgent?: (agentId: string) => void;
  createRegisteredAgent?: (data: Record<string, unknown>) => Promise<{ success?: boolean; error?: string | null } | undefined>;
  inspectWorkspaceRepo?: (repoPath: string) => Promise<any>;
  createWorkspaceAgent?: (data: Record<string, unknown>) => Promise<any>;
  mergeWorkspaceAgent?: (registryId: string) => Promise<any>;
  removeWorkspaceAgent?: (registryId: string) => Promise<any>;
  listRegisteredAgents?: () => Promise<any[]>;
  listArchivedAgents?: () => Promise<any[]>;
  listArchivedWorkspaceAgents?: () => Promise<any[]>;
  updateRegisteredAgent?: (id: string, fields: Record<string, unknown>) => Promise<any>;
  toggleRegisteredAgent?: (id: string, enabled: boolean) => Promise<any>;
  archiveRegisteredAgent?: (id: string) => Promise<any>;
  deleteRegisteredAgent?: (id: string) => Promise<any>;
  clearInactiveUnregisteredAgents?: () => Promise<any>;
  getSessionHistory?: (registryId: string) => Promise<any[]>;
  getConversation?: (registryId: string, sessionId: string, options?: Record<string, unknown>) => Promise<any>;
  resumeSession?: (registryId: string, sessionId: string) => Promise<any>;
  setNickname?: (agentId: string, nickname: string) => Promise<any>;
  getNickname?: (agentId: string) => Promise<any>;
  removeNickname?: (agentId: string) => Promise<any>;
  getTerminalProfiles?: () => Promise<{ profiles?: DashboardTerminalProfile[]; defaultProfileId?: string | null } | undefined>;
  setDefaultTerminalProfile?: (profileId: string) => Promise<any>;
  createTerminal?: (agentId: string, options?: Record<string, unknown>) => Promise<any>;
  writeTerminal?: (agentId: string, data: string) => Promise<any> | void;
  resizeTerminal?: (agentId: string, cols: number, rows: number) => Promise<any> | void;
  destroyTerminal?: (agentId: string) => Promise<any> | void;
  onTerminalData?: (callback: (agentId: string, data: string) => void) => Cleanup | void;
  onTerminalExit?: (callback: (agentId: string, exitCode: number) => void) => Cleanup | void;
  onPsPolicyBlocked?: (callback: () => void) => Cleanup | void;
  openPsPolicyTerminal?: () => Promise<unknown> | void;
  [key: string]: unknown;
};

type ElectronAPI = {
  formatTime: (ms: number) => string;
  resizeWindow: (size: Record<string, unknown>) => void;
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

type OfficeCharacter = {
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

type OfficeCharacters = {
  characters: Map<string, OfficeCharacter>;
  getCharacterArray: () => OfficeCharacter[];
  [key: string]: unknown;
};

type OfficeRenderer = {
  screenToWorld?: (clientX: number, clientY: number) => { x: number; y: number };
  [key: string]: unknown;
};

type TerminalAddonLike = {
  fit?: () => void;
};

type TerminalLike = {
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

type TerminalCtor = new (options?: Record<string, unknown>) => TerminalLike;

declare global {
  interface Window {
    dashboardAPI?: DashboardAPI;
    dashboardResumeUtils?: DashboardResumeUtils;
    electronAPI?: ElectronAPI;
    openSessionHistory?: (registryId: string, agentName?: string) => void;
    openTerminalForAgent?: (agentId: string, openOptions?: Record<string, unknown>) => Promise<unknown> | void;
    initOffice?: () => void;
    officeOnAgentCreated?: (agent: DashboardAgent | Record<string, unknown>) => void;
    officeOnAgentUpdated?: (agent: DashboardAgent | Record<string, unknown>) => void;
    officeOnAgentRemoved?: (agent: { id: string } | Record<string, unknown>) => void;
    officeCharacters?: OfficeCharacters;
    officeRenderer?: OfficeRenderer;
    OFFICE?: Record<string, unknown> & {
      FRAME_W?: number;
      FRAME_H?: number;
    };
    Terminal?: TerminalCtor;
    FitAddon?: {
      FitAddon: new () => TerminalAddonLike;
    };
    WebLinksAddon?: {
      WebLinksAddon: new () => unknown;
    };
  }

  var dashboardAPI: DashboardAPI | undefined;
  var dashboardResumeUtils: DashboardResumeUtils | undefined;
  var electronAPI: ElectronAPI | undefined;
  var openSessionHistory: Window['openSessionHistory'];
  var openTerminalForAgent: Window['openTerminalForAgent'];
  var initOffice: Window['initOffice'];
  var officeOnAgentCreated: Window['officeOnAgentCreated'];
  var officeOnAgentUpdated: Window['officeOnAgentUpdated'];
  var officeOnAgentRemoved: Window['officeOnAgentRemoved'];
  var officeCharacters: OfficeCharacters | undefined;
  var officeRenderer: OfficeRenderer | undefined;
  var OFFICE: Window['OFFICE'];
  var Terminal: TerminalCtor | undefined;
  var FitAddon: Window['FitAddon'];
  var WebLinksAddon: Window['WebLinksAddon'];
}

export {};
