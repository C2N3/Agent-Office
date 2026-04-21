import { DEFAULT_PROVIDER_ID, normalizeProvider } from '../../providerCatalog.js';
import type { DashboardAgent } from '../../shared.js';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskExecutionEnvironment = 'native' | 'wsl';

export type AssignTaskFormState = {
  prompt: string;
  provider: string;
  model: string;
  maxTurns: string;
  priority: TaskPriority;
  executionEnvironment: TaskExecutionEnvironment;
  autoMergeOnSuccess: boolean;
};

export type AssignTaskPayload = {
  title: string;
  prompt: string;
  provider: string;
  executionEnvironment: TaskExecutionEnvironment;
  model: string | null;
  maxTurns: number;
  repositoryPath: string;
  priority: TaskPriority;
  autoMergeOnSuccess: boolean;
  agentRegistryId: string;
};

export const DEFAULT_FORM_STATE: AssignTaskFormState = {
  prompt: '',
  provider: DEFAULT_PROVIDER_ID,
  model: '',
  maxTurns: '30',
  priority: 'normal',
  executionEnvironment: 'native',
  autoMergeOnSuccess: false,
};

function resolveAgentProvider(agent: DashboardAgent | null): string {
  return normalizeProvider(agent?.provider || agent?.metadata?.provider);
}

export function resolveTaskRepositoryPath(agent: DashboardAgent | null): string {
  const workspaceRepo = agent?.metadata?.workspace?.repositoryPath || '';
  const metadataProjectPath = agent?.metadata?.projectPath || '';
  const projectPath = agent?.project || '';
  const worktreePath = agent?.metadata?.workspace?.worktreePath || '';

  return workspaceRepo || metadataProjectPath || projectPath || worktreePath || '';
}

export function resolveAgentLabel(agent: DashboardAgent | null): string {
  return agent?.name || agent?.project || agent?.id || 'Agent';
}

export function buildDefaultFormState(agent: DashboardAgent): AssignTaskFormState {
  return {
    ...DEFAULT_FORM_STATE,
    provider: resolveAgentProvider(agent),
  };
}

export function createAssignTaskPayload(
  agent: DashboardAgent,
  formState: AssignTaskFormState,
  repositoryPath = resolveTaskRepositoryPath(agent),
): AssignTaskPayload {
  const prompt = formState.prompt.trim();
  const maxTurns = Number.parseInt(formState.maxTurns, 10) || 30;
  const provider = normalizeProvider(formState.provider);
  const agentLabel = resolveAgentLabel(agent);

  return {
    title: `${agentLabel}: ${prompt.slice(0, 50)}`,
    prompt,
    provider,
    executionEnvironment: formState.executionEnvironment,
    model: formState.model || null,
    maxTurns,
    repositoryPath,
    priority: formState.priority,
    autoMergeOnSuccess: formState.autoMergeOnSuccess,
    agentRegistryId: agent.registryId || agent.id,
  };
}
