import type { DashboardAgent, DashboardAgentRecord } from '../shared.js';
import {
  type CentralAgent,
  type CentralAgentBulkResponse,
  type CentralAgentResponse,
  type CentralAgentsResponse,
  centralPayloadFromRecord,
  centralWorkspaceFromRecord,
  mergeCentralAgent,
  isCentralAgentArchived,
  shouldSyncLocalAgent,
} from './model.js';

export type CentralServerConfig = {
  agentSyncEnabled?: boolean;
  workerEnabled?: boolean;
  remoteMode?: 'local' | 'host' | 'guest';
  workerId?: string;
};

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchCentralAgentConfig(): Promise<CentralServerConfig | null> {
  try {
    return await fetchJSON<CentralServerConfig>('/api/server/config');
  } catch {
    return null;
  }
}

export async function isCentralAgentSyncEnabled(): Promise<boolean> {
  return !!(await fetchCentralAgentConfig())?.agentSyncEnabled;
}

export async function isBrowserLocalAgentSyncEnabled(): Promise<boolean> {
  const config = await fetchCentralAgentConfig();
  return !!config?.agentSyncEnabled && !config.workerEnabled;
}

export async function fetchCentralDashboardAgents(): Promise<DashboardAgent[]> {
  const config = await fetchCentralAgentConfig();
  if (!config?.agentSyncEnabled) return [];
  const response = await fetchJSON<CentralAgentsResponse>('/api/server/agents');
  return (response.agents || [])
    .filter((agent) => !isCentralAgentArchived(agent))
    .map((agent) => mergeCentralAgent(agent, {
      canManageCentralAgents: config.remoteMode !== 'guest',
      currentParticipantId: config.workerId,
    }));
}

async function upsertCentralAgents(agents: Array<DashboardAgentRecord | DashboardAgent>): Promise<void> {
  const payloads = agents
    .map(centralPayloadFromRecord)
    .filter((agent) => !!agent.id);
  if (payloads.length === 0) return;
  await fetchJSON<CentralAgentBulkResponse>('/api/server/agents/bulk-upsert', {
    method: 'POST',
    body: JSON.stringify({ agents: payloads }),
  });
}

export async function syncLocalAgentsToCentral(): Promise<void> {
  if (!await isBrowserLocalAgentSyncEnabled()) return;
  const agents = await fetchJSON<DashboardAgent[]>('/api/agents');
  await upsertCentralAgents(agents.filter(shouldSyncLocalAgent));
}

export async function syncCentralAgentRecord(agent?: DashboardAgentRecord | null): Promise<void> {
  if (!agent?.id || !await isBrowserLocalAgentSyncEnabled()) return;
  await upsertCentralAgents([agent]);
}

export async function syncCentralAgentUpdate(
  id?: string | null,
  fields: Partial<DashboardAgentRecord> = {},
): Promise<void> {
  if (!id || !await isBrowserLocalAgentSyncEnabled()) return;
  const payload: Partial<CentralAgent> = {};
  if (fields.name !== undefined) payload.name = fields.name || 'Agent';
  if (fields.role !== undefined) payload.role = fields.role || '';
  if (fields.provider !== undefined) payload.provider = fields.provider || 'codex';
  if (fields.model !== undefined) payload.model = fields.model || '';
  if (fields.avatarIndex !== undefined) payload.avatar = { assetId: `index:${fields.avatarIndex ?? 0}` };
  if (fields.workspace !== undefined || fields.projectPath !== undefined) {
    payload.workspace = centralWorkspaceFromRecord({ id, ...fields } as DashboardAgentRecord);
  }
  if (Object.keys(payload).length === 0) return;
  await fetchJSON<CentralAgentResponse>(`/api/server/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function syncCentralAgentDisplayName(id?: string | null, name = ''): Promise<void> {
  if (!id || !name.trim()) return;
  const config = await fetchCentralAgentConfig();
  if (!config?.agentSyncEnabled || config.remoteMode === 'guest') return;
  await fetchJSON<CentralAgentResponse>(`/api/server/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: name.trim() || 'Agent' }),
  });
}

export async function syncCentralAgentRemoval(id?: string | null): Promise<void> {
  if (!id || !await isBrowserLocalAgentSyncEnabled()) return;
  await fetchJSON<CentralAgentResponse>(`/api/server/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
