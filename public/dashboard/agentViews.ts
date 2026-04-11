import {
  type DashboardAgent,
  DOM,
  REGISTERED_FILTER_STORAGE_KEY,
  SHARED_AVATAR_FILES,
  state,
  escapeText,
  formatNum,
  getDashboardAPI,
} from './shared.js';
import {
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
} from '../office/index.js';
import { updateConnectionStatus } from './connectionStatus.js';
import {
  formatWorkspaceTypeLabel,
  getActivityIcon,
  getStateColor,
  humanizeToolName,
} from './agentViewHelpers.js';

export { getStateColor };

let sseDelay = 1000;
let sseSource: EventSource | null = null;

function recalcStats() {
  const arr = Array.from(state.agents.values()) as DashboardAgent[];
  state.stats.total = arr.length;
  state.stats.active = arr.filter((agent) => ['working', 'thinking'].includes(agent.status)).length;
  DOM.kpiActiveAgents.innerHTML =
    `${state.stats.active} <span style="font-size:0.8rem;color:var(--color-text-dark)">/ ${state.stats.total}</span>`;
  DOM.kpiErrors.textContent = state.stats.errorCount.toString();
  if (state.stats.errorCount > 0) {
    DOM.kpiErrors.className = 'kpi-value error';
  }
}

export function connectSSE() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }

  const eventSource = new EventSource('/api/events');
  sseSource = eventSource;

  eventSource.onopen = () => {
    sseDelay = 1000;
    state.connected = true;
    updateConnectionStatus(true);
  };

  eventSource.onerror = () => {
    state.connected = false;
    updateConnectionStatus(false);
    eventSource.close();
    sseSource = null;
    setTimeout(connectSSE, sseDelay);
    sseDelay = Math.min(sseDelay * 2, 30000);
  };

  eventSource.addEventListener('connected', () => fetchInitialData());
  eventSource.addEventListener('agent.created', (event: MessageEvent) => {
    const data = JSON.parse(event.data) as { data: DashboardAgent };
    updateAgent(data.data);
    officeOnAgentCreated(data.data);
  });
  eventSource.addEventListener('agent.updated', (event: MessageEvent) => {
    const data = JSON.parse(event.data) as { data: DashboardAgent };
    updateAgent(data.data);
    officeOnAgentUpdated(data.data);
  });
  eventSource.addEventListener('agent.removed', (event: MessageEvent) => {
    const data = JSON.parse(event.data) as { data: { id: string } };
    removeAgent(data.data.id);
    officeOnAgentRemoved(data.data);
  });
  eventSource.addEventListener('task.running', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { data: { agentRegistryId?: string; terminalId?: string; title?: string } };
      const task = data.data;
      if (task.terminalId && typeof (globalThis as any).openTerminalForAgent === 'function') {
        (globalThis as any).openTerminalForAgent(task.terminalId, {
          forceTerminalTab: true,
          skipProviderBoot: true,
          skipAutoResume: true,
          label: task.title || 'Task',
        });
      }
    } catch {}
  });
  eventSource.addEventListener('task.succeeded', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { data: { id?: string; agentRegistryId?: string } };
      const task = data.data;
      if (task.agentRegistryId && task.id) {
        const officeChars = (globalThis as any).officeCharacters;
        if (officeChars?.setReportBubble) {
          officeChars.setReportBubble(task.agentRegistryId, task.id);
        }
      }
    } catch {}
  });
}

export async function fetchInitialData() {
  try {
    const response = await fetch('/api/agents');
    const agents = (await response.json()) as DashboardAgent[];
    for (const agent of agents) {
      state.agents.set(agent.id, agent);
      if (!state.agentHistory.has(agent.id)) {
        state.agentHistory.set(agent.id, [{ state: agent.status, ts: Date.now() }]);
      }
    }
    recalcStats();
    renderAgentList();
  } catch (error) {
    console.error('Data fetch error:', error);
  }
}

export function updateAgent(agent: DashboardAgent) {
  if (agent.status === 'error') state.stats.errorCount++;
  state.agents.set(agent.id, agent);

  const history = state.agentHistory.get(agent.id) || [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  if (!last || last.state !== agent.status) {
    history.push({ state: agent.status, ts: Date.now() });
    state.agentHistory.set(agent.id, history);
  }

  recalcStats();
  updateAgentUI(agent);
}

export function removeAgent(id: string) {
  state.agents.delete(id);
  state.agentHistory.delete(id);
  recalcStats();
  const existing = DOM.agentPanel.querySelector(`[data-id="${id}"]`);
  if (existing) existing.remove();
  if (getVisibleAgents().length === 0) {
    DOM.standbyMessage.style.display = 'block';
  }
}

export function isRegisteredOnlyFilterEnabled() {
  return !!state.filters.registeredOnly;
}

export function shouldDisplayAgent(agent: DashboardAgent) {
  return !isRegisteredOnlyFilterEnabled() || !!agent.isRegistered;
}

export function getVisibleAgents() {
  return [...state.agents.values()].filter(shouldDisplayAgent);
}

export function getClearableUnregisteredAgents() {
  return [...state.agents.values()].filter((agent: DashboardAgent) => {
    return !agent.isRegistered && (agent.status === 'offline' || agent.status === 'completed');
  });
}

export function updateBulkArchiveButton() {
  if (!DOM.bulkArchiveBtn) return;
  const count = getClearableUnregisteredAgents().length;
  DOM.bulkArchiveBtn.disabled = count === 0;
  DOM.bulkArchiveBtn.textContent = count > 0 ? `Clear Unregistered (${count})` : 'Clear Unregistered';
  DOM.bulkArchiveBtn.title = count > 0
    ? `Clear ${count} inactive unregistered agent${count === 1 ? '' : 's'}`
    : 'No inactive unregistered agents available to clear';
}

function updateFilterUI() {
  const registeredOnly = isRegisteredOnlyFilterEnabled();
  const badgeText = registeredOnly ? 'Registered Only' : 'All Agents';

  [DOM.officeFilterBadge, DOM.agentListFilterBadge].forEach((badge) => {
    if (!badge) return;
    badge.textContent = badgeText;
    badge.classList.toggle('is-off', !registeredOnly);
  });

  [DOM.officeFilterToggle, DOM.agentListFilterToggle].forEach((toggle) => {
    if (!toggle) return;
    toggle.checked = registeredOnly;
  });
}

function renderOfficeRoster() {
  for (const agent of state.agents.values()) {
    if (shouldDisplayAgent(agent)) {
      officeOnAgentCreated(agent);
      continue;
    }
    officeOnAgentRemoved({ id: agent.id });
  }
}

export function setRegisteredOnlyFilter(enabled: boolean) {
  state.filters.registeredOnly = !!enabled;
  localStorage.setItem(REGISTERED_FILTER_STORAGE_KEY, enabled ? 'true' : 'false');
  updateFilterUI();
  renderAgentList();
}

export function initFilterControls() {
  [DOM.officeFilterToggle, DOM.agentListFilterToggle].forEach((toggle) => {
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      setRegisteredOnlyFilter(toggle.checked);
    });
  });
  updateFilterUI();
}

export function renderAgentList() {
  const visibleAgents = getVisibleAgents();
  DOM.standbyMessage.style.display = visibleAgents.length === 0 ? 'block' : 'none';
  for (const agent of state.agents.values()) {
    updateAgentUI(agent);
  }
  updateBulkArchiveButton();
  renderOfficeRoster();
}

export async function clearUnregisteredAgents(): Promise<void> {
  const agents = getClearableUnregisteredAgents();
  if (agents.length === 0) {
    alert('No inactive unregistered agents are available to clear.');
    return;
  }

  const count = agents.length;
  if (!confirm(`Clear ${count} inactive unregistered agent${count === 1 ? '' : 's'}?`)) return;

  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.clearInactiveUnregisteredAgents) return;

  if (DOM.bulkArchiveBtn) DOM.bulkArchiveBtn.disabled = true;

  let clearedCount = 0;
  try {
    const result = await dashboardAPI.clearInactiveUnregisteredAgents();
    if (result?.success) {
      clearedCount = result.clearedCount || 0;
    }
  } catch (error) {
    console.error('[Clear Unregistered]', error);
  }

  updateBulkArchiveButton();
  if (clearedCount !== count) {
    alert(`Cleared ${clearedCount} of ${count} agents. Some items may have changed state before removal.`);
  }
}

export function updateAgentUI(agent: DashboardAgent) {
  if (!shouldDisplayAgent(agent)) {
    const existingHidden = DOM.agentPanel.querySelector(`[data-id="${agent.id}"]`) as HTMLElement | null;
    if (existingHidden) existingHidden.remove();
    return;
  }

  DOM.standbyMessage.style.display = 'none';
  const existing = DOM.agentPanel.querySelector(`[data-id="${agent.id}"]`) as HTMLElement | null;

  const statusClass = ['working', 'thinking', 'error', 'done', 'completed', 'offline'].includes(agent.status)
    ? agent.status
    : 'waiting';
  const statusText = agent.status.toUpperCase();
  const typeHtml = agent.metadata?.isSubagent
    ? '<span class="mc-type-badge">SUB</span>'
    : (agent.isRegistered
      ? '<span class="mc-type-badge" style="background:var(--color-info-dim);color:var(--color-info)">REG</span>'
      : '<span class="mc-type-badge main">MAIN</span>');
  const isActive = ['working', 'thinking'].includes(statusClass);
  const humanizedTool = agent.currentTool ? humanizeToolName(agent.currentTool) : '';
  const activityIcon = getActivityIcon(statusClass, agent.currentTool);
  const activityLabel = agent.currentTool
    ? (statusClass === 'thinking' ? 'Thinking' : 'Running')
    : (statusClass === 'thinking' ? 'Thinking'
      : statusClass === 'working' ? 'Working'
      : statusClass === 'error' ? 'Error'
      : statusClass === 'done' || statusClass === 'completed' ? 'Done'
      : statusClass === 'offline' ? 'Offline'
      : 'Idle');
  const activityDetail = agent.currentTool
    ? `<span class="mc-activity-tool">${escapeText(humanizedTool)}</span>`
    : (isActive ? '<span class="mc-activity-dots"><i></i><i></i><i></i></span>' : '');
  const activityStateClass = isActive ? `active ${statusClass}` : statusClass;
  const workspaceMeta = agent.metadata?.workspace || null;
  const workspaceType = formatWorkspaceTypeLabel(workspaceMeta?.type);
  const workspaceBranch = workspaceMeta?.branch || '';
  const workspaceRepo = workspaceMeta?.repositoryName || '';
  const isManagedWorktree = workspaceMeta?.type === 'git-worktree';
  const workspaceBadge = workspaceMeta
    ? `<span class="mc-type-badge workspace" title="${escapeText(workspaceType)}">${escapeText(workspaceType)}</span>`
    : '';
  const workspaceSummary = workspaceBranch
    ? `<div class="mc-agent-workspace" title="${escapeText(`${workspaceRepo || agent.project || 'workspace'} - ${workspaceBranch}`)}"><span class="mc-agent-workspace-repo">${escapeText(workspaceRepo || agent.project || 'workspace')}</span><span class="mc-agent-workspace-branch">${escapeText(workspaceBranch)}</span></div>`
    : '';
  const actionButtons = [
    agent.isRegistered && agent.registryId
      ? `<button class="agent-history-btn" data-history-id="${agent.registryId}" data-agent-name="${agent.nickname || agent.name || 'Agent'}" title="Session History"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></button>`
      : '',
    agent.isRegistered
      ? `<button class="agent-assign-task-btn" data-agent-id="${agent.id}" title="Assign Task"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`
      : '',
    agent.isRegistered && agent.registryId && workspaceBranch && isManagedWorktree
      ? `<button class="agent-workspace-btn merge" data-workspace-merge-id="${agent.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Merge branch and clean up workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8"/><path d="M6 8v4c0 2 2 4 4 4h2"/><path d="M18 8v4c0 2-2 4-4 4h-2"/></svg>
        </button>`
      : '',
    agent.isRegistered && agent.registryId && workspaceBranch && isManagedWorktree
      ? `<button class="agent-workspace-btn remove" data-workspace-remove-id="${agent.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Remove workspace and delete branch without merge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-avatar-btn" data-avatar-id="${agent.registryId}" data-agent-id="${agent.id}" title="Change avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/></svg></button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-unregister-btn" data-archive-id="${agent.registryId}" title="Unregister agent and move record to Archive">Unregister</button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-delete-btn agent-delete-inline" data-delete-id="${agent.registryId}" title="Delete agent record permanently">Delete</button>`
      : '',
  ].filter(Boolean).join('');

  const history = state.agentHistory.get(agent.id) || [];
  let timelineHtml = '';
  if (history.length > 0) {
    const now = Date.now();
    const segments = history.map((entry, index) => {
      const end = (index + 1 < history.length) ? history[index + 1].ts : now;
      return { state: entry.state, duration: Math.max(end - entry.ts, 1) };
    });
    const segmentHtml = segments.map((segment) => {
      return `<div class="mc-timeline-seg" style="flex-grow:${segment.duration};background:${getStateColor(segment.state)}" title="${segment.state}"></div>`;
    }).join('');
    timelineHtml = `<div class="mc-timeline">${segmentHtml}</div>`;
  }

  const avatarFile = SHARED_AVATAR_FILES[agent.avatarIndex != null ? agent.avatarIndex : 0]
    || SHARED_AVATAR_FILES[0]
    || 'avatar_0.webp';

  const html = `
    <div class="mc-agent-header">
      <div class="mc-agent-identity">
        <div class="mc-agent-title-row">
          <div class="mc-agent-avatar" style="background-image:url('./public/characters/${avatarFile}')"></div>
          <div class="mc-agent-name">
            <span class="agent-display-name" data-agent-id="${agent.id}" title="Double-click to rename">${agent.nickname || agent.name || 'Agent'}</span>
          </div>
        </div>
        <div class="mc-agent-badges">${typeHtml}${workspaceBadge}</div>
      </div>
      <div class="mc-agent-status ${statusClass}">${statusText}</div>
    </div>
    ${agent.role ? `<div class="mc-agent-role">${agent.role}</div>` : ''}
    ${workspaceSummary}
    ${actionButtons ? `<div class="mc-agent-actions">${actionButtons}</div>` : ''}
    <div class="mc-agent-activity ${activityStateClass}">
      <span class="mc-activity-indicator">${activityIcon}</span>
      <span class="mc-activity-label">${activityLabel}</span>
      ${activityDetail}
    </div>
    ${timelineHtml}
  `;

  if (existing) {
    existing.innerHTML = html;
    existing.dataset.status = agent.status;
    return;
  }

  const div = document.createElement('div');
  div.className = 'mc-agent-card';
  div.dataset.id = agent.id;
  div.dataset.status = agent.status;
  div.innerHTML = html;
  DOM.agentPanel.appendChild(div);
}
