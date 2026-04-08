const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';

const SHARED_AVATAR_FILES = ['avatar_0.webp', 'avatar_1.webp', 'avatar_2.webp', 'avatar_3.webp'];

const state = {
  agents: new Map(),
  agentHistory: new Map(),
  stats: { total: 0, active: 0, completed: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
  connected: false,
  currentView: localStorage.getItem('mc-view') || 'office',
  filters: {
    registeredOnly: localStorage.getItem(REGISTERED_FILTER_STORAGE_KEY) !== 'false'
  }
};

const archiveState = {
  items: null,
  loading: false,
};

const DOM = {
  statusIndicator: document.getElementById('statusIndicator'),
  connectionStatus: document.getElementById('connectionStatus'),
  agentPanel: document.getElementById('agentPanel'),
  standbyMessage: document.getElementById('standbyMessage'),
  kpiActiveAgents: document.getElementById('kpiActiveAgents'),
  kpiTotalAgents: document.getElementById('kpiTotalAgents'),
  kpiTokens: document.getElementById('kpiTokens'),
  kpiCost: document.getElementById('kpiCost'),
  kpiErrors: document.getElementById('kpiErrors'),
  officeFilterBadge: document.getElementById('officeFilterBadge'),
  agentListFilterBadge: document.getElementById('agentListFilterBadge'),
  officeFilterToggle: document.getElementById('officeRegisteredFilterToggle'),
  agentListFilterToggle: document.getElementById('agentListRegisteredFilterToggle'),
  archiveGrid: document.getElementById('archiveGrid'),
  archiveRefreshBtn: document.getElementById('archiveRefreshBtn'),
};

// ─── SSE CONNECTION ───
let sseDelay = 1000;
let sseSource = null;

function connectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  const es = new EventSource('/api/events');
  sseSource = es;

  es.onopen = () => {
    sseDelay = 1000;
    state.connected = true;
    updateConnectionStatus(true);
  };

  es.onerror = () => {
    state.connected = false;
    updateConnectionStatus(false);
    es.close();
    sseSource = null;
    setTimeout(connectSSE, sseDelay);
    sseDelay = Math.min(sseDelay * 2, 30000);
  };

  es.addEventListener('connected', () => fetchInitialData());
  es.addEventListener('agent.created', e => { const d = JSON.parse(e.data).data; updateAgent(d); if (typeof officeOnAgentCreated === 'function') officeOnAgentCreated(d); });
  es.addEventListener('agent.updated', e => { const d = JSON.parse(e.data).data; updateAgent(d); if (typeof officeOnAgentUpdated === 'function') officeOnAgentUpdated(d); });
  es.addEventListener('agent.removed', e => { const d = JSON.parse(e.data).data; removeAgent(d.id); if (typeof officeOnAgentRemoved === 'function') officeOnAgentRemoved(d); });
}

async function fetchInitialData() {
  try {
    const res = await fetch('/api/agents');
    const ags = await res.json();
    for (const a of ags) {
      state.agents.set(a.id, a);
      // Seed timeline history
      if (!state.agentHistory.has(a.id)) {
        state.agentHistory.set(a.id, [{ state: a.status, ts: Date.now() }]);
      }
    }
    recalcStats();
    renderAgentList();
  } catch (e) {
    console.error('Data fetch error:', e);
  }
}

function updateAgent(ag) {
  if (ag.status === 'error') state.stats.errorCount++;
  state.agents.set(ag.id, ag);

  // Track state history for timeline
  const hist = state.agentHistory.get(ag.id) || [];
  const last = hist.length > 0 ? hist[hist.length - 1] : null;
  if (!last || last.state !== ag.status) {
    hist.push({ state: ag.status, ts: Date.now() });
    state.agentHistory.set(ag.id, hist);
  }

  recalcStats();
  updateAgentUI(ag);
}

function removeAgent(id) {
  state.agents.delete(id);
  state.agentHistory.delete(id);
  recalcStats();
  const el = DOM.agentPanel.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  if (getVisibleAgents().length === 0) DOM.standbyMessage.style.display = 'block';
}

// ─── UTILS ───
const formatNum = n => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
};

function formatDateTime(ts) {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '-';
  }
}

function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function recalcStats() {
  const arr = Array.from(state.agents.values());
  state.stats.total = arr.length;
  state.stats.active = arr.filter(a => ['working', 'thinking'].includes(a.status)).length;
  state.stats.totalTokens = arr.reduce((s, a) => s + ((a.tokenUsage?.inputTokens || 0) + (a.tokenUsage?.outputTokens || 0)), 0);
  state.stats.totalCost = arr.reduce((s, a) => s + (a.tokenUsage?.estimatedCost || 0), 0);

  DOM.kpiActiveAgents.innerHTML = `${state.stats.active} <span style="font-size:0.8rem;color:var(--color-text-dark)">/ ${state.stats.total}</span>`;
  DOM.kpiTokens.textContent = formatNum(state.stats.totalTokens);
  DOM.kpiCost.textContent = `$${state.stats.totalCost.toFixed(2)}`;
  DOM.kpiErrors.textContent = state.stats.errorCount.toString();
  if (state.stats.errorCount > 0) DOM.kpiErrors.className = 'kpi-value error';
}

function updateConnectionStatus(up) {
  const b = document.getElementById('disconnectBanner');
  if (up) {
    DOM.statusIndicator.className = 'status-dot connected';
    DOM.connectionStatus.textContent = 'Gateway Online';
    if (b) b.style.display = 'none';
  } else {
    DOM.statusIndicator.className = 'status-dot disconnected';
    DOM.connectionStatus.textContent = 'Disconnected';
    if (b) b.style.display = 'block';
  }
}

// ─── RENDER AGENTS ───
function isRegisteredOnlyFilterEnabled() {
  return !!state.filters.registeredOnly;
}

window.dashboardIsRegisteredOnlyFilterEnabled = isRegisteredOnlyFilterEnabled;

function shouldDisplayAgent(agent) {
  return !isRegisteredOnlyFilterEnabled() || !!agent.isRegistered;
}

window.dashboardShouldDisplayAgent = shouldDisplayAgent;

function getVisibleAgents() {
  return [...state.agents.values()].filter(shouldDisplayAgent);
}

function updateFilterUI() {
  const registeredOnly = isRegisteredOnlyFilterEnabled();
  const badgeText = registeredOnly ? 'Registered Only' : 'All Agents';

  [DOM.officeFilterBadge, DOM.agentListFilterBadge].forEach(badge => {
    if (!badge) return;
    badge.textContent = badgeText;
    badge.classList.toggle('is-off', !registeredOnly);
  });

  [DOM.officeFilterToggle, DOM.agentListFilterToggle].forEach(toggle => {
    if (!toggle) return;
    toggle.checked = registeredOnly;
  });
}

function renderOfficeRoster() {
  for (const ag of state.agents.values()) {
    if (shouldDisplayAgent(ag)) {
      if (typeof officeOnAgentCreated === 'function') officeOnAgentCreated(ag);
      continue;
    }
    if (typeof officeOnAgentRemoved === 'function') officeOnAgentRemoved({ id: ag.id });
  }
}

function setRegisteredOnlyFilter(enabled) {
  state.filters.registeredOnly = !!enabled;
  localStorage.setItem(REGISTERED_FILTER_STORAGE_KEY, enabled ? 'true' : 'false');
  updateFilterUI();
  renderAgentList();
}

function initFilterControls() {
  [DOM.officeFilterToggle, DOM.agentListFilterToggle].forEach(toggle => {
    if (!toggle) return;
    toggle.addEventListener('change', function () {
      setRegisteredOnlyFilter(toggle.checked);
    });
  });
  updateFilterUI();
}

function renderAgentList() {
  const visibleAgents = getVisibleAgents();
  DOM.standbyMessage.style.display = visibleAgents.length === 0 ? 'block' : 'none';
  for (const ag of state.agents.values()) updateAgentUI(ag);
  renderOfficeRoster();
}

function updateAgentUI(ag) {
  // Only show agents that match the current filter in the Agent List
  if (!shouldDisplayAgent(ag)) {
    const existing = DOM.agentPanel.querySelector(`[data-id="${ag.id}"]`);
    if (existing) existing.remove();
    return;
  }
  DOM.standbyMessage.style.display = 'none';
  const existing = DOM.agentPanel.querySelector(`[data-id="${ag.id}"]`);

  const stClass = ['working', 'thinking', 'error', 'done', 'completed', 'offline'].includes(ag.status) ? ag.status : 'waiting';
  const stText = ag.status.toUpperCase();
  const typeHtml = ag.metadata?.isSubagent ? '<span class="mc-type-badge">SUB</span>'
    : (ag.isRegistered ? '<span class="mc-type-badge" style="background:var(--color-info-dim);color:var(--color-info)">REG</span>' : '<span class="mc-type-badge main">MAIN</span>');

  const isAct = ['working', 'thinking'].includes(stClass);
  const actText = ag.currentTool ? `<span class="hl">${ag.currentTool}</span>` : (isAct ? stText : 'Idling...');

  const tokens = formatNum((ag.tokenUsage?.inputTokens || 0) + (ag.tokenUsage?.outputTokens || 0));
  const cost = (ag.tokenUsage?.estimatedCost || 0).toFixed(4);

  const ctxPct = ag.tokenUsage?.contextPercent;
  const hasCtx = ctxPct != null;
  const ctxColor = !hasCtx ? '' : ctxPct > 85 ? 'ctx-high' : ctxPct > 60 ? 'ctx-mid' : 'ctx-low';
  const ctxValText = hasCtx ? `~${ctxPct}%` : '--';
  const workspaceMeta = ag.metadata?.workspace || null;
  const workspaceBranch = workspaceMeta?.branch || '';
  const workspaceRepo = workspaceMeta?.repositoryName || '';
  const workspaceBadge = workspaceBranch
    ? `<span class="mc-type-badge workspace" title="${escapeText(workspaceRepo || 'worktree')}">WT ${escapeText(workspaceBranch)}</span>`
    : '';
  const workspaceSummary = workspaceBranch
    ? `<div class="mc-agent-workspace">${escapeText(workspaceRepo || ag.project || 'workspace')} · ${escapeText(workspaceBranch)}</div>`
    : '';
  const workspaceActions = ag.isRegistered && ag.registryId && workspaceBranch
    ? `
        <button class="agent-workspace-btn merge" data-workspace-merge-id="${ag.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Merge branch and clean up workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8"/><path d="M6 8v4c0 2 2 4 4 4h2"/><path d="M18 8v4c0 2-2 4-4 4h-2"/></svg>
        </button>
        <button class="agent-workspace-btn remove" data-workspace-remove-id="${ag.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Remove workspace and delete branch without merge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      `
    : '';

  // Build timeline segments
  const hist = state.agentHistory.get(ag.id) || [];
  let timelineHtml = '';
  if (hist.length > 0) {
    const now = Date.now();
    const segs = hist.map((h, i) => {
      const end = (i + 1 < hist.length) ? hist[i + 1].ts : now;
      const dur = Math.max(end - h.ts, 1);
      return { state: h.state, dur };
    });
    const segHtml = segs.map(s =>
      `<div class="mc-timeline-seg" style="flex-grow:${s.dur};background:${getStateColor(s.state)}" title="${s.state}"></div>`
    ).join('');
    timelineHtml = `<div class="mc-timeline">${segHtml}</div>`;
  }

  const avFile = SHARED_AVATAR_FILES[ag.avatarIndex != null ? ag.avatarIndex : 0] || SHARED_AVATAR_FILES[0] || 'avatar_0.webp';

  const html = `
    <div class="mc-agent-header">
      <div class="mc-agent-name"><div class="mc-agent-avatar" style="background-image:url('./public/characters/${avFile}')"></div><span class="agent-display-name" data-agent-id="${ag.id}" title="Double-click to rename">${ag.nickname || ag.name || 'Agent'}</span> ${typeHtml} ${workspaceBadge}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div class="mc-agent-status ${stClass}">${stText}</div>
        ${ag.isRegistered && ag.registryId ? `<button class="agent-history-btn" data-history-id="${ag.registryId}" data-agent-name="${ag.nickname || ag.name || 'Agent'}" title="Session History"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></button>` : ''}
        ${workspaceActions}
        ${ag.isRegistered && ag.registryId ? `<button class="agent-avatar-btn" data-avatar-id="${ag.registryId}" data-agent-id="${ag.id}" title="Change avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/></svg></button>` : ''}
        ${ag.isRegistered && ag.registryId ? `<button class="agent-delete-btn" data-delete-id="${ag.registryId}" title="Delete agent">&times;</button>` : ''}
      </div>
    </div>
    ${ag.role ? `<div class="mc-agent-role">${ag.role}</div>` : ''}
    ${workspaceSummary}
    <div class="mc-agent-activity">CMD> ${actText}</div>
    ${timelineHtml}
    <div class="mc-agent-metrics">
      <span>TX: <span class="mc-metric-val">${tokens}</span> tok</span>
      <span>$<span class="mc-metric-val">${cost}</span></span>
    </div>
    <div class="mc-context-gauge" title="Approximate context window usage (estimated from input tokens)">
      <span class="ctx-label">~ctx</span>
      <div class="ctx-track"><div class="ctx-fill ${ctxColor}" style="width:${hasCtx ? ctxPct : 0}%"></div></div>
      <span class="ctx-val">${ctxValText}</span>
    </div>
  `;

  if (existing) {
    existing.innerHTML = html;
    existing.dataset.status = ag.status;
  } else {
    const div = document.createElement('div');
    div.className = 'mc-agent-card';
    div.dataset.id = ag.id;
    div.dataset.status = ag.status;
    div.innerHTML = html;
    DOM.agentPanel.appendChild(div);
  }
}

// ─── TIMELINE STATE COLORS ───
function getStateColor(status) {
  const map = {
    working: 'var(--color-state-working)',
    thinking: 'var(--color-state-thinking)',
    waiting: 'var(--color-state-waiting)',
    done: 'var(--color-state-done)',
    completed: 'var(--color-state-done)',
    error: 'var(--color-state-error)',
  };
  return map[status] || 'var(--color-state-waiting)';
}

// ─── OFFICE CHARACTER CLICK POPOVER ───
const popoverEl = document.getElementById('officePopover');

function hitTestOfficeCharacter(canvas, event) {
  if (typeof officeCharacters === 'undefined') return null;

  // Use camera-aware coordinate conversion if available
  let cx, cy;
  if (typeof officeRenderer !== 'undefined' && officeRenderer.screenToWorld) {
    const world = officeRenderer.screenToWorld(event.clientX, event.clientY);
    cx = world.x;
    cy = world.y;
  } else {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    cx = (event.clientX - rect.left) * scaleX;
    cy = (event.clientY - rect.top) * scaleY;
  }

  const chars = officeCharacters.getCharacterArray();
  // Reverse Y-sort: topmost (highest y) rendered last, so check first
  const sorted = [...chars].sort((a, b) => b.y - a.y);

  const FW = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_W) || 106;
  const FH = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_H) || 140;

  for (const ch of sorted) {
    const left = ch.x - FW / 2;
    const top = ch.y - FH;
    if (cx >= left && cx <= left + FW && cy >= top && cy <= top + FH) {
      return ch;
    }
  }
  return null;
}

function showOfficePopover(canvas, char) {
  const ag = state.agents.get(char.id);
  const name = char.role || (ag && ag.name) || 'Agent';
  const status = (ag && ag.status) || char.agentState || 'idle';
  const stClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(status) ? status : 'waiting';
  const project = (ag && ag.metadata && ag.metadata.projectSlug) || char.metadata?.project || '-';
  const tool = (ag && ag.currentTool) || char.metadata?.tool || '-';
  const model = (ag && ag.model) || '-';
  const inputTok = (ag && ag.tokenUsage?.inputTokens) || 0;
  const outputTok = (ag && ag.tokenUsage?.outputTokens) || 0;
  const cost = (ag && ag.tokenUsage?.estimatedCost) || 0;
  const ctxPct = (ag && ag.tokenUsage?.contextPercent);
  const ctxText = ctxPct != null ? `~${ctxPct}%` : '-';
  const workspaceMeta = ag?.metadata?.workspace || null;
  const branch = escapeText(workspaceMeta?.branch || '-');
  const repository = escapeText(workspaceMeta?.repositoryName || '-');

  popoverEl.innerHTML = `
    <div class="pop-header">
      <span class="pop-name">${name}</span>
      <div class="mc-agent-status ${stClass}" style="font-size:0.6rem">${status.toUpperCase()}</div>
    </div>
    <div class="pop-row"><span>Project</span><span class="pop-val">${project}</span></div>
    <div class="pop-row"><span>Repo</span><span class="pop-val">${repository}</span></div>
    <div class="pop-row"><span>Branch</span><span class="pop-val">${branch}</span></div>
    <div class="pop-row"><span>Tool</span><span class="pop-val">${tool}</span></div>
    <div class="pop-row"><span>Model</span><span class="pop-val">${model}</span></div>
    <div class="pop-row"><span>Tokens</span><span class="pop-val">${formatNum(inputTok + outputTok)}</span></div>
    <div class="pop-row"><span>Cost</span><span class="pop-val">$${cost.toFixed(4)}</span></div>
    <div class="pop-row"><span>Context</span><span class="pop-val">${ctxText}</span></div>
    <button class="pop-terminal-btn" onclick="promptRenameAgent('${char.id}')">Rename</button>
    <button class="pop-terminal-btn" onclick="openTerminalForAgent('${char.id}')">Open Terminal</button>
  `;
  popoverEl.style.display = 'block';

  // Position near the character
  const rect = canvas.getBoundingClientRect();
  const FW = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_W) || 106;
  const FH = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_H) || 140;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  const screenX = rect.left + (char.x - FW / 2) * scaleX;
  const screenY = rect.top + (char.y - FH) * scaleY;

  // Try to position above the character, fall back to below
  const popW = popoverEl.offsetWidth;
  const popH = popoverEl.offsetHeight;
  let left = screenX + (FW * scaleX) / 2 - popW / 2;
  let top = screenY - popH - 8;
  if (top < 4) top = screenY + FH * scaleY + 8;
  left = Math.max(4, Math.min(window.innerWidth - popW - 4, left));
  top = Math.max(4, Math.min(window.innerHeight - popH - 4, top));

  popoverEl.style.left = left + 'px';
  popoverEl.style.top = top + 'px';
}

function hideOfficePopover() {
  popoverEl.style.display = 'none';
}

async function promptRenameAgent(agentId) {
  const ag = state.agents.get(agentId);
  const currentName = (ag && (ag.nickname || ag.name)) || 'Agent';
  const nextName = window.prompt('Rename agent', currentName);
  if (nextName === null || typeof dashboardAPI === 'undefined') return;

  const trimmed = nextName.trim();
  if (trimmed) {
    await dashboardAPI.setNickname(agentId, trimmed);
  } else {
    await dashboardAPI.removeNickname(agentId);
  }
  hideOfficePopover();
}

function setupOfficeClickHandler() {
  const canvas = document.getElementById('office-canvas');
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    const char = hitTestOfficeCharacter(canvas, e);
    if (char) {
      showOfficePopover(canvas, char);
    } else {
      hideOfficePopover();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popoverEl.contains(e.target) && e.target.id !== 'office-canvas') {
      hideOfficePopover();
    }
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOfficePopover();
  });
}

// ─── MODEL BREAKDOWN (Feature 3 Frontend) ───
const MODEL_COLORS = {
  opus: '#e879a0',
  sonnet: '#2f81f7',
  haiku: '#3fb950',
};

function getModelFamily(modelName) {
  if (!modelName) return null;
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return null;
}

function getModelColor(modelName) {
  const fam = getModelFamily(modelName);
  return (fam && MODEL_COLORS[fam]) || '#8b949e';
}

function getModelDisplayName(modelName) {
  if (!modelName) return 'Unknown';
  // "claude-sonnet-4-6" → "Sonnet 4.6"
  const m = modelName.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}`;
  return modelName;
}

function renderModelBreakdown(days) {
  const root = document.getElementById('modelBreakdownRoot');
  const body = document.getElementById('modelBreakdownBody');
  if (!root || !body) return;

  // Aggregate byModel across all days
  const totals = {};
  for (const dayStats of Object.values(days)) {
    if (!dayStats.byModel) continue;
    for (const [model, ms] of Object.entries(dayStats.byModel)) {
      if (!totals[model]) totals[model] = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
      totals[model].inputTokens += ms.inputTokens || 0;
      totals[model].outputTokens += ms.outputTokens || 0;
      totals[model].estimatedCost += ms.estimatedCost || 0;
    }
  }

  const models = Object.keys(totals);
  if (models.length === 0) {
    root.style.display = 'none';
    return;
  }
  root.style.display = 'block';

  const grandCost = models.reduce((s, m) => s + totals[m].estimatedCost, 0);

  // Build proportional bar
  const barSegs = models.map(m => {
    const pct = grandCost > 0 ? (totals[m].estimatedCost / grandCost) : 0;
    return `<div class="model-seg" style="flex-grow:${Math.max(totals[m].estimatedCost, 0.001)};background:${getModelColor(m)}" title="${getModelDisplayName(m)}: $${totals[m].estimatedCost.toFixed(2)}"></div>`;
  }).join('');

  // Build legend
  const legendItems = models
    .sort((a, b) => totals[b].estimatedCost - totals[a].estimatedCost)
    .map(m => {
      const tok = formatNum(totals[m].inputTokens + totals[m].outputTokens);
      const cost = totals[m].estimatedCost.toFixed(2);
      return `<div class="model-legend-item">
        <div class="model-legend-dot" style="background:${getModelColor(m)}"></div>
        <span>${getModelDisplayName(m)}</span>
        <span class="model-legend-val">${tok} tok</span>
        <span class="model-legend-val">$${cost}</span>
      </div>`;
    }).join('');

  body.innerHTML = `
    <div class="model-bar-container">${barSegs}</div>
    <div class="model-legend">${legendItems}</div>
  `;
}

// ─── HEATMAP & USAGE DATA FETCH ───
const historyState = { data: null, mode: 'weeks' };

async function fetchHistory() {
  if (historyState.data) return;
  try {
    const r = await fetch('/api/heatmap?days=365');
    historyState.data = await r.json();
  } catch (e) { historyState.data = { days: {} }; }
}

// ─── HEATMAP RENDERING ───
async function renderHeatmapView() {
  await fetchHistory();
  const daysArr = historyState.data.days || {};

  // Calculate streaks
  let totSes = 0, actDays = 0, bestStk = 0, curStk = 0;
  let dList = Object.keys(daysArr).sort();
  let tmpStk = 0;

  for (const d of dList) {
    let v = daysArr[d].sessions || 0;
    totSes += v;
    if (v > 0) { actDays++; tmpStk++; if (tmpStk > bestStk) bestStk = tmpStk; }
    else tmpStk = 0;
  }

  document.getElementById('hmStatsRoot').innerHTML = `
    <div class="hm-stat"><span class="hm-stat-lbl">Record Sessions</span><span class="hm-stat-val">${formatNum(totSes)}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Active Days</span><span class="hm-stat-val">${actDays}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Longest Streak</span><span class="hm-stat-val">${bestStk} d</span></div>
  `;

  // Build Grid
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = '';

  const t = new Date(); t.setHours(0, 0, 0, 0);
  const start = new Date(t); start.setDate(t.getDate() - (52 * 7 + t.getDay()));

  const allVals = [];
  const cells = [];
  let cur = new Date(start);
  while (cur <= t) {
    const ds = cur.toISOString().slice(0, 10);
    const v = daysArr[ds]?.sessions || 0;
    allVals.push(v);
    cells.push({ d: ds, v: v, dow: cur.getDay() });
    cur.setDate(cur.getDate() + 1);
  }

  const nz = allVals.filter(v => v > 0).sort((a, b) => a - b);
  const getLv = v => {
    if (v === 0 || nz.length === 0) return 0;
    if (v <= nz[Math.floor(nz.length * 0.25)] || 1) return 1;
    if (v <= nz[Math.floor(nz.length * 0.5)] || 1) return 2;
    if (v <= nz[Math.floor(nz.length * 0.75)] || 1) return 3;
    return 4;
  };

  const yLbls = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  grid.appendChild(createDiv('hm-month-lbl', ''));
  for (let i = 0; i < 7; i++) grid.appendChild(createDiv('hm-day-lbl', yLbls[i]));

  let lastM = -1;
  const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  cells.forEach((c, i) => {
    const cd = new Date(c.d + 'T00:00:00');
    if (c.dow === 0 || i === 0) {
      const m = cd.getMonth();
      const p = createDiv('hm-month-lbl', m !== lastM ? mNames[m] : '');
      grid.appendChild(p);
      lastM = m;
    }
    const d = createDiv(`hm-cell l${getLv(c.v)}`, '');
    d.dataset.ds = c.d;
    d.onmouseenter = e => showTooltip(e.target, c.d, daysArr[c.d]);
    d.onmouseleave = hideTooltip;
    grid.appendChild(d);
  });
}

function createDiv(cls, txt) { const d = document.createElement('div'); d.className = cls; d.textContent = txt; return d; }

const tt = document.getElementById('mcTooltip');
function showTooltip(el, dStr, data) {
  const b = el.getBoundingClientRect();
  tt.innerHTML = `<div class="tt-head">${dStr}</div>`;
  if (data) {
    tt.innerHTML += `<div class="tt-row"><span>Sessions</span><span class="tt-val">${data.sessions}</span></div>
                     <div class="tt-row"><span>Tokens</span><span class="tt-val">${formatNum((data.inputTokens || 0) + (data.outputTokens || 0))}</span></div>
                     <div class="tt-row"><span>Cost</span><span class="tt-val">$${(data.estimatedCost || 0).toFixed(2)}</span></div>`;
  } else {
    tt.innerHTML += `<div style="opacity:0.6;font-style:italic">No activity detected.</div>`;
  }
  tt.style.display = 'block';
  let left = b.left + b.width / 2 - tt.offsetWidth / 2;
  tt.style.left = Math.max(10, Math.min(window.innerWidth - tt.offsetWidth - 10, left)) + 'px';
  tt.style.top = (b.top - tt.offsetHeight - 10) + 'px';
}
function hideTooltip() { tt.style.display = 'none'; }

// ─── USAGE CHARTS RENDERING ───
async function renderUsageView() {
  await fetchHistory();
  const days = historyState.data.days || {};
  const mode = historyState.mode;

  let tTok = 0, tCost = 0, tTool = 0, tSes = 0;
  Object.values(days).forEach(d => {
    tTok += (d.inputTokens || 0) + (d.outputTokens || 0);
    tCost += d.estimatedCost || 0;
    tTool += d.toolUses || 0;
    tSes += d.sessions || 0;
  });

  document.getElementById('uTotalTokens').textContent = formatNum(tTok);
  document.getElementById('uTotalCost').textContent = `$${tCost.toFixed(2)}`;
  document.getElementById('uTotalTools').textContent = formatNum(tTool);
  document.getElementById('uTotalSessions').textContent = formatNum(tSes);

  const tChart = aggChart(days, mode, d => (d.inputTokens || 0) + (d.outputTokens || 0));
  const cChart = aggChart(days, mode, d => d.estimatedCost || 0);

  document.getElementById('chartTokensRoot').innerHTML = buildBars(tChart, 'tokens');
  document.getElementById('chartCostRoot').innerHTML = buildBars(cChart, 'cost', true);

  renderModelBreakdown(days);
}

function aggChart(days, mode, valFn) {
  const res = [];
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (mode === 'weeks') {
    for (let w = 11; w >= 0; w--) {
      let s = 0;
      const we = new Date(t); we.setDate(t.getDate() - w * 7);
      const ws = new Date(we); ws.setDate(we.getDate() - 6);
      let c = new Date(ws);
      while (c <= we) { s += valFn(days[c.toISOString().slice(0, 10)] || {}); c.setDate(c.getDate() + 1); }
      res.push({ lbl: `W${12 - w}`, val: s });
    }
  } else {
    const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 11; m >= 0; m--) {
      const target = new Date(t.getFullYear(), t.getMonth() - m, 1);
      const y = target.getFullYear(), mo = target.getMonth();
      const dMax = new Date(y, mo + 1, 0).getDate();
      let s = 0;
      for (let dx = 1; dx <= dMax; dx++) {
        s += valFn(days[`${y}-${String(mo + 1).padStart(2, '0')}-${String(dx).padStart(2, '0')}`] || {});
      }
      res.push({ lbl: mn[mo], val: s });
    }
  }
  return res;
}

function buildBars(data, colorClass, isMoney = false) {
  const max = Math.max(...data.map(d => d.val), 1);
  const bars = data.map(d => {
    const h = d.val > 0 ? Math.max(4, Math.round((d.val / max) * 100)) : 0;
    const fmt = d.val === 0 ? '' : (isMoney ? '$' + d.val.toFixed(2) : formatNum(d.val));
    return `<div class="chart-col">
              <div class="chart-val">${fmt}</div>
              <div class="chart-bar ${colorClass}" style="height:${h}%"></div>
              <div class="chart-lbl">${d.lbl}</div>
            </div>`;
  }).join('');
  return `<div class="chart-box">${bars}</div>`;
}

async function fetchArchivedWorkspaceAgents(force = false) {
  if (archiveState.loading) return archiveState.items || [];
  if (archiveState.items && !force) return archiveState.items;

  archiveState.loading = true;
  try {
    let items = [];
    if (typeof dashboardAPI !== 'undefined' && dashboardAPI.listArchivedWorkspaceAgents) {
      items = await dashboardAPI.listArchivedWorkspaceAgents();
    } else {
      const response = await fetch('/api/archived-workspaces');
      items = await response.json();
    }
    archiveState.items = Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('[Archive]', error);
    archiveState.items = [];
  } finally {
    archiveState.loading = false;
  }

  return archiveState.items;
}

async function renderArchiveView(force = false) {
  if (!DOM.archiveGrid) return;
  DOM.archiveGrid.innerHTML = '<div class="standby-state">Loading archived workspaces...</div>';
  const items = await fetchArchivedWorkspaceAgents(force);

  if (!items || items.length === 0) {
    DOM.archiveGrid.innerHTML = '<div class="standby-state">No archived workspaces yet.</div>';
    return;
  }

  DOM.archiveGrid.innerHTML = items.map((item) => {
    const workspace = item.workspace || {};
    const lastSession = Array.isArray(item.sessionHistory) && item.sessionHistory.length > 0
      ? [...item.sessionHistory].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0]
      : null;
    const tokenUsage = item.cumulativeTokens || {};
    const totalTokens = (tokenUsage.inputTokens || 0) + (tokenUsage.outputTokens || 0);

    return `
      <article class="archive-card" data-registry-id="${item.id}">
        <div class="archive-card-header">
          <div>
            <div class="archive-card-title">${escapeText(item.name || 'Workspace')}</div>
            <div class="archive-card-subtitle">${escapeText(workspace.repositoryName || item.projectPath || '-')}</div>
          </div>
          <span class="mc-type-badge workspace">WT ${escapeText(workspace.branch || '-')}</span>
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
          <button class="agent-delete-btn archive-delete-btn" data-delete-id="${item.id}" title="Delete archived record">&times;</button>
        </div>
      </article>
    `;
  }).join('');
}

// ─── NAV LOGIC ───
document.querySelectorAll('.usage-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.usage-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    historyState.mode = b.dataset.umode;
    renderUsageView();
  }
});

document.querySelectorAll('.nav-item').forEach(b => {
  b.onclick = () => {
    const target = b.dataset.view;
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active');

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`${target}View`);
    if (el) el.classList.add('active');

    state.currentView = target;
    localStorage.setItem('mc-view', target);

    if (target === 'heatmap') renderHeatmapView();
    else if (target === 'usage') renderUsageView();
    else if (target === 'archive') renderArchiveView();
  };
});

// ─── PiP TOGGLE & STATE ───
(function () {
  var pipBtn = document.getElementById('pipToggleBtn');
  var pipPlaceholder = document.getElementById('pipPlaceholder');
  var pipStopBtn = document.getElementById('pipStopBtn');
  var officeCanvas = document.getElementById('office-canvas');

  function setPipState(isOpen) {
    if (pipBtn) pipBtn.classList.toggle('active', isOpen);
    if (pipPlaceholder) pipPlaceholder.style.display = isOpen ? 'flex' : 'none';
    if (officeCanvas) officeCanvas.style.display = isOpen ? 'none' : 'block';
  }

  if (pipBtn) {
    pipBtn.addEventListener('click', function () {
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.togglePip) {
        dashboardAPI.togglePip();
      }
    });
  }

  if (pipStopBtn) {
    pipStopBtn.addEventListener('click', function () {
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.togglePip) {
        dashboardAPI.togglePip();
      }
    });
  }

  // Listen for PiP state changes from main process
  if (typeof dashboardAPI !== 'undefined' && dashboardAPI.onPipStateChanged) {
    dashboardAPI.onPipStateChanged(function (isOpen) {
      setPipState(isOpen);
    });
  }
})();

// ─── TERMINAL MANAGEMENT ───
const termState = {
  terminals: new Map(),     // agentId → { xterm, fitAddon, element, tab }
  activeId: null,
  dataCleanup: null,
  exitCleanup: null,
  profiles: [],
  defaultProfileId: null,
};

function initTerminals() {
  if (typeof dashboardAPI === 'undefined') return;

  if (dashboardAPI.onTerminalData) {
    termState.dataCleanup = dashboardAPI.onTerminalData((agentId, data) => {
      const t = termState.terminals.get(agentId);
      if (t) t.xterm.write(data);
    });
  }

  if (dashboardAPI.onTerminalExit) {
    termState.exitCleanup = dashboardAPI.onTerminalExit((agentId, exitCode) => {
      const t = termState.terminals.get(agentId);
      if (t) {
        t.xterm.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
      }
    });
  }

  if (dashboardAPI.onPsPolicyBlocked) {
    dashboardAPI.onPsPolicyBlocked(() => {
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'flex';
    });
    document.getElementById('psPolicyFixBtn')?.addEventListener('click', () => {
      dashboardAPI.openPsPolicyTerminal();
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
    });
    document.getElementById('psPolicyDismissBtn')?.addEventListener('click', () => {
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
    });
  }
}

function getTerminalProfile(profileId) {
  return termState.profiles.find(profile => profile.id === profileId) || null;
}

function getDefaultTerminalProfile() {
  return getTerminalProfile(termState.defaultProfileId) || termState.profiles[0] || null;
}

function updateTerminalToolbarTitles() {
  const newBtn = document.getElementById('terminalNewBtn');
  if (!newBtn) return;
  const defaultProfile = getDefaultTerminalProfile();
  newBtn.title = defaultProfile
    ? `New Terminal (${defaultProfile.title})`
    : 'New Terminal';
}

function renderTerminalProfileMenu() {
  const menu = document.getElementById('terminalProfileMenu');
  if (!menu) return;

  const defaultProfile = getDefaultTerminalProfile();
  const profiles = termState.profiles;

  if (profiles.length === 0) {
    menu.innerHTML = `
      <div class="terminal-launch-header">
        <div>
          <div class="terminal-launch-title">New Terminal</div>
          <div class="terminal-launch-subtitle">No shell profiles were detected on this machine.</div>
        </div>
        <button class="terminal-launch-close" type="button" data-action="close-terminal-popover">&times;</button>
      </div>
    `;
    return;
  }

  const openItems = profiles.map(profile => `
    <button class="terminal-profile-item" data-action="open-profile" data-profile-id="${escapeText(profile.id)}">
      <span class="terminal-profile-item-main">
        <span class="terminal-profile-item-title">${escapeText(profile.title)}</span>
        <span class="terminal-profile-item-hint">Open a one-off terminal with this shell</span>
      </span>
      ${profile.id === defaultProfile?.id ? '<span class="terminal-profile-badge">Default</span>' : ''}
    </button>
  `).join('');

  const defaultItems = profiles.map(profile => `
    <button class="terminal-profile-item ${profile.id === defaultProfile?.id ? 'selected' : ''}" data-action="set-default-profile" data-profile-id="${escapeText(profile.id)}">
      <span class="terminal-profile-item-main">
        <span class="terminal-profile-item-title">${escapeText(profile.title)}</span>
        <span class="terminal-profile-item-hint">Use when pressing the New Terminal button</span>
      </span>
      <span class="terminal-profile-check">${profile.id === defaultProfile?.id ? '✓' : ''}</span>
    </button>
  `).join('');

  menu.innerHTML = `
    <div class="terminal-launch-header">
      <div>
        <div class="terminal-launch-title">New Terminal</div>
        <div class="terminal-launch-subtitle">Choose a shell for this tab, or change the default profile.</div>
      </div>
      <button class="terminal-launch-close" type="button" data-action="close-terminal-popover">&times;</button>
    </div>
    <button class="terminal-launch-primary" data-action="open-profile" data-profile-id="${escapeText(defaultProfile.id)}">
      <span class="terminal-launch-primary-label">Open default terminal</span>
      <span class="terminal-launch-primary-value">${escapeText(defaultProfile.title)}</span>
    </button>
    <div class="terminal-profile-section-title">Open With</div>
    <div class="terminal-profile-list">${openItems}</div>
    <div class="terminal-profile-divider"></div>
    <div class="terminal-profile-section-title">Default Profile</div>
    <div class="terminal-profile-list">${defaultItems}</div>
  `;
}

function closeTerminalProfileMenu() {
  const menu = document.getElementById('terminalProfileMenu');
  if (menu) menu.style.display = 'none';
}

async function refreshTerminalProfiles() {
  if (typeof dashboardAPI === 'undefined' || !dashboardAPI.getTerminalProfiles) return;
  const result = await dashboardAPI.getTerminalProfiles();
  termState.profiles = Array.isArray(result?.profiles) ? result.profiles : [];
  termState.defaultProfileId = result?.defaultProfileId || termState.profiles[0]?.id || null;
  renderTerminalProfileMenu();
  updateTerminalToolbarTitles();
}

async function ensureTerminalProfilesLoaded() {
  if (termState.profiles.length > 0) return;
  await refreshTerminalProfiles();
}

async function openNewLocalTerminal(profileId) {
  await ensureTerminalProfilesLoaded();
  const profile = getTerminalProfile(profileId) || getDefaultTerminalProfile();
  const id = 'local-' + Date.now();
  return openTerminalForAgent(id, {
    profileId: profile?.id || null,
    label: profile?.title || 'Terminal',
  });
}

function initTerminalProfileMenu() {
  const newBtn = document.getElementById('terminalNewBtn');
  const menu = document.getElementById('terminalProfileMenu');
  if (!newBtn || !menu) return;

  newBtn.addEventListener('click', async () => {
    const willOpen = menu.style.display === 'none';
    if (willOpen) {
      await refreshTerminalProfiles();
      menu.style.display = '';
    } else {
      closeTerminalProfileMenu();
    }
  });

  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;

    const action = item.dataset.action;
    if (action === 'close-terminal-popover') {
      closeTerminalProfileMenu();
      return;
    }

    const profileId = item.dataset.profileId;
    if (!profileId) return;

    if (action === 'open-profile') {
      closeTerminalProfileMenu();
      await openNewLocalTerminal(profileId);
      return;
    }

    if (action === 'set-default-profile' && typeof dashboardAPI !== 'undefined' && dashboardAPI.setDefaultTerminalProfile) {
      const result = await dashboardAPI.setDefaultTerminalProfile(profileId);
      if (result?.success) {
        termState.profiles = Array.isArray(result.profiles) ? result.profiles : termState.profiles;
        termState.defaultProfileId = result.defaultProfileId || profileId;
        renderTerminalProfileMenu();
        updateTerminalToolbarTitles();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !newBtn.contains(e.target)) {
      closeTerminalProfileMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTerminalProfileMenu();
    }
  });
}

async function openTerminalForAgent(agentId, openOptions = {}) {
  // If terminal already exists, just activate it
  if (termState.terminals.has(agentId)) {
    activateTerminalTab(agentId);
    return;
  }

  // Get agent info for cwd and provider
  const agent = state.agents.get(agentId);
  const cwd = openOptions.cwd || agent?.metadata?.projectPath || agent?.project || '';
  const provider = agent?.metadata?.provider || null;
  const agentStatus = agent?.status || '';
  const registryId = agent?.registryId || null;
  const isRegistered = !!agent?.isRegistered;

  // If agent has an active session, focus its external terminal instead of opening a new one
  const isActive = ['working', 'thinking', 'waiting', 'help'].includes(agentStatus);
  if (isActive) {
    if (typeof dashboardAPI !== 'undefined' && dashboardAPI.focusAgent) {
      dashboardAPI.focusAgent(agentId);
    }
    return;
  }

  if (!openOptions.skipAutoResume && provider === 'codex' && isRegistered && registryId && agentStatus === 'offline') {
    const resumed = await resumeLatestRegisteredSession(
      registryId,
      openOptions.label || agent?.nickname || agent?.name || 'Terminal'
    );
    if (resumed) return;
  }

  if (typeof dashboardAPI === 'undefined' || !dashboardAPI.createTerminal) return;

  const result = await dashboardAPI.createTerminal(agentId, {
    cwd,
    profileId: openOptions.profileId || undefined,
  });
  if (!result || !result.success) {
    console.error('[Terminal] Failed to create:', result?.error);
    return;
  }

  createXtermInstance(agentId, openOptions.label || agent?.nickname || agent?.name || result?.profileLabel || 'Terminal');

  if (provider === 'codex' && dashboardAPI.writeTerminal && !openOptions.skipProviderBoot) {
    // Codex agents should boot directly into the Codex CLI instead of a blank shell.
    setTimeout(() => {
      dashboardAPI.writeTerminal(agentId, 'codex\r');
    }, 250);
  }
}

async function resumeRegisteredSession(registryId, sessionId, label) {
  if (!registryId || !sessionId) return { success: false, error: 'Missing session info' };
  if (typeof dashboardAPI === 'undefined' || !dashboardAPI.resumeSession) {
    return { success: false, error: 'Resume is only available in the Electron app' };
  }

  if (termState.terminals.has(registryId)) {
    closeTerminal(registryId);
  }

  const result = await dashboardAPI.resumeSession(registryId, sessionId);
  if (result?.success && typeof createXtermInstance === 'function') {
    createXtermInstance(registryId, label || 'Terminal');
  }
  return result || { success: false, error: 'unknown' };
}

async function resumeLatestRegisteredSession(registryId, label) {
  if (typeof dashboardAPI === 'undefined' || !dashboardAPI.getSessionHistory) return false;

  try {
    const history = await dashboardAPI.getSessionHistory(registryId);
    if (!Array.isArray(history) || history.length === 0) return false;

    const latest = history
      .filter((entry) => !!entry?.sessionId)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];

    if (!latest?.sessionId) return false;

    const result = await resumeRegisteredSession(registryId, latest.sessionId, label);
    return !!result?.success;
  } catch (error) {
    console.error('[Terminal] Auto-resume failed:', error);
    return false;
  }
}

function createXtermInstance(agentId, label) {
  // Check xterm.js is loaded
  if (typeof Terminal === 'undefined') {
    console.error('[Terminal UI] xterm.js not loaded — Terminal is undefined');
    return;
  }

  const container = document.getElementById('terminalContainer');
  const emptyState = document.getElementById('terminalEmptyState');
  if (emptyState) emptyState.style.display = 'none';

  // Create wrapper div — start as active so xterm can measure
  const el = document.createElement('div');
  el.className = 'terminal-instance active';
  el.dataset.agentId = agentId;
  container.appendChild(el);

  // Deactivate all other instances
  container.querySelectorAll('.terminal-instance').forEach(inst => {
    if (inst !== el) inst.classList.remove('active');
  });

  // Create xterm instance
  const xterm = new Terminal({
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    theme: {
      background: '#0b0d0f',
      foreground: '#e6edf3',
      cursor: '#e6edf3',
      selectionBackground: 'rgba(47, 129, 247, 0.3)',
      black: '#0b0d0f',
      red: '#f85149',
      green: '#238636',
      yellow: '#d29922',
      blue: '#2f81f7',
      magenta: '#a371f7',
      cyan: '#39c5cf',
      white: '#e6edf3',
    },
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = (typeof FitAddon !== 'undefined') ? new FitAddon.FitAddon() : null;
  if (fitAddon) xterm.loadAddon(fitAddon);

  if (typeof WebLinksAddon !== 'undefined') {
    xterm.loadAddon(new WebLinksAddon.WebLinksAddon());
  }

  xterm.open(el);

  // Create tab
  const tab = addTerminalTab(agentId, label);
  termState.terminals.set(agentId, { xterm, fitAddon, element: el, tab });
  termState.activeId = agentId;

  // Mark tab active
  document.querySelectorAll('.terminal-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  // Fit after DOM has fully settled (multiple rAF to ensure layout is complete)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (fitAddon) {
        try { fitAddon.fit(); } catch (e) { console.warn('[Terminal UI] fit error:', e); }
        if (dashboardAPI.resizeTerminal) {
          dashboardAPI.resizeTerminal(agentId, xterm.cols, xterm.rows);
        }
      }
      xterm.focus();
    });
  });

  // Clipboard: Ctrl+C (when selection exists) = copy, Ctrl+V = paste
  xterm.attachCustomKeyEventHandler((ev) => {
    if (ev.ctrlKey && ev.key === 'c' && xterm.hasSelection()) {
      navigator.clipboard.writeText(xterm.getSelection());
      return false; // prevent sending to PTY
    }
    if (ev.ctrlKey && ev.key === 'v') {
      navigator.clipboard.readText().then(text => {
        if (text && dashboardAPI.writeTerminal) {
          dashboardAPI.writeTerminal(agentId, text);
        }
      });
      return false;
    }
    return true;
  });

  // Forward keystrokes to main process
  xterm.onData(data => {
    if (dashboardAPI.writeTerminal) {
      dashboardAPI.writeTerminal(agentId, data);
    }
  });

  // Resize observer
  const ro = new ResizeObserver(() => {
    if (termState.activeId === agentId && fitAddon) {
      try {
        fitAddon.fit();
        if (dashboardAPI.resizeTerminal) {
          dashboardAPI.resizeTerminal(agentId, xterm.cols, xterm.rows);
        }
      } catch (e) { /* ignore resize errors during layout transitions */ }
    }
  });
  ro.observe(el);
}

function addTerminalTab(agentId, label) {
  const list = document.getElementById('terminalTabsList');
  const tab = document.createElement('div');
  tab.className = 'terminal-tab';
  tab.dataset.agentId = agentId;
  tab.innerHTML = `
    <span class="terminal-tab-dot"></span>
    <span class="terminal-tab-label">${label}</span>
    <button class="terminal-tab-close" title="Close">&times;</button>
  `;

  tab.addEventListener('click', (e) => {
    if (e.target.classList.contains('terminal-tab-close')) {
      closeTerminal(agentId);
    } else {
      activateTerminalTab(agentId);
    }
  });

  list.appendChild(tab);
  return tab;
}

function activateTerminalTab(agentId) {
  // Deactivate all
  for (const [id, t] of termState.terminals) {
    t.element.classList.remove('active');
    t.tab.classList.remove('active');
  }

  // Activate target
  const t = termState.terminals.get(agentId);
  if (t) {
    t.element.classList.add('active');
    t.tab.classList.add('active');
    termState.activeId = agentId;
    requestAnimationFrame(() => {
      t.fitAddon.fit();
      t.xterm.focus();
    });
  }
}

function closeTerminal(agentId) {
  const t = termState.terminals.get(agentId);
  if (!t) return;

  t.xterm.dispose();
  t.element.remove();
  t.tab.remove();
  termState.terminals.delete(agentId);

  if (dashboardAPI.destroyTerminal) {
    dashboardAPI.destroyTerminal(agentId);
  }

  // Activate another tab or show empty state
  if (termState.terminals.size > 0) {
    const nextId = termState.terminals.keys().next().value;
    activateTerminalTab(nextId);
  } else {
    termState.activeId = null;
    const emptyState = document.getElementById('terminalEmptyState');
    if (emptyState) emptyState.style.display = '';
  }
}

// ─── RESIZABLE PANELS ───
function initResizableHandles() {
  // Vertical handle: resize left/right columns
  const resizeV = document.getElementById('resizeV');
  const leftCol = document.getElementById('leftCol');
  const mainLayout = document.getElementById('mainLayout');

  if (resizeV && leftCol && mainLayout) {
    let startX, startW;
    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newW = Math.max(280, Math.min(startW + dx, mainLayout.clientWidth - 306));
      leftCol.style.width = newW + 'px';
      // Refit active terminal
      fitActiveTerminal();
    };
    const onMouseUp = () => {
      resizeV.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    resizeV.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = leftCol.offsetWidth;
      resizeV.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // Horizontal handle: resize office/agent-list split
  const resizeH = document.getElementById('resizeH');
  const officePanel = document.getElementById('officePanel');
  const agentListPanel = document.getElementById('agentListPanel');

  if (resizeH && officePanel && agentListPanel && leftCol) {
    let startY, startOfficeH, totalH;
    const onMouseMove = (e) => {
      const dy = e.clientY - startY;
      const newOfficeH = Math.max(150, Math.min(startOfficeH + dy, totalH - 106));
      officePanel.style.flex = 'none';
      officePanel.style.height = newOfficeH + 'px';
      agentListPanel.style.flex = '1';
    };
    const onMouseUp = () => {
      resizeH.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    resizeH.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startOfficeH = officePanel.offsetHeight;
      totalH = leftCol.offsetHeight;
      resizeH.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

function fitActiveTerminal() {
  if (termState.activeId) {
    const t = termState.terminals.get(termState.activeId);
    if (t && t.fitAddon) {
      try {
        t.fitAddon.fit();
        if (dashboardAPI.resizeTerminal) {
          dashboardAPI.resizeTerminal(termState.activeId, t.xterm.cols, t.xterm.rows);
        }
      } catch (e) { /* ignore */ }
    }
  }
}

// ─── BOOT ───
function initApp() {
  initFilterControls();

  // Sync startup view
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  let btn = document.querySelector(`[data-view="${state.currentView}"]`);
  if (!btn) btn = document.querySelector(`[data-view="office"]`);
  btn.classList.add('active');
  bClickObj = btn;
  const target = bClickObj.dataset.view;
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const tgtEl = document.getElementById(`${target}View`);
  if (tgtEl) tgtEl.classList.add('active');

  connectSSE();
  initTerminals();
  initTerminalProfileMenu();
  refreshTerminalProfiles().catch(e => console.error('[Terminal Profiles]', e));
  initResizableHandles();
  if (target === 'heatmap') renderHeatmapView();
  else if (target === 'usage') renderUsageView();
  else if (target === 'archive') renderArchiveView();

  // We rely on standard office-init.js to boot the canvas logic
  if (typeof initOffice === 'function') setTimeout(() => {
    initOffice();
    setupOfficeClickHandler();
  }, 100);

  // Agent card click → open terminal
  const agentPanel = document.getElementById('agentPanel');
  if (agentPanel) {
    agentPanel.addEventListener('click', function (e) {
      // History button
      const histBtn = e.target.closest('.agent-history-btn');
      if (histBtn && histBtn.dataset.historyId) {
        e.stopPropagation();
        openSessionHistory(histBtn.dataset.historyId, histBtn.dataset.agentName || 'Agent');
        return;
      }
      const mergeBtn = e.target.closest('.agent-workspace-btn.merge');
      if (mergeBtn && mergeBtn.dataset.workspaceMergeId) {
        e.stopPropagation();
        if (confirm(`Merge branch "${mergeBtn.dataset.branch || ''}" and archive this workspace agent?`)) {
          if (typeof dashboardAPI !== 'undefined' && dashboardAPI.mergeWorkspaceAgent) {
            dashboardAPI.mergeWorkspaceAgent(mergeBtn.dataset.workspaceMergeId)
              .then((result) => {
                if (!result?.success) {
                  alert(result?.error || 'Workspace merge failed.');
                } else {
                  archiveState.items = null;
                  if (state.currentView === 'archive') renderArchiveView(true);
                }
              });
          }
        }
        return;
      }
      const removeWorkspaceBtn = e.target.closest('.agent-workspace-btn.remove');
      if (removeWorkspaceBtn && removeWorkspaceBtn.dataset.workspaceRemoveId) {
        e.stopPropagation();
        if (confirm(`Remove workspace branch "${removeWorkspaceBtn.dataset.branch || ''}" without merge and archive this agent?`)) {
          if (typeof dashboardAPI !== 'undefined' && dashboardAPI.removeWorkspaceAgent) {
            dashboardAPI.removeWorkspaceAgent(removeWorkspaceBtn.dataset.workspaceRemoveId)
              .then((result) => {
                if (!result?.success) {
                  alert(result?.error || 'Workspace removal failed.');
                } else {
                  archiveState.items = null;
                  if (state.currentView === 'archive') renderArchiveView(true);
                }
              });
          }
        }
        return;
      }
      // Delete button
      const deleteBtn = e.target.closest('.agent-delete-btn');
      if (deleteBtn && deleteBtn.dataset.deleteId) {
        e.stopPropagation();
        if (confirm('Delete this agent?')) {
          if (typeof dashboardAPI !== 'undefined' && dashboardAPI.deleteRegisteredAgent) {
            dashboardAPI.deleteRegisteredAgent(deleteBtn.dataset.deleteId).then(() => {
              archiveState.items = null;
              if (state.currentView === 'archive') renderArchiveView(true);
            });
          }
        }
        return;
      }
      // Don't trigger on double-click (nickname edit)
      if (e.target.closest('.nickname-input') || e.target.closest('.agent-display-name')) return;
      const card = e.target.closest('.mc-agent-card');
      if (card && card.dataset.id) {
        openTerminalForAgent(card.dataset.id);
      }
    });
  }

  if (DOM.archiveRefreshBtn) {
    DOM.archiveRefreshBtn.addEventListener('click', () => {
      renderArchiveView(true);
    });
  }

  if (DOM.archiveGrid) {
    DOM.archiveGrid.addEventListener('click', (e) => {
      const historyBtn = e.target.closest('.agent-history-btn');
      if (historyBtn && historyBtn.dataset.historyId) {
        e.stopPropagation();
        openSessionHistory(historyBtn.dataset.historyId, historyBtn.dataset.agentName || 'Workspace');
        return;
      }

      const deleteBtn = e.target.closest('.archive-delete-btn');
      if (deleteBtn && deleteBtn.dataset.deleteId) {
        e.stopPropagation();
        if (confirm('Delete this archived workspace record?')) {
          if (typeof dashboardAPI !== 'undefined' && dashboardAPI.deleteRegisteredAgent) {
            dashboardAPI.deleteRegisteredAgent(deleteBtn.dataset.deleteId).then(() => {
              archiveState.items = null;
              renderArchiveView(true);
            });
          }
        }
      }
    });
  }

}

document.addEventListener('DOMContentLoaded', initApp);

// ─── NICKNAME INLINE EDIT ───
(function setupNicknameEdit() {
  const panel = document.getElementById('agentPanel');
  if (!panel) return;

  panel.addEventListener('dblclick', function (e) {
    const nameEl = e.target.closest('.agent-display-name');
    if (!nameEl || nameEl.querySelector('input')) return;

    const agentId = nameEl.dataset.agentId;
    const currentName = nameEl.textContent.trim();

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'nickname-input';
    input.style.cssText = 'background:#1a1d23;color:#e6edf3;border:1px solid #3b82f6;border-radius:4px;padding:1px 4px;font:inherit;width:100%;outline:none;';

    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    function save() {
      const val = input.value.trim();
      if (val && val !== currentName && typeof dashboardAPI !== 'undefined') {
        dashboardAPI.setNickname(agentId, val);
      } else if (!val && typeof dashboardAPI !== 'undefined') {
        dashboardAPI.removeNickname(agentId);
      }
      // UI will refresh via agent-updated event
      input.remove();
      nameEl.textContent = val || currentName;
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); input.value = currentName; input.blur(); }
    });
  });
})();

// ─── AGENT CREATION MODAL ───
(function setupAgentModal() {
  const modal = document.getElementById('createAgentModal');
  const form = document.getElementById('createAgentForm');
  const openBtn = document.getElementById('createAgentBtn');
  const cancelBtn = document.getElementById('cancelCreateBtn');
  const errorEl = document.getElementById('createAgentError');
  const modeBtns = document.querySelectorAll('#createModeSelect .provider-btn');
  const existingFields = document.getElementById('existingAgentFields');
  const worktreeFields = document.getElementById('worktreeAgentFields');
  const repoPathInput = document.getElementById('agentRepoPathInput');
  const branchInput = document.getElementById('agentBranchInput');
  const baseBranchInput = document.getElementById('agentBaseBranchInput');
  const baseBranchList = document.getElementById('agentBaseBranchList');
  const branchModeInput = document.getElementById('agentBranchModeInput');
  const startPointInput = document.getElementById('agentStartPointInput');
  const inspectStatusEl = document.getElementById('agentRepoInspectStatus');
  if (!modal || !form || !openBtn || !existingFields || !worktreeFields) return;

  let createMode = 'existing';
  let selectedProvider = 'claude';
  let branchMode = 'auto';
  let baseBranchTouched = false;
  let startPointTouched = false;
  let lastInspectedRepoPath = '';
  let inspectTimer = null;
  let repoInspection = null;

  const providerBtns = document.querySelectorAll('#providerSelect .provider-btn');
  providerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      providerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.provider;
      syncAutoBranch();
    });
  });

  function setCreateMode(nextMode) {
    createMode = nextMode === 'worktree' ? 'worktree' : 'existing';
    modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === createMode));
    existingFields.style.display = createMode === 'existing' ? '' : 'none';
    worktreeFields.style.display = createMode === 'worktree' ? '' : 'none';
  }

  function resetProviderSelection() {
    providerBtns.forEach(btn => btn.classList.remove('active'));
    if (providerBtns[0]) providerBtns[0].classList.add('active');
    selectedProvider = 'claude';
  }

  function resetFormState() {
    form.reset();
    setCreateMode('existing');
    resetProviderSelection();
    branchMode = 'auto';
    baseBranchTouched = false;
    startPointTouched = false;
    lastInspectedRepoPath = '';
    repoInspection = null;
    updateBranchModeLabel();
    if (baseBranchList) baseBranchList.innerHTML = '';
    if (inspectStatusEl) inspectStatusEl.textContent = 'Enter a repository path to inspect branches.';
    if (errorEl) errorEl.textContent = '';
    const openTerminalCheckbox = document.getElementById('workspaceOpenTerminalInput');
    if (openTerminalCheckbox) openTerminalCheckbox.checked = true;
  }

  function closeModal() {
    modal.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
  }

  function parsePathListValue(inputId) {
    return String(document.getElementById(inputId)?.value || '')
      .split(/\r?\n|,/)
      .map(entry => entry.trim())
      .filter(Boolean);
  }

  function updateBranchModeLabel() {
    if (branchModeInput) branchModeInput.value = branchMode === 'auto' ? 'Auto' : 'Custom';
  }

  function suggestBranchName() {
    const agentName = document.getElementById('agentNameInput')?.value.trim() || 'agent';
    const slug = agentName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent';
    const providerSegment = selectedProvider || 'general';
    return `workspace/${providerSegment}/${slug}`;
  }

  function syncAutoBranch() {
    if (branchMode !== 'auto' || !branchInput) return;
    branchInput.value = suggestBranchName();
  }

  function syncStartPointToBaseBranch() {
    if (startPointTouched || !startPointInput || !baseBranchInput) return;
    startPointInput.value = baseBranchInput.value.trim();
  }

  function populateBaseBranchOptions(branches = []) {
    if (!baseBranchList) return;
    baseBranchList.innerHTML = branches
      .map((branch) => `<option value="${escapeText(branch)}"></option>`)
      .join('');
  }

  async function inspectRepository(repoPath) {
    const trimmedPath = String(repoPath || '').trim();
    if (!trimmedPath) {
      lastInspectedRepoPath = '';
      repoInspection = null;
      populateBaseBranchOptions([]);
      if (!baseBranchTouched && baseBranchInput) {
        baseBranchInput.value = '';
      }
      if (!startPointTouched && startPointInput) {
        startPointInput.value = '';
      }
      if (inspectStatusEl) inspectStatusEl.textContent = 'Enter a repository path to inspect branches.';
      return;
    }
    if (trimmedPath === lastInspectedRepoPath) return;
    lastInspectedRepoPath = trimmedPath;
    repoInspection = null;
    if (inspectStatusEl) inspectStatusEl.textContent = 'Inspecting repository...';

    if (typeof dashboardAPI === 'undefined' || !dashboardAPI.inspectWorkspaceRepo) {
      if (inspectStatusEl) inspectStatusEl.textContent = 'Repository inspection is only available in the Electron app.';
      return;
    }

    const result = await dashboardAPI.inspectWorkspaceRepo(trimmedPath);
    if (!result?.success) {
      repoInspection = null;
      populateBaseBranchOptions([]);
      if (inspectStatusEl) inspectStatusEl.textContent = result?.error || 'Could not inspect repository.';
      return;
    }

    repoInspection = result.repository;
    populateBaseBranchOptions(repoInspection.branches || []);
    if (baseBranchInput && !baseBranchTouched) {
      baseBranchInput.value = repoInspection.currentBranch || '';
    }
    syncStartPointToBaseBranch();
    if (inspectStatusEl) {
      const branchCount = Array.isArray(repoInspection.branches) ? repoInspection.branches.length : 0;
      inspectStatusEl.textContent = `Detected ${repoInspection.repositoryName} · ${repoInspection.currentBranch || 'HEAD'} · ${branchCount} local branches`;
    }
  }

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => setCreateMode(btn.dataset.mode));
  });

  document.getElementById('agentNameInput')?.addEventListener('input', syncAutoBranch);
  branchInput?.addEventListener('input', () => {
    const branchValue = branchInput.value.trim();
    branchMode = !branchValue || branchValue === suggestBranchName() ? 'auto' : 'custom';
    if (branchMode === 'auto' && !branchValue) {
      syncAutoBranch();
    }
    updateBranchModeLabel();
  });
  branchInput?.addEventListener('focus', () => {
    if (branchMode === 'auto' && !branchInput.value.trim()) {
      syncAutoBranch();
    }
  });
  baseBranchInput?.addEventListener('input', () => {
    baseBranchTouched = true;
    syncStartPointToBaseBranch();
  });
  startPointInput?.addEventListener('input', () => {
    startPointTouched = !!startPointInput.value.trim();
  });
  repoPathInput?.addEventListener('input', () => {
    if (inspectTimer) clearTimeout(inspectTimer);
    lastInspectedRepoPath = '';
    if (inspectStatusEl) {
      inspectStatusEl.textContent = repoPathInput.value.trim()
        ? 'Inspecting repository...'
        : 'Enter a repository path to inspect branches.';
    }
    inspectTimer = setTimeout(() => {
      inspectRepository(repoPathInput.value).catch((error) => {
        console.error('[Workspace Inspect]', error);
        if (inspectStatusEl) inspectStatusEl.textContent = 'Could not inspect repository.';
      });
    }, 300);
  });
  repoPathInput?.addEventListener('blur', () => {
    inspectRepository(repoPathInput.value).catch((error) => {
      console.error('[Workspace Inspect]', error);
      if (inspectStatusEl) inspectStatusEl.textContent = 'Could not inspect repository.';
    });
  });

  openBtn.addEventListener('click', () => {
    resetFormState();
    syncAutoBranch();
    modal.style.display = '';
  });
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';

    const name = document.getElementById('agentNameInput').value.trim();
    const role = document.getElementById('agentRoleInput').value.trim();
    if (!name) {
      if (errorEl) errorEl.textContent = 'Name is required.';
      return;
    }

    if (createMode === 'worktree') {
      const repoPath = document.getElementById('agentRepoPathInput').value.trim();
      if (!repoPath) {
        if (errorEl) errorEl.textContent = 'Repository path is required.';
        return;
      }

      if (typeof dashboardAPI === 'undefined' || !dashboardAPI.createWorkspaceAgent) {
        if (errorEl) errorEl.textContent = 'Workspace creation is not available.';
        return;
      }

      const payload = {
        name,
        role,
        provider: selectedProvider,
        repoPath,
        branchName: document.getElementById('agentBranchInput').value.trim(),
        baseBranch: document.getElementById('agentBaseBranchInput').value.trim(),
        workspaceParent: document.getElementById('agentWorkspaceParentInput').value.trim(),
        startPoint: document.getElementById('agentStartPointInput').value.trim() || document.getElementById('agentBaseBranchInput').value.trim(),
        copyPaths: parsePathListValue('agentCopyPathsInput'),
        symlinkPaths: parsePathListValue('agentSymlinkPathsInput'),
        bootstrapCommand: document.getElementById('agentBootstrapCommandInput').value.trim(),
      };

      const result = await dashboardAPI.createWorkspaceAgent(payload);
      if (!result?.success) {
        if (errorEl) errorEl.textContent = result?.error || 'Failed to create workspace.';
        return;
      }

      const shouldOpenTerminal = !!document.getElementById('workspaceOpenTerminalInput')?.checked;
      closeModal();
      resetFormState();

      if (shouldOpenTerminal && result.agent?.id) {
        await openTerminalForAgent(result.agent.id, {
          cwd: result.workspace?.worktreePath,
          label: name,
          skipProviderBoot: true,
        });

        if (result.bootstrapCommand && typeof dashboardAPI !== 'undefined' && dashboardAPI.writeTerminal) {
          setTimeout(() => {
            dashboardAPI.writeTerminal(result.agent.id, `${result.bootstrapCommand}\r`);
          }, 250);
        }
      }
      return;
    }

    const projectPath = document.getElementById('agentPathInput').value.trim();
    if (!projectPath) {
      if (errorEl) errorEl.textContent = 'Project path is required.';
      return;
    }

    if (typeof dashboardAPI !== 'undefined' && dashboardAPI.createRegisteredAgent) {
      const result = await dashboardAPI.createRegisteredAgent({ name, role, projectPath, provider: selectedProvider });
      if (result && result.success) {
        closeModal();
        resetFormState();
      } else if (errorEl) {
        errorEl.textContent = result?.error || 'Failed to register agent.';
      }
    }
  });
})();

// ─── AVATAR PICKER ───
(function setupAvatarPicker() {
  const modal = document.getElementById('avatarPickerModal');
  const grid = document.getElementById('avatarPickerGrid');
  const cancelBtn = document.getElementById('cancelAvatarBtn');
  if (!modal || !grid) return;

  const AVATAR_FILES = SHARED_AVATAR_FILES;
  const DISPLAY_W = 53, DISPLAY_H = 70;
  const COLS = 8;

  let currentRegistryId = null;
  let currentAgentId = null;

  // Build avatar grid (show front_idle frame 0 for each)
  AVATAR_FILES.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'avatar-picker-item';
    item.dataset.index = idx;
    item.style.backgroundImage = `url('./public/characters/${file}')`;
    item.style.backgroundSize = `${DISPLAY_W * COLS}px auto`;
    item.style.backgroundPosition = '0px 0px';
    item.style.width = DISPLAY_W + 'px';
    item.style.height = DISPLAY_H + 'px';
    item.style.imageRendering = 'auto';
    item.title = `Avatar ${idx}`;

    item.addEventListener('click', async () => {
      if (!currentRegistryId) return;
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.updateRegisteredAgent) {
        await dashboardAPI.updateRegisteredAgent(currentRegistryId, { avatarIndex: idx });
      }
      // Update office character avatar immediately
      if (currentAgentId && typeof officeCharacters !== 'undefined') {
        const char = officeCharacters.characters.get(currentAgentId);
        if (char) {
          char.avatarFile = file;
          char.skinIndex = idx;
        }
      }
      // Update agent list thumbnail immediately
      if (currentAgentId) {
        const ag = state.agents.get(currentAgentId);
        if (ag) {
          ag.avatarIndex = idx;
          updateAgentUI(ag);
        }
      }
      modal.style.display = 'none';
    });
    grid.appendChild(item);
  });

  if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  // Delegate click from agent cards
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.agent-avatar-btn');
    if (!btn) return;
    e.stopPropagation();
    currentRegistryId = btn.dataset.avatarId;
    currentAgentId = btn.dataset.agentId;

    // Highlight current avatar
    const ag = state.agents.get(currentAgentId);
    const currentIdx = ag ? (ag.avatarIndex != null ? ag.avatarIndex : 0) : 0;
    grid.querySelectorAll('.avatar-picker-item').forEach(item => {
      item.classList.toggle('selected', parseInt(item.dataset.index) === currentIdx);
    });

    modal.style.display = '';
  });
})();

// ─── SESSION HISTORY & CONVERSATION VIEWER ───

(function setupConversationViewer() {
  // Create modal elements
  const overlay = document.createElement('div');
  overlay.className = 'conv-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'conv-modal';
  modal.innerHTML = `
    <div class="conv-modal-header">
      <div class="conv-modal-title">Session History</div>
      <button class="conv-modal-close">&times;</button>
    </div>
    <div class="conv-modal-body">
      <div class="conv-session-list"></div>
      <div class="conv-chat-panel" style="display:none">
        <div class="conv-chat-header">
          <button class="conv-back-btn">&larr; Back</button>
          <span class="conv-chat-session-id"></span>
          <button class="conv-resume-btn">Resume</button>
        </div>
        <div class="conv-chat-messages"></div>
      </div>
    </div>
  `;
  overlay.appendChild(modal);

  const sessionListEl = modal.querySelector('.conv-session-list');
  const chatPanel = modal.querySelector('.conv-chat-panel');
  const chatMessages = modal.querySelector('.conv-chat-messages');
  const chatSessionId = modal.querySelector('.conv-chat-session-id');
  const backBtn = modal.querySelector('.conv-back-btn');
  const resumeBtn = modal.querySelector('.conv-resume-btn');
  const closeBtn = modal.querySelector('.conv-modal-close');
  const titleEl = modal.querySelector('.conv-modal-title');

  let currentRegistryId = null;
  let currentSessionId = null;
  let currentAgentName = null;

  function closeModal() {
    overlay.style.display = 'none';
    currentRegistryId = null;
    currentSessionId = null;
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  backBtn.addEventListener('click', () => {
    chatPanel.style.display = 'none';
    sessionListEl.style.display = '';
    currentSessionId = null;
  });

  resumeBtn.addEventListener('click', async () => {
    if (!currentRegistryId || !currentSessionId) return;
    if (typeof dashboardAPI !== 'undefined' && dashboardAPI.resumeSession) {
      const regId = currentRegistryId;
      const sessId = currentSessionId;
      const label = currentAgentName;
      closeModal();

      const result = await resumeRegisteredSession(regId, sessId, label);
      if (!result?.success) {
        alert('Failed to resume: ' + (result?.error || 'unknown'));
      }
    } else {
      alert('Resume is only available in the Electron app');
    }
  });

  window.openSessionHistory = async function (registryId, agentName) {
    currentRegistryId = registryId;
    currentSessionId = null;
    currentAgentName = agentName || 'Agent';
    titleEl.textContent = currentAgentName + ' — Session History';
    sessionListEl.style.display = '';
    chatPanel.style.display = 'none';
    sessionListEl.innerHTML = '<div class="conv-loading">Loading...</div>';
    overlay.style.display = '';

    try {
      let history;
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.getSessionHistory) {
        history = await dashboardAPI.getSessionHistory(registryId);
      } else {
        const res = await fetch('/api/agents/' + registryId + '/history');
        history = await res.json();
      }

      if (!history || history.length === 0) {
        sessionListEl.innerHTML = '<div class="conv-empty">No session history yet.</div>';
        return;
      }

      // Sort by startedAt descending (newest first)
      history.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

      sessionListEl.innerHTML = history.map(h => {
        const started = h.startedAt ? new Date(h.startedAt).toLocaleString() : '-';
        const ended = h.endedAt ? new Date(h.endedAt).toLocaleString() : 'Active';
        const msgCount = h.summary ? h.summary.messageCount : '?';
        const hasTranscript = !!h.transcriptPath;
        return `
          <div class="conv-session-item ${hasTranscript ? 'clickable' : 'no-transcript'}" data-session-id="${h.sessionId}" data-has-transcript="${hasTranscript}">
            <div class="conv-session-main">
              <span class="conv-session-id-label">${h.sessionId.slice(0, 12)}...</span>
              <span class="conv-session-msgs">${msgCount} messages</span>
            </div>
            <div class="conv-session-dates">
              <span>${started}</span>
              <span class="conv-session-arrow">&rarr;</span>
              <span>${ended}</span>
            </div>
          </div>
        `;
      }).join('');

      // Click handler for session items
      sessionListEl.querySelectorAll('.conv-session-item.clickable').forEach(item => {
        item.addEventListener('click', () => {
          openConversation(registryId, item.dataset.sessionId);
        });
      });

    } catch (e) {
      sessionListEl.innerHTML = '<div class="conv-empty">Failed to load history.</div>';
      console.error('[History]', e);
    }
  };

  async function openConversation(registryId, sessionId) {
    currentSessionId = sessionId;
    sessionListEl.style.display = 'none';
    chatPanel.style.display = '';
    chatSessionId.textContent = sessionId.slice(0, 16) + '...';
    chatMessages.innerHTML = '<div class="conv-loading">Loading conversation...</div>';

    try {
      let data;
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.getConversation) {
        data = await dashboardAPI.getConversation(registryId, sessionId, {});
      } else {
        const res = await fetch('/api/agents/' + registryId + '/conversation/' + sessionId);
        data = await res.json();
      }

      if (data.error) {
        chatMessages.innerHTML = `<div class="conv-empty">${data.error}</div>`;
        return;
      }

      if (!data.messages || data.messages.length === 0) {
        chatMessages.innerHTML = '<div class="conv-empty">No messages in this session.</div>';
        return;
      }

      chatMessages.innerHTML = data.messages.map(renderMessage).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (e) {
      chatMessages.innerHTML = '<div class="conv-empty">Failed to load conversation.</div>';
      console.error('[Conversation]', e);
    }
  }

  function renderMessage(msg) {
    if (msg.role === 'system') {
      return `<div class="conv-msg conv-msg-system"><span class="conv-msg-badge">SYSTEM</span> ${escapeHtml(msg.content)}</div>`;
    }
    if (msg.role === 'user') {
      return `<div class="conv-msg conv-msg-user"><span class="conv-msg-badge">USER</span><div class="conv-msg-content">${escapeHtml(msg.content)}</div>${msg.timestamp ? `<span class="conv-msg-time">${formatTime(msg.timestamp)}</span>` : ''}</div>`;
    }
    if (msg.role === 'assistant') {
      const toolHtml = msg.toolUses && msg.toolUses.length > 0
        ? `<div class="conv-msg-tools">${msg.toolUses.map(t => `<span class="conv-tool-tag">${escapeHtml(t.name)}</span>`).join('')}</div>`
        : '';
      const tokenHtml = msg.tokens
        ? `<span class="conv-msg-tokens">in:${msg.tokens.input} out:${msg.tokens.output}</span>`
        : '';
      return `<div class="conv-msg conv-msg-assistant"><span class="conv-msg-badge">ASSISTANT</span>${toolHtml}<div class="conv-msg-content">${escapeHtml(msg.content)}</div><div class="conv-msg-meta">${msg.model ? `<span class="conv-msg-model">${msg.model}</span>` : ''}${tokenHtml}${msg.timestamp ? `<span class="conv-msg-time">${formatTime(msg.timestamp)}</span>` : ''}</div></div>`;
    }
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function formatTime(ts) {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ''; }
  }
})();
