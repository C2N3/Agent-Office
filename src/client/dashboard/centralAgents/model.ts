import {
  type DashboardAgent,
  type DashboardAgentRecord,
  type DashboardWorkspace,
  SHARED_AVATAR_FILES,
  state,
} from '../shared.js';

export type CentralAgentWorkspace = {
  workerId?: string;
  repoRemote?: string;
  branch?: string;
  localRef?: string;
  label?: string;
};

export type CentralAgent = {
  id: string;
  projectId?: string;
  roomId?: string;
  name?: string;
  role?: string;
  provider?: string;
  model?: string;
  avatar?: { assetId?: string; url?: string; initials?: string; color?: string; };
  workspace?: CentralAgentWorkspace;
  archivedAt?: string | null;
};

export type CentralAgentsResponse = { agents?: CentralAgent[]; };
export type CentralAgentResponse = { agent?: CentralAgent; error?: { message?: string } | string; };
export type CentralAgentBulkResponse = { agents?: CentralAgent[]; error?: { message?: string } | string; };

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

export function centralWorkspaceFromRecord(agent: SyncableAgentRecord): CentralAgentWorkspace {
  const workspace = recordWorkspace(agent);
  const projectPath = recordProjectPath(agent);
  return {
    branch: workspace?.branch || '',
    localRef: localRefFromWorkspace(workspace, projectPath),
    label: workspace?.repositoryName || basename(projectPath) || recordProjectLabel(agent) || '',
  };
}

export function centralPayloadFromRecord(agent: SyncableAgentRecord): CentralAgent {
  return {
    id: recordId(agent),
    projectId: projectIdFromRecord(agent),
    roomId: 'default',
    name: agent.name || 'Agent',
    role: agent.role || '',
    provider: agent.provider || 'codex',
    model: agent.model || '',
    avatar: { assetId: `index:${agent.avatarIndex ?? 0}` },
    workspace: centralWorkspaceFromRecord(agent),
  };
}

export function shouldSyncLocalAgent(agent: DashboardAgent): boolean {
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

export function mergeCentralAgent(agent: CentralAgent): DashboardAgent {
  const incoming = dashboardAgentFromCentral(agent);
  const existing = state.agents.get(agent.id);
  if (!existing || existing.metadata?.source === 'central') return incoming;
  return {
    ...incoming,
    ...existing,
    name: incoming.name,
    role: incoming.role,
    project: incoming.project,
    avatarIndex: incoming.avatarIndex,
    provider: incoming.provider,
    model: incoming.model,
    metadata: incoming.metadata,
  };
}
