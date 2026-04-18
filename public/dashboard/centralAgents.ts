import {
  type DashboardAgent,
  type DashboardAgentRecord,
  type DashboardWorkspace,
  SHARED_AVATAR_FILES,
  state,
} from './shared.js';

type CentralAgentWorkspace = {
  workerId?: string;
  repoRemote?: string;
  branch?: string;
  localRef?: string;
  label?: string;
};

type CentralAgent = {
  id: string;
  projectId?: string;
  roomId?: string;
  name?: string;
  role?: string;
  provider?: string;
  model?: string;
  avatar?: {
    assetId?: string;
    url?: string;
    initials?: string;
    color?: string;
  };
  workspace?: CentralAgentWorkspace;
  archivedAt?: string | null;
};

type CentralAgentsResponse = {
  agents?: CentralAgent[];
};

type CentralAgentResponse = {
  agent?: CentralAgent;
  error?: { message?: string } | string;
};

type CentralServerConfig = {
  agentSyncEnabled?: boolean;
};

type SyncCallbacks = {
  upsertAgent: (agent: DashboardAgent) => void;
  removeAgent: (id: string) => void;
};

let eventSource: EventSource | null = null;
let callbacks: SyncCallbacks | null = null;

function basename(value?: string | null): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || '';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function projectIdFromRecord(agent: DashboardAgentRecord): string {
  const workspace = agent.workspace || null;
  const name = workspace?.repositoryName || basename(workspace?.repositoryPath) || basename(agent.projectPath) || 'default';
  return `project_${slug(name)}`;
}

function avatarIndexFromAsset(assetId?: string): number {
  const indexMatch = /^index:(\d+)$/.exec(assetId || '');
  if (indexMatch) return Number(indexMatch[1]) || 0;
  if (assetId) {
    const fileIndex = SHARED_AVATAR_FILES.indexOf(assetId);
    if (fileIndex >= 0) return fileIndex;
  }
  return 0;
}

function workspaceFromCentral(workspace?: CentralAgentWorkspace): DashboardWorkspace | null {
  if (!workspace || (!workspace.branch && !workspace.label && !workspace.repoRemote && !workspace.localRef)) {
    return null;
  }
  return {
    type: 'central',
    branch: workspace.branch || null,
    repositoryName: workspace.label || workspace.repoRemote || null,
    repositoryPath: null,
    worktreePath: null,
  };
}

function localRefFromWorkspace(workspace?: DashboardWorkspace | null, projectPath?: string | null): string {
  return workspace?.worktreePath || workspace?.repositoryPath || projectPath || '';
}

function centralWorkspaceFromRecord(agent: DashboardAgentRecord): CentralAgentWorkspace {
  const workspace = agent.workspace || null;
  return {
    branch: workspace?.branch || '',
    localRef: localRefFromWorkspace(workspace, agent.projectPath),
    label: workspace?.repositoryName || basename(agent.projectPath) || '',
  };
}

function centralPayloadFromRecord(agent: DashboardAgentRecord): CentralAgent {
  return {
    id: agent.id,
    projectId: projectIdFromRecord(agent),
    roomId: 'default',
    name: agent.name || 'Agent',
    role: agent.role || '',
    provider: agent.provider || 'codex',
    avatar: { assetId: `index:${agent.avatarIndex ?? 0}` },
    workspace: centralWorkspaceFromRecord(agent),
  };
}

function dashboardAgentFromCentral(agent: CentralAgent): DashboardAgent {
  const workspace = workspaceFromCentral(agent.workspace);
  return {
    id: agent.id,
    registryId: agent.id,
    name: agent.name || 'Agent',
    role: agent.role || null,
    status: 'offline',
    project: agent.workspace?.label || agent.workspace?.repoRemote || agent.projectId || 'central',
    isRegistered: true,
    avatarIndex: avatarIndexFromAsset(agent.avatar?.assetId),
    provider: agent.provider || null,
    model: agent.model || null,
    metadata: {
      source: 'central',
      projectSlug: agent.projectId || null,
      provider: agent.provider || null,
      workspace,
    },
  };
}

function mergeCentralAgent(agent: CentralAgent): DashboardAgent {
  const incoming = dashboardAgentFromCentral(agent);
  const existing = state.agents.get(agent.id);
  if (!existing || existing.metadata?.source === 'central') return incoming;
  return {
    ...existing,
    name: incoming.name,
    role: incoming.role,
    avatarIndex: incoming.avatarIndex,
    provider: incoming.provider,
    model: incoming.model,
  };
}

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

export async function isCentralAgentSyncEnabled(): Promise<boolean> {
  try {
    const config = await fetchJSON<CentralServerConfig>('/api/server/config');
    return !!config.agentSyncEnabled;
  } catch {
    return false;
  }
}

export async function fetchCentralDashboardAgents(): Promise<DashboardAgent[]> {
  if (!await isCentralAgentSyncEnabled()) return [];
  const response = await fetchJSON<CentralAgentsResponse>('/api/server/agents');
  return (response.agents || [])
    .filter((agent) => !agent.archivedAt)
    .map(mergeCentralAgent);
}

export async function syncCentralAgentRecord(agent?: DashboardAgentRecord | null): Promise<void> {
  if (!agent?.id || !await isCentralAgentSyncEnabled()) return;
  await fetchJSON<CentralAgentResponse>('/api/server/agents', {
    method: 'POST',
    body: JSON.stringify(centralPayloadFromRecord(agent)),
  });
}

export async function syncCentralAgentUpdate(id?: string | null, fields: Partial<DashboardAgentRecord> = {}): Promise<void> {
  if (!id || !await isCentralAgentSyncEnabled()) return;
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

export async function syncCentralAgentRemoval(id?: string | null): Promise<void> {
  if (!id || !await isCentralAgentSyncEnabled()) return;
  await fetchJSON<CentralAgentResponse>(`/api/server/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

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

async function restartCentralAgentEvents(): Promise<void> {
  stopCentralAgentEvents();
  if (!callbacks || !await isCentralAgentSyncEnabled()) return;
  eventSource = new EventSource('/api/server/events');
  eventSource.addEventListener('agent.created', (event) => handleCentralEvent('created', event as MessageEvent));
  eventSource.addEventListener('agent.updated', (event) => handleCentralEvent('updated', event as MessageEvent));
  eventSource.addEventListener('agent.removed', (event) => handleCentralEvent('removed', event as MessageEvent));
  eventSource.onerror = () => {
    stopCentralAgentEvents();
    setTimeout(() => {
      restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] reconnect failed', error));
    }, 3000);
  };
}

export function startCentralAgentSync(nextCallbacks: SyncCallbacks): void {
  callbacks = nextCallbacks;
  restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] start failed', error));
  window.addEventListener('central-agent-sync-config-changed', () => {
    restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] restart failed', error));
  });
}
