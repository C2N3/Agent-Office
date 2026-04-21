import { DEFAULT_PROVIDER_ID } from '../providerCatalog.js';

export type TaskReportContext = {
  agentRegistryId: string;
  executionEnvironment: string;
  model: string | null;
  provider: string;
  repositoryPath: string;
  taskId: string;
  title: string;
};

export type TaskReportData = {
  agentRegistryId?: string | null;
  diff?: string | null;
  executionEnvironment?: string | null;
  model?: string | null;
  output?: string | null;
  provider?: string | null;
  repositoryPath?: string | null;
  title?: string | null;
};

export type ActionState = 'followUp' | 'merge' | 'reject' | null;

export type FollowUpTaskPayload = {
  agentRegistryId: string;
  executionEnvironment: string;
  maxTurns: number;
  model: string | null;
  parentTaskId: string;
  priority: 'normal';
  prompt: string;
  provider: string;
  repositoryPath?: string;
  title: string;
};

export const EMPTY_TASK_REPORT_CONTEXT: TaskReportContext = {
  agentRegistryId: '',
  executionEnvironment: 'auto',
  model: null,
  provider: DEFAULT_PROVIDER_ID,
  repositoryPath: '',
  taskId: '',
  title: 'Task Report',
};

export function clearAgentReportBubble(agentRegistryId: string): void {
  const officeChars = (globalThis as any).officeCharacters;
  if (officeChars?.clearReportBubble && agentRegistryId) {
    officeChars.clearReportBubble(agentRegistryId);
  }
}

export function createFollowUpTaskPayload(
  context: TaskReportContext,
  prompt: string,
): FollowUpTaskPayload {
  const payload: FollowUpTaskPayload = {
    agentRegistryId: context.agentRegistryId,
    executionEnvironment: context.executionEnvironment,
    maxTurns: 30,
    model: context.model,
    parentTaskId: context.taskId,
    priority: 'normal',
    prompt,
    provider: context.provider,
    title: `Follow-up: ${prompt.slice(0, 60)}`,
  };

  if (context.repositoryPath) {
    payload.repositoryPath = context.repositoryPath;
  }

  return payload;
}
