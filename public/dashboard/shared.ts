export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

export const SHARED_AVATAR_FILES = ['avatar_0.webp', 'avatar_1.webp', 'avatar_2.webp', 'avatar_3.webp'];

export const state = {
  agents: new Map(),
  agentHistory: new Map(),
  stats: { total: 0, active: 0, completed: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
  connected: false,
  currentView: localStorage.getItem('mc-view') || 'office',
  filters: {
    registeredOnly: localStorage.getItem(REGISTERED_FILTER_STORAGE_KEY) !== 'false'
  }
};

export const archiveState = {
  items: null,
  loading: false,
};

export const historyState = { data: null, mode: 'weeks' };

export const termState = {
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

export const dashboardResumeUtils = globalThis.dashboardResumeUtils || {};

export function getDashboardAPI() {
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
