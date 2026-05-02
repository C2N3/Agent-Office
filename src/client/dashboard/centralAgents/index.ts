import type { DashboardAgent } from '../shared';
import { state } from '../shared';
import {
  fetchCentralAgentConfig,
  fetchCentralDashboardAgents,
  isCentralAgentSyncEnabled,
  syncLocalAgentsToCentral,
} from './api';
import { mergeCentralAgent } from './model';

export {
  fetchCentralAgentConfig,
  fetchCentralDashboardAgents,
  isCentralAgentSyncEnabled,
  syncCentralAgentDisplayName,
  syncCentralAgentRecord,
  syncCentralAgentRemoval,
  syncCentralAgentUpdate,
} from './api';

type SyncCallbacks = {
  upsertAgent: (agent: DashboardAgent) => void;
  removeAgent: (id: string) => void;
};

let eventSource: EventSource | null = null;
let callbacks: SyncCallbacks | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function handleCentralEvent(type: 'created' | 'updated' | 'removed', event: MessageEvent): void {
  if (!callbacks) return;
  try {
    const envelope = JSON.parse(event.data);
    const data = envelope?.data || envelope;
    if (type === 'removed') {
      callbacks.removeAgent(data?.id || data?.agentId);
      return;
    }
    if (data?.id) callbacks.upsertAgent(mergeCentralAgent(data));
  } catch (error) {
    console.warn('[Central Agents] event parse failed', error);
  }
}

function stopCentralAgentEvents(): void {
  if (!eventSource) return;
  eventSource.close();
  eventSource = null;
}

function stopCentralAgentPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function clearCentralBackedAgents(keepIds: Set<string> = new Set()): void {
  if (!callbacks) return;
  for (const agent of state.agents.values()) {
    if (agent.metadata?.source === 'central' && !keepIds.has(agent.id)) {
      callbacks.removeAgent(agent.id);
    }
  }
}

async function applyCentralSnapshot(): Promise<void> {
  if (!callbacks) return;
  const agents = await fetchCentralDashboardAgents();
  const incomingIds = new Set<string>();
  for (const agent of agents) {
    incomingIds.add(agent.id);
    callbacks.upsertAgent(agent);
  }
  clearCentralBackedAgents(incomingIds);
}

function startCentralAgentPolling(): void {
  stopCentralAgentPolling();
  pollTimer = setInterval(() => {
    applyCentralSnapshot().catch((error) => console.warn('[Central Agents] polling failed', error));
  }, 3000);
}

async function restartCentralAgentEvents(): Promise<void> {
  stopCentralAgentEvents();
  stopCentralAgentPolling();

  if (!callbacks) return;

  const syncEnabled = await isCentralAgentSyncEnabled();
  if (!syncEnabled) {
    clearCentralBackedAgents();
    return;
  }

  try {
    await syncLocalAgentsToCentral();
  } catch (error) {
    console.warn('[Central Agents] local reconcile failed', error);
  }

  try {
    await applyCentralSnapshot();
  } catch (error) {
    console.warn('[Central Agents] snapshot fetch failed', error);
  }

  const config = await fetchCentralAgentConfig();
  if (!config?.agentSyncEnabled) {
    clearCentralBackedAgents();
    return;
  }

  if (config.remoteMode === 'guest') {
    startCentralAgentPolling();
    return;
  }

  eventSource = new EventSource('/api/server/events');
  eventSource.addEventListener('agent.created', (event) => handleCentralEvent('created', event as MessageEvent));
  eventSource.addEventListener('agent.updated', (event) => handleCentralEvent('updated', event as MessageEvent));
  eventSource.addEventListener('agent.removed', (event) => handleCentralEvent('removed', event as MessageEvent));
  eventSource.onerror = () => {
    stopCentralAgentEvents();
    startCentralAgentPolling();
  };
  startCentralAgentPolling();
}

export function startCentralAgentSync(nextCallbacks: SyncCallbacks): void {
  callbacks = nextCallbacks;
  restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] start failed', error));
  window.addEventListener('central-agent-sync-config-changed', () => {
    restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] restart failed', error));
  });
}

export async function __restartCentralAgentEventsForTests(): Promise<void> {
  await restartCentralAgentEvents();
}

export function __resetCentralAgentSyncForTests(): void {
  stopCentralAgentEvents();
  stopCentralAgentPolling();
  callbacks = null;
}
