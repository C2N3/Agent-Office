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
} from '../../shared/contracts/index.js';

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
} from '../../shared/contracts/index.js';

export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

export type { AvatarCategory, AvatarData } from './avatarCatalog.js';
export {
  refreshSharedAvatarData,
  setSharedAvatarData,
  SHARED_AVATAR_DATA,
  SHARED_AVATAR_FILES,
} from './avatarCatalog.js';

export type DisplayValue = string | number | boolean | null | undefined;

export type DashboardState = {
  agents: Map<string, DashboardAgent>;
  agentHistory: Map<string, DashboardAgentHistoryEntry[]>;
  focusedAgentId: string | null;
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
  profileMenuOpen: boolean;
  psPolicyBlocked: boolean;
  _pendingData?: Map<string, string>;
};

export const state: DashboardState = {
  agents: new Map(),
  agentHistory: new Map(),
  focusedAgentId: null,
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
  profileMenuOpen: false,
  psPolicyBlocked: false,
};

export function getElementById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export const DOM = {
  get statusIndicator(): HTMLElement | null {
    return getElementById('statusIndicator') as HTMLElement | null;
  },
  get connectionStatus(): HTMLElement | null {
    return getElementById('connectionStatus') as HTMLElement | null;
  },
  get agentPanel(): HTMLElement | null {
    return getElementById('agentPanel') as HTMLElement | null;
  },
  get standbyMessage(): HTMLElement | null {
    return getElementById('standbyMessage') as HTMLElement | null;
  },
  get kpiActiveAgents(): HTMLElement | null {
    return getElementById('kpiActiveAgents') as HTMLElement | null;
  },
  get kpiTotalAgents(): HTMLElement | null {
    return getElementById('kpiTotalAgents') as HTMLElement | null;
  },
  get kpiErrors(): HTMLElement | null {
    return getElementById('kpiErrors') as HTMLElement | null;
  },
  get officeFilterBadge(): HTMLElement | null {
    return getElementById('officeFilterBadge') as HTMLElement | null;
  },
  get agentListFilterBadge(): HTMLElement | null {
    return getElementById('agentListFilterBadge') as HTMLElement | null;
  },
  get officeFilterToggle(): HTMLInputElement | null {
    return getElementById('officeRegisteredFilterToggle') as HTMLInputElement | null;
  },
  get agentListFilterToggle(): HTMLInputElement | null {
    return getElementById('agentListRegisteredFilterToggle') as HTMLInputElement | null;
  },
  get bulkArchiveBtn(): HTMLButtonElement | null {
    return getElementById('bulkArchiveBtn') as HTMLButtonElement | null;
  },
  get archiveGrid(): HTMLElement | null {
    return getElementById('archiveGrid') as HTMLElement | null;
  },
  get archiveRefreshBtn(): HTMLButtonElement | null {
    return getElementById('archiveRefreshBtn') as HTMLButtonElement | null;
  },
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
