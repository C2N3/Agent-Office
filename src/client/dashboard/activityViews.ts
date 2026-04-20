import {
  type DashboardArchiveItem,
  type DashboardDayStats,
  archiveState,
  getDashboardAPI,
  historyState,
  state,
} from './shared.js';

function getTooltip(): HTMLDivElement | null {
  return document.getElementById('mcTooltip') as HTMLDivElement | null;
}

const heatmapListeners = new Set<() => void>();
const archiveListeners = new Set<() => void>();

let heatmapRefreshToken = 0;
let archiveRefreshToken = 0;

function toMillis(value: number | string | Date | null | undefined): number {
  if (value == null) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

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
  const tooltip = getTooltip();
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
  const tooltip = getTooltip();
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

export async function renderArchiveView(force = false): Promise<void> {
  await loadArchivedAgents(force);
  notifyArchiveView();
}

export function initViewControls() {
  document.querySelectorAll<HTMLButtonElement>('.usage-btn').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll<HTMLButtonElement>('.usage-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      historyState.mode = button.dataset.umode === 'months' ? 'months' : 'weeks';
      renderUsageView();
    };
  });

  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.onclick = () => {
      const target: string = button.dataset.view ?? 'office';
      document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');

      document.querySelectorAll('.view-section').forEach((view) => view.classList.remove('active'));
      const targetView = document.getElementById(`${target}View`);
      if (targetView) targetView.classList.add('active');

      state.currentView = target;
      localStorage.setItem('mc-view', target);

      if (target === 'heatmap') renderHeatmapView();
      else if (target === 'usage') renderUsageView();
      else if (target === 'archive') renderArchiveView();
      else if (target === 'remote') {
        import('./remote/polling.js').then((m) => { m.renderRemoteView(); m.startRemoteViewPolling(); });
      } else if (target === 'cloudflare') {
        import('./cloudflareView.js').then((m) => { m.renderCloudflareView(); m.startCloudflareViewPolling(); });
      }

      if (target !== 'remote') {
        import('./remote/polling.js').then((m) => m.stopRemoteViewPolling());
      }
      if (target !== 'cloudflare') {
        import('./cloudflareView.js').then((m) => m.stopCloudflareViewPolling());
      }
    };
  });
}
