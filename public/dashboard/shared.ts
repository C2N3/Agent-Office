import * as dashboardResumeUtilsModule from '../dashboardResume.js';
import type {
  AgentStatus,
  CleanupFn,
  DashboardAPI,
  DashboardActionResult,
  DashboardAgent,
  DashboardAgentHistoryEntry,
  DashboardAgentRecord,
  DashboardAgentRemoval,
  DashboardArchiveItem,
  DashboardClearInactiveResult,
  DashboardConversationResponse,
  DashboardDayStats,
  DashboardDirectoryPickerOptions,
  DashboardDirectoryPickerResult,
  DashboardErrorContext,
  DashboardHistoryResponse,
  DashboardNicknameResult,
  DashboardOfficeConfig,
  DashboardOpenOptions,
  DashboardPathRegistrationStrategy,
  DashboardRecoveryActionResult,
  DashboardRegistrationPreview,
  DashboardRepoInspectionResult,
  DashboardResumeUtils,
  DashboardSessionHistoryEntry,
  DashboardTerminalEntry,
  DashboardTerminalProfile,
  DashboardWindowActionResult,
  DashboardWorkspaceActionResult,
} from '../../src/shared/contracts/index.js';

export type {
  AgentStatus,
  CleanupFn,
  DashboardAPI,
  DashboardActionResult,
  DashboardAgent,
  DashboardAgentHistoryEntry,
  DashboardAgentRecord,
  DashboardAgentRemoval,
  DashboardArchiveItem,
  DashboardClearInactiveResult,
  DashboardConversationMessage,
  DashboardConversationResponse,
  DashboardDayStats,
  DashboardDirectoryPickerOptions,
  DashboardDirectoryPickerResult,
  DashboardErrorContext,
  DashboardErrorSeverity,
  DashboardHistoryResponse,
  DashboardNicknameResult,
  DashboardOfficeConfig,
  DashboardOpenOptions,
  DashboardPathRegistrationStrategy,
  DashboardRecoveryActionResult,
  DashboardRegistrationPreview,
  DashboardRepoInspection,
  DashboardRepoInspectionResult,
  DashboardResizeRequest,
  DashboardResumeUtils,
  DashboardSessionHistoryEntry,
  DashboardTerminalEntry,
  DashboardTerminalProfile,
  DashboardWindowActionResult,
  DashboardWorkspace,
  DashboardWorkspaceActionResult,
  ElectronAPI,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  OfficeCharacter,
  OfficeCharacterMetadata,
  OfficeCharacters,
  OfficeRenderer,
  TerminalAddonLike,
  TerminalCtor,
  TerminalLike,
  TerminalLoadableAddon,
  WebLinksAddonLike,
} from '../../src/shared/contracts/index.js';

export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

export type AvatarCategory = { name: string; files: string[] };
export type AvatarData = { categories: AvatarCategory[]; allFiles: string[] };

export const SHARED_AVATAR_DATA: AvatarData = {
  categories: [
    { name: 'Origin', files: ['Origin/avatar_0.webp', 'Origin/avatar_1.webp', 'Origin/avatar_2.webp', 'Origin/avatar_3.webp'] },
    { name: 'Vocaloid', files: ['Vocaloid/HatsuneMiku.webp'] },
    { name: 'Custom', files: ['Custom/DT.png'] },
  ],
  allFiles: ['Origin/avatar_0.webp', 'Origin/avatar_1.webp', 'Origin/avatar_2.webp', 'Origin/avatar_3.webp', 'Vocaloid/HatsuneMiku.webp', 'Custom/DT.png'],
};

// Flat list for backward compatibility (indexing)
export const SHARED_AVATAR_FILES = SHARED_AVATAR_DATA.allFiles;

export type DisplayValue = string | number | boolean | null | undefined;

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
  _pendingData?: Map<string, string>;
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
