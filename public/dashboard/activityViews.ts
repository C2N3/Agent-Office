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

const MODEL_COLORS = {
  opus: '#e879a0',
  sonnet: '#2f81f7',
  haiku: '#3fb950',
};

const tooltip = document.getElementById('mcTooltip') as HTMLDivElement | null;
type BarDatum = { label: string; value: number };

function toMillis(value: number | string | Date | null | undefined): number {
  if (value == null) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function getModelFamily(modelName: string | null | undefined): 'opus' | 'sonnet' | 'haiku' | null {
  if (!modelName) return null;
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return null;
}

function getModelColor(modelName: string | null | undefined): string {
  const family = getModelFamily(modelName);
  return (family && MODEL_COLORS[family]) || '#8b949e';
}

function getModelDisplayName(modelName: string | null | undefined): string {
  if (!modelName) return 'Unknown';
  const match = modelName.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    return `${match[1].charAt(0).toUpperCase() + match[1].slice(1)} ${match[2]}.${match[3]}`;
  }
  return modelName;
}

function renderModelBreakdown(days: Record<string, DashboardDayStats>): void {
  const root = document.getElementById('modelBreakdownRoot');
  const body = document.getElementById('modelBreakdownBody');
  if (!root || !body) return;

  const totals: Record<string, { inputTokens: number; outputTokens: number; estimatedCost: number }> = {};
  for (const dayStats of Object.values(days)) {
    if (!dayStats.byModel) continue;
    for (const [model, modelStats] of Object.entries(dayStats.byModel)) {
      if (!totals[model]) {
        totals[model] = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
      }
      totals[model].inputTokens += modelStats.inputTokens || 0;
      totals[model].outputTokens += modelStats.outputTokens || 0;
      totals[model].estimatedCost += modelStats.estimatedCost || 0;
    }
  }

  const models = Object.keys(totals);
  if (models.length === 0) {
    root.style.display = 'none';
    return;
  }

  root.style.display = 'block';
  const totalCost = models.reduce((sum, model) => sum + totals[model].estimatedCost, 0);
  const barSegments = models.map((model) => {
    return `<div class="model-seg" style="flex-grow:${Math.max(totals[model].estimatedCost, 0.001)};background:${getModelColor(model)}" title="${getModelDisplayName(model)}: $${totals[model].estimatedCost.toFixed(2)}"></div>`;
  }).join('');
  const legendItems = models
    .sort((left, right) => totals[right].estimatedCost - totals[left].estimatedCost)
    .map((model) => {
      const tokenCount = formatNum(totals[model].inputTokens + totals[model].outputTokens);
      return `<div class="model-legend-item">
        <div class="model-legend-dot" style="background:${getModelColor(model)}"></div>
        <span>${getModelDisplayName(model)}</span>
        <span class="model-legend-val">${tokenCount} tok</span>
        <span class="model-legend-val">$${totals[model].estimatedCost.toFixed(2)}</span>
      </div>`;
    }).join('');

  body.innerHTML = `
    <div class="model-bar-container">${barSegments}</div>
    <div class="model-legend">${legendItems}</div>
  `;

  void totalCost;
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
    tooltip.innerHTML += `<div class="tt-row"><span>Sessions</span><span class="tt-val">${data.sessions}</span></div>
                     <div class="tt-row"><span>Tokens</span><span class="tt-val">${formatNum((data.inputTokens || 0) + (data.outputTokens || 0))}</span></div>
                     <div class="tt-row"><span>Cost</span><span class="tt-val">$${(data.estimatedCost || 0).toFixed(2)}</span></div>`;
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

function aggregateChart(
  days: Record<string, DashboardDayStats>,
  mode: 'weeks' | 'months',
  valueFn: (day: DashboardDayStats) => number
): Array<{ label: string; value: number }> {
  const result: Array<{ label: string; value: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (mode === 'weeks') {
    for (let week = 11; week >= 0; week--) {
      let sum = 0;
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - week * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      const cursor = new Date(weekStart);
      while (cursor <= weekEnd) {
        sum += valueFn(days[cursor.toISOString().slice(0, 10)] || {});
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push({ label: `W${12 - week}`, value: sum });
    }
    return result;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let month = 11; month >= 0; month--) {
    const target = new Date(today.getFullYear(), today.getMonth() - month, 1);
    const year = target.getFullYear();
    const monthIndex = target.getMonth();
    const maxDay = new Date(year, monthIndex + 1, 0).getDate();
    let sum = 0;
    for (let day = 1; day <= maxDay; day++) {
      sum += valueFn(days[`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] || {});
    }
    result.push({ label: monthNames[monthIndex], value: sum });
  }
  return result;
}

function buildBars(data: BarDatum[], colorClass: string, isMoney = false): string {
  const max = Math.max(...data.map((entry) => entry.value), 1);
  const bars = data.map((entry) => {
    const height = entry.value > 0 ? Math.max(4, Math.round((entry.value / max) * 100)) : 0;
    const formatted = entry.value === 0
      ? ''
      : (isMoney ? `$${entry.value.toFixed(2)}` : formatNum(entry.value));
    return `<div class="chart-col">
              <div class="chart-val">${formatted}</div>
              <div class="chart-bar ${colorClass}" style="height:${height}%"></div>
              <div class="chart-lbl">${entry.label}</div>
            </div>`;
  }).join('');
  return `<div class="chart-box">${bars}</div>`;
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
  await fetchHistory();
  const days = historyState.data?.days || {};
  const mode = historyState.mode;

  let totalTokens = 0;
  let totalCost = 0;
  let totalTools = 0;
  let totalSessions = 0;
  Object.values(days).forEach((day) => {
    totalTokens += (day.inputTokens || 0) + (day.outputTokens || 0);
    totalCost += day.estimatedCost || 0;
    totalTools += day.toolUses || 0;
    totalSessions += day.sessions || 0;
  });

  const totalTokensEl = document.getElementById('uTotalTokens');
  const totalCostEl = document.getElementById('uTotalCost');
  const totalToolsEl = document.getElementById('uTotalTools');
  const totalSessionsEl = document.getElementById('uTotalSessions');
  if (!totalTokensEl || !totalCostEl || !totalToolsEl || !totalSessionsEl) return;
  totalTokensEl.textContent = formatNum(totalTokens);
  totalCostEl.textContent = `$${totalCost.toFixed(2)}`;
  totalToolsEl.textContent = formatNum(totalTools);
  totalSessionsEl.textContent = formatNum(totalSessions);

  const tokenChart = aggregateChart(days, mode, (day) => (day.inputTokens || 0) + (day.outputTokens || 0));
  const costChart = aggregateChart(days, mode, (day) => day.estimatedCost || 0);

  const chartTokensRoot = document.getElementById('chartTokensRoot');
  const chartCostRoot = document.getElementById('chartCostRoot');
  if (!chartTokensRoot || !chartCostRoot) return;
  chartTokensRoot.innerHTML = buildBars(tokenChart, 'tokens');
  chartCostRoot.innerHTML = buildBars(costChart, 'cost', true);
  renderModelBreakdown(days);
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
    const tokenUsage = item.cumulativeTokens || {};
    const totalTokens = (tokenUsage.inputTokens || 0) + (tokenUsage.outputTokens || 0);
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
          <div><span>Totals</span><strong>${escapeText(formatNum(totalTokens))} tok / $${(tokenUsage.estimatedCost || 0).toFixed(2)}</strong></div>
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
