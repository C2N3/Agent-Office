import {
  type DashboardArchiveItem,
  type DashboardDayStats,
  archiveState,
  getDashboardAPI,
  historyState,
} from './shared.js';
import { dashboardModalRegistry } from './modals/registry.js';

let heatmapTooltipHost: HTMLDivElement | null = null;

export function registerHeatmapTooltipHost(element: HTMLDivElement | null): void {
  heatmapTooltipHost = element;
}

const heatmapListeners = new Set<() => void>();
const archiveListeners = new Set<() => void>();

let heatmapRefreshToken = 0;
let archiveRefreshToken = 0;

export function subscribeHeatmapView(listener: () => void): () => void {
  heatmapListeners.add(listener);
  return () => {
    heatmapListeners.delete(listener);
  };
}

export function subscribeArchiveView(listener: () => void): () => void {
  archiveListeners.add(listener);
  return () => {
    archiveListeners.delete(listener);
  };
}

export function getHeatmapRefreshToken(): number {
  return heatmapRefreshToken;
}

export function getArchiveRefreshToken(): number {
  return archiveRefreshToken;
}

function notifyHeatmapView(): void {
  heatmapRefreshToken++;
  heatmapListeners.forEach((listener) => listener());
}

function notifyArchiveView(): void {
  archiveRefreshToken++;
  archiveListeners.forEach((listener) => listener());
}

async function fetchHistory(): Promise<void> {
  if (historyState.data) return;
  try {
    const response = await fetch('/api/heatmap?days=365');
    historyState.data = await response.json() as { days: Record<string, DashboardDayStats> };
  } catch {
    historyState.data = { days: {} };
  }
}

export function showTooltip(element: HTMLElement, dateString: string, data?: DashboardDayStats) {
  const tooltip = heatmapTooltipHost;
  if (!tooltip) return;
  const bounds = element.getBoundingClientRect();
  tooltip.innerHTML = `<div class="tt-head">${dateString}</div>`;
  if (data) {
    tooltip.innerHTML += `<div class="tt-row"><span>Sessions</span><span class="tt-val">${data.sessions}</span></div>`;
  } else {
    tooltip.innerHTML += '<div style="opacity:0.6;font-style:italic">No activity detected.</div>';
  }
  tooltip.style.display = 'block';
  const left = bounds.left + bounds.width / 2 - tooltip.offsetWidth / 2;
  tooltip.style.left = `${Math.max(10, Math.min(window.innerWidth - tooltip.offsetWidth - 10, left))}px`;
  tooltip.style.top = `${bounds.top - tooltip.offsetHeight - 10}px`;
}

export function hideTooltip() {
  const tooltip = heatmapTooltipHost;
  if (!tooltip) return;
  tooltip.style.display = 'none';
}

export async function renderHeatmapView(): Promise<void> {
  await fetchHistory();
  notifyHeatmapView();
}

export async function renderUsageView(): Promise<void> {
  // Token/cost usage view removed
}

async function loadArchivedAgents(force = false): Promise<DashboardArchiveItem[]> {
  if (archiveState.loading) return archiveState.items || [];
  if (archiveState.items && !force) return archiveState.items;

  archiveState.loading = true;
  notifyArchiveView();
  try {
    let items: DashboardArchiveItem[] = [];
    const dashboardAPI = getDashboardAPI();
    if (dashboardAPI?.listArchivedAgents) {
      items = (await dashboardAPI.listArchivedAgents()) || [];
    } else {
      const response = await fetch('/api/archived-agents');
      items = (await response.json()) as DashboardArchiveItem[];
    }
    archiveState.items = Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('[Archive]', error);
    archiveState.items = [];
  } finally {
    archiveState.loading = false;
    notifyArchiveView();
  }

  return archiveState.items || [];
}

export async function fetchArchivedAgents(force = false): Promise<DashboardArchiveItem[]> {
  return loadArchivedAgents(force);
}

export function openArchivedAgentHistory(historyId: string, agentName = 'Workspace'): void {
  const opener = dashboardModalRegistry.openSessionHistory || globalThis.openSessionHistory;
  opener?.(historyId, agentName || 'Workspace');
}

export async function deleteArchivedAgentRecord(registryId: string): Promise<void> {
  if (!confirm('Delete this archived agent record permanently? This cannot be undone.')) return;
  const deleteResult = getDashboardAPI()?.deleteRegisteredAgent?.(registryId);
  if (!deleteResult) return;
  await deleteResult;
  archiveState.items = null;
  await renderArchiveView(true);
}

export async function renderArchiveView(force = false): Promise<void> {
  await loadArchivedAgents(force);
  notifyArchiveView();
}
