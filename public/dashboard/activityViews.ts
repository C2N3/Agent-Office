import {
  type DashboardArchiveItem,
  type DashboardDayStats,
  DOM,
  archiveState,
  createDiv,
  escapeText,
  formatDateTime,
  formatNum,
  getDashboardAPI,
  historyState,
  state,
} from './shared.js';

const tooltip = document.getElementById('mcTooltip') as HTMLDivElement | null;

function toMillis(value: number | string | Date | null | undefined): number {
  if (value == null) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
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

function showTooltip(element: HTMLElement, dateString: string, data?: DashboardDayStats) {
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

function hideTooltip() {
  if (!tooltip) return;
  tooltip.style.display = 'none';
}

export async function renderHeatmapView(): Promise<void> {
  await fetchHistory();
  const days = historyState.data?.days || {};

  let totalSessions = 0;
  let activeDays = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  const dates = Object.keys(days).sort();
  for (const date of dates) {
    const sessionCount = days[date].sessions || 0;
    totalSessions += sessionCount;
    if (sessionCount > 0) {
      activeDays++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const statsRoot = document.getElementById('hmStatsRoot');
  if (!statsRoot) return;
  statsRoot.innerHTML = `
    <div class="hm-stat"><span class="hm-stat-lbl">Record Sessions</span><span class="hm-stat-val">${formatNum(totalSessions)}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Active Days</span><span class="hm-stat-val">${activeDays}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Longest Streak</span><span class="hm-stat-val">${bestStreak} d</span></div>
  `;

  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (52 * 7 + today.getDay()));

  const values: number[] = [];
  const cells: Array<{ dateString: string; value: number; dayOfWeek: number }> = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const dateString = cursor.toISOString().slice(0, 10);
    const value = days[dateString]?.sessions || 0;
    values.push(value);
    cells.push({ dateString, value, dayOfWeek: cursor.getDay() });
    cursor.setDate(cursor.getDate() + 1);
  }

  const nonZeroValues = values.filter((value) => value > 0).sort((left, right) => left - right);
  const getLevel = (value: number) => {
    if (value === 0 || nonZeroValues.length === 0) return 0;
    if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.25)] || 1) return 1;
    if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.5)] || 1) return 2;
    if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.75)] || 1) return 3;
    return 4;
  };

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  grid.appendChild(createDiv('hm-month-lbl', ''));
  for (let index = 0; index < 7; index++) {
    grid.appendChild(createDiv('hm-day-lbl', dayLabels[index]));
  }

  let lastMonth = -1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  cells.forEach((cell, index) => {
    const currentDate = new Date(`${cell.dateString}T00:00:00`);
    if (cell.dayOfWeek === 0 || index === 0) {
      const month = currentDate.getMonth();
      grid.appendChild(createDiv('hm-month-lbl', month !== lastMonth ? monthNames[month] : ''));
      lastMonth = month;
    }
    const dayCell = createDiv(`hm-cell l${getLevel(cell.value)}`, '');
    dayCell.dataset.ds = cell.dateString;
    dayCell.onmouseenter = (event) => showTooltip(event.currentTarget as HTMLElement, cell.dateString, days[cell.dateString]);
    dayCell.onmouseleave = hideTooltip;
    grid.appendChild(dayCell);
  });
}

export async function renderUsageView(): Promise<void> {
  // Token/cost usage view removed
}

export async function fetchArchivedAgents(force = false): Promise<DashboardArchiveItem[]> {
  if (archiveState.loading) return archiveState.items || [];
  if (archiveState.items && !force) return archiveState.items;

  archiveState.loading = true;
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
  }

  return archiveState.items || [];
}

export async function renderArchiveView(force = false): Promise<void> {
  if (!DOM.archiveGrid) return;
  DOM.archiveGrid.innerHTML = '<div class="standby-state">Loading archived agent records...</div>';
  const items = await fetchArchivedAgents(force);

  if (!items || items.length === 0) {
    DOM.archiveGrid.innerHTML = '<div class="standby-state">No archived agent records yet.</div>';
    return;
  }

  DOM.archiveGrid.innerHTML = items.map((item) => {
    const workspace = item.workspace || null;
    const sessionHistory = item.sessionHistory || [];
    const lastSession = sessionHistory.length > 0
      ? [...sessionHistory].sort((left, right) => toMillis(right.startedAt) - toMillis(left.startedAt))[0]
      : null;
    const subtitle = workspace
      ? (workspace.repositoryName || item.projectPath || '-')
      : (item.projectPath || item.role || '-');
    const typeBadge = workspace
      ? `<span class="mc-type-badge workspace">WT ${escapeText(workspace.branch || '-')}</span>`
      : '<span class="mc-type-badge">Agent</span>';

    return `
      <article class="archive-card" data-registry-id="${item.id}">
        <div class="archive-card-header">
          <div>
            <div class="archive-card-title">${escapeText(item.name || 'Workspace')}</div>
            <div class="archive-card-subtitle">${escapeText(subtitle)}</div>
          </div>
          ${typeBadge}
        </div>
        ${item.role ? `<div class="archive-card-role">${escapeText(item.role)}</div>` : ''}
        <div class="archive-meta-grid">
          <div><span>Archived</span><strong>${escapeText(formatDateTime(item.archivedAt))}</strong></div>
          <div><span>Last Start</span><strong>${escapeText(formatDateTime(lastSession?.startedAt))}</strong></div>
          <div><span>Last End</span><strong>${escapeText(formatDateTime(lastSession?.endedAt))}</strong></div>
        </div>
        <div class="archive-card-actions">
          <button class="agent-history-btn" data-history-id="${item.id}" data-agent-name="${escapeText(item.name || 'Workspace')}">History</button>
          <button class="agent-delete-btn archive-delete-btn" data-delete-id="${item.id}" title="Delete archived record">Delete</button>
        </div>
      </article>
    `;
  }).join('');
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
    };
  });
}
