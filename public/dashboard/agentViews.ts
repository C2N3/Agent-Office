import {
  type DashboardAgent,
  DOM,
  REGISTERED_FILTER_STORAGE_KEY,
  state,
  getDashboardAPI,
} from './shared.js';
import {
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
} from '../office/index.js';
import { floorManager } from '../office/floorManager.js';
import { updateConnectionStatus } from './connectionStatus.js';
import { getStateColor } from './agentViewHelpers.js';
import { buildAgentCardHtml } from './agentCard/markup.js';
import { openTaskLogTab, appendTaskChatMessage } from './terminal/index.js';

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
      const data = JSON.parse(event.data) as { data: { id?: string; agentRegistryId?: string; terminalId?: string; title?: string } };
      const task = data.data;
      if (task.terminalId && typeof (globalThis as any).openTerminalForAgent === 'function') {
        // Legacy PTY terminal path (manual terminals)
        (globalThis as any).openTerminalForAgent(task.terminalId, {
          forceTerminalTab: true,
          skipProviderBoot: true,
          skipAutoResume: true,
          label: task.title || 'Task',
        });
      } else if (task.id && task.agentRegistryId) {
        // Headless task: open a log-only tab (no PTY)
        openTaskLogTab(task.id, task.agentRegistryId, task.title || 'Task');
      }
    } catch {}
  });
  eventSource.addEventListener('task.output', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { data: { taskId?: string; text?: string; stream?: string } };
      const { taskId, text } = data.data;
      if (taskId && text) {
        try {
          const parsed = JSON.parse(text) as { text: string; type: string; toolName?: string | null; merge?: boolean };
          appendTaskChatMessage(taskId, parsed);
        } catch {
          // Fallback: plain text
          appendTaskChatMessage(taskId, { text: text, type: 'text' });
        }
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
  if (isRegisteredOnlyFilterEnabled() && !agent.isRegistered) return false;
  // Floor filter: only show agents on the current floor
  if (!floorManager.isAgentOnCurrentFloor(agent.id)) return false;
  return true;
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
  const html = buildAgentCardHtml(agent);

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
