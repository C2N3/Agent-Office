import {
  type DashboardAgent,
  type DashboardAgentRecord,
  type DashboardWorkspace,
  SHARED_AVATAR_FILES,
  state,
} from './shared.js';

type CentralAgentWorkspace = { workerId?: string; repoRemote?: string; branch?: string; localRef?: string; label?: string; };
type CentralAgent = {
  id: string; projectId?: string; roomId?: string; name?: string; role?: string; provider?: string; model?: string;
  avatar?: { assetId?: string; url?: string; initials?: string; color?: string; };
  workspace?: CentralAgentWorkspace; archivedAt?: string | null;
};
type CentralAgentsResponse = { agents?: CentralAgent[]; };
type CentralAgentResponse = { agent?: CentralAgent; error?: { message?: string } | string; };
type CentralAgentBulkResponse = { agents?: CentralAgent[]; error?: { message?: string } | string; };
type CentralServerConfig = { agentSyncEnabled?: boolean; workerEnabled?: boolean; remoteMode?: 'local' | 'host' | 'guest'; };
type SyncCallbacks = { upsertAgent: (agent: DashboardAgent) => void; removeAgent: (id: string) => void; };

let eventSource: EventSource | null = null, callbacks: SyncCallbacks | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

type SyncableAgentRecord = DashboardAgentRecord | DashboardAgent;

function basename(value?: string | null): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || '';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function recordId(agent: SyncableAgentRecord): string {
  return ('registryId' in agent && agent.registryId) ? agent.registryId : agent.id;
}

function recordWorkspace(agent: SyncableAgentRecord): DashboardWorkspace | null {
  return ('workspace' in agent && agent.workspace)
    ? agent.workspace
    : (('metadata' in agent && agent.metadata?.workspace) || null);
}

function recordProjectPath(agent: SyncableAgentRecord): string {
  return ('projectPath' in agent && agent.projectPath)
    ? agent.projectPath
    : (('metadata' in agent && agent.metadata?.projectPath) || '');
}

function recordProjectLabel(agent: SyncableAgentRecord): string {
  return ('project' in agent && agent.project) ? agent.project : '';
}

function projectIdFromRecord(agent: SyncableAgentRecord): string {
  const workspace = recordWorkspace(agent);
  const projectPath = recordProjectPath(agent);
  const name = workspace?.repositoryName
    || basename(workspace?.repositoryPath)
    || basename(projectPath)
    || recordProjectLabel(agent)
    || 'default';
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

function centralWorkspaceFromRecord(agent: SyncableAgentRecord): CentralAgentWorkspace {
  const workspace = recordWorkspace(agent);
  const projectPath = recordProjectPath(agent);
  return {
    branch: workspace?.branch || '',
    localRef: localRefFromWorkspace(workspace, projectPath),
    label: workspace?.repositoryName || basename(projectPath) || recordProjectLabel(agent) || '',
  };
}

function centralPayloadFromRecord(agent: SyncableAgentRecord): CentralAgent {
  return {
    id: recordId(agent),
    projectId: projectIdFromRecord(agent),
    roomId: 'default',
    name: agent.name || 'Agent',
    role: agent.role || '',
    provider: agent.provider || 'codex',
    avatar: { assetId: `index:${agent.avatarIndex ?? 0}` },
    workspace: centralWorkspaceFromRecord(agent),
  };
}

function shouldSyncLocalAgent(agent: DashboardAgent): boolean {
  return !!agent.id && !!agent.isRegistered && agent.metadata?.source !== 'central';
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

export async function isCentralAgentSyncEnabled(): Promise<boolean> { return !!(await fetchCentralAgentConfig())?.agentSyncEnabled; }

async function fetchCentralAgentConfig(): Promise<CentralServerConfig | null> {
  try { return await fetchJSON<CentralServerConfig>('/api/server/config'); } catch { return null; }
}

async function isBrowserLocalAgentSyncEnabled(): Promise<boolean> {
  const config = await fetchCentralAgentConfig();
  return !!config?.agentSyncEnabled && !config.workerEnabled;
}

export async function fetchCentralDashboardAgents(): Promise<DashboardAgent[]> {
  if (!await isCentralAgentSyncEnabled()) return [];
  const response = await fetchJSON<CentralAgentsResponse>('/api/server/agents');
  return (response.agents || [])
    .filter((agent) => !agent.archivedAt)
    .map(mergeCentralAgent);
}

async function upsertCentralAgents(agents: SyncableAgentRecord[]): Promise<void> {
  const payloads = agents
    .map(centralPayloadFromRecord)
    .filter((agent) => !!agent.id);
  if (payloads.length === 0) return;
  await fetchJSON<CentralAgentBulkResponse>('/api/server/agents/bulk-upsert', {
    method: 'POST',
    body: JSON.stringify({ agents: payloads }),
  });
}

async function syncLocalAgentsToCentral(): Promise<void> {
  if (!await isBrowserLocalAgentSyncEnabled()) return;
  const agents = await fetchJSON<DashboardAgent[]>('/api/agents');
  await upsertCentralAgents(agents.filter(shouldSyncLocalAgent));
}

async function applyCentralSnapshot(): Promise<void> {
  if (!callbacks) return;
  const agents = await fetchCentralDashboardAgents();
  for (const agent of agents) callbacks.upsertAgent(agent);
}

export async function syncCentralAgentRecord(agent?: DashboardAgentRecord | null): Promise<void> {
  if (!agent?.id || !await isBrowserLocalAgentSyncEnabled()) return;
  await upsertCentralAgents([agent]);
}

export async function syncCentralAgentUpdate(id?: string | null, fields: Partial<DashboardAgentRecord> = {}): Promise<void> {
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

export async function syncCentralAgentRemoval(id?: string | null): Promise<void> {
  if (!id || !await isBrowserLocalAgentSyncEnabled()) return;
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

function stopCentralAgentPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
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
  if (!callbacks || !await isCentralAgentSyncEnabled()) return;
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
  if (config?.remoteMode === 'guest') {
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
}

export function startCentralAgentSync(nextCallbacks: SyncCallbacks): void {
  callbacks = nextCallbacks;
  restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] start failed', error));
  window.addEventListener('central-agent-sync-config-changed', () => {
    restartCentralAgentEvents().catch((error) => console.warn('[Central Agents] restart failed', error));
  });
}
