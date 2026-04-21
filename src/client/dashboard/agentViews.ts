import {
  type DashboardAgent,
  REGISTERED_FILTER_STORAGE_KEY,
  state,
  getDashboardAPI,
  refreshSharedAvatarData,
} from './shared.js';
import {
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
} from '../office/index.js';
import { updateConnectionStatus } from './connectionStatus.js';
import { getStateColor } from './agentViewHelpers.js';
import { appendTaskChatMessage, openTaskLogTab } from './terminal/index.js';
import {
  getClearableUnregisteredAgents,
  getVisibleAgents,
  isRegisteredOnlyFilterEnabled,
  shouldDisplayAgent,
} from './agentFilters.js';
import { fetchCentralDashboardAgents } from './centralAgents/index.js';
import { notifyDashboardStore } from './state/store.js';
import { officeCharacters } from '../office/index.js';

export { getStateColor };
export {
  getClearableUnregisteredAgents,
  getVisibleAgents,
  isRegisteredOnlyFilterEnabled,
  shouldDisplayAgent,
};

let sseDelay = 1000;
let sseSource: EventSource | null = null;

function recalcStats() {
  const arr = Array.from(state.agents.values()) as DashboardAgent[];
  state.stats.total = arr.length;
  state.stats.active = arr.filter((agent) => ['working', 'thinking'].includes(agent.status)).length;
  notifyDashboardStore();
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
      const data = JSON.parse(event.data) as { data: { id?: string; agentRegistryId?: string; title?: string } };
      const task = data.data;
      if (task.id && task.agentRegistryId) {
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
        if (officeCharacters?.setReportBubble) {
          officeCharacters.setReportBubble(task.agentRegistryId, task.id);
        }
      }
    } catch {}
  });
}

export async function fetchInitialData() {
  try {
    await refreshSharedAvatarData();
    const response = await fetch('/api/agents');
    const agents = (await response.json()) as DashboardAgent[];
    let centralAgents: DashboardAgent[] = [];
    try {
      centralAgents = await fetchCentralDashboardAgents();
    } catch (error) {
      console.warn('[Central Agents] initial sync failed', error);
    }
    for (const agent of [...agents, ...centralAgents]) {
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
  if (state.focusedAgentId === id) state.focusedAgentId = null;
  recalcStats();
  renderAgentList();
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
  renderAgentList();
}

export function renderAgentList() {
  renderOfficeRoster();
  notifyDashboardStore();
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

  let clearedCount = 0;
  try {
    const result = await dashboardAPI.clearInactiveUnregisteredAgents();
    if (result?.success) {
      clearedCount = result.clearedCount || 0;
    }
  } catch (error) {
    console.error('[Clear Unregistered]', error);
  }

  notifyDashboardStore();
  if (clearedCount !== count) {
    alert(`Cleared ${clearedCount} of ${count} agents. Some items may have changed state before removal.`);
  }
}

export function updateAgentUI(agent: DashboardAgent) {
  const nextFocusedAgentId = state.agents.has(agent.id) && shouldDisplayAgent(agent)
    ? state.focusedAgentId
    : state.focusedAgentId === agent.id
      ? null
      : state.focusedAgentId;
  state.focusedAgentId = nextFocusedAgentId;
  renderAgentList();
}

export function setFocusedAgentCard(agentId: string | null) {
  state.focusedAgentId = agentId;
  renderAgentList();
}
