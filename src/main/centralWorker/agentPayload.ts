const PROTOCOL_VERSION = 1;

export type RegistryLike = {
  getActiveAgents?: () => AgentRecord[];
  on?: (event: string, listener: (...args: any[]) => void) => any;
  off?: (event: string, listener: (...args: any[]) => void) => any;
};

export type AgentRecord = {
  id?: string;
  name?: string | null;
  role?: string | null;
  provider?: string | null;
  model?: string | null;
  projectPath?: string | null;
  avatarIndex?: number | null;
  enabled?: boolean;
  archived?: boolean;
  workspace?: {
    repositoryPath?: string | null;
    repositoryName?: string | null;
    worktreePath?: string | null;
    branch?: string | null;
    repoRemote?: string | null;
  } | null;
};

function basename(value?: string | null): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || '';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function localRefFromAgent(agent: AgentRecord): string {
  return agent.workspace?.worktreePath || agent.workspace?.repositoryPath || agent.projectPath || agent.id || '';
}

function projectIdFromAgent(agent: AgentRecord): string {
  const name = agent.workspace?.repositoryName
    || basename(agent.workspace?.repositoryPath)
    || basename(agent.projectPath)
    || agent.name
    || 'default';
  return `project_${slug(name)}`;
}

export function isActiveAgent(agent: AgentRecord | null | undefined): agent is AgentRecord {
  return !!agent?.id && agent.enabled !== false && !agent.archived;
}

export function buildAgentUpsertPayload(agent: AgentRecord, workerId: string, timestamp = Date.now()): Record<string, unknown> {
  const projectId = projectIdFromAgent(agent);
  return {
    type: 'agent.upsert',
    workerId,
    protocolVersion: PROTOCOL_VERSION,
    id: agent.id,
    projectId,
    roomId: 'default',
    name: agent.name || 'Agent',
    role: agent.role || '',
    provider: agent.provider || 'codex',
    model: agent.model || '',
    avatar: { assetId: `index:${agent.avatarIndex ?? 0}` },
    workspace: {
      projectId,
      workerId,
      repoRemote: agent.workspace?.repoRemote || '',
      branch: agent.workspace?.branch || '',
      localRef: localRefFromAgent(agent),
      label: agent.workspace?.repositoryName || basename(agent.projectPath) || agent.name || '',
    },
    timestamp,
  };
}
