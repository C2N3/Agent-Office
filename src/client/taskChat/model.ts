export type MessageKind = 'user' | 'assistant-text' | 'assistant-tool' | 'assistant-error' | 'status';

export type ChatMessage = {
  id: string;
  kind: MessageKind;
  text: string;
  timestamp: number;
  taskId?: string | null;
};

export type TaskChatBridge = {
  close?: (agentRegistryId: string) => void;
  loadHistory?: (agentRegistryId: string) => Promise<ChatMessage[]>;
  appendMessage?: (
    agentRegistryId: string,
    message: Omit<ChatMessage, 'id'> & { id?: string },
  ) => Promise<{ success?: boolean; message?: ChatMessage }>;
  clearHistory?: (agentRegistryId: string) => Promise<{ success?: boolean }>;
  mergeWorkspace?: (registryId: string) => Promise<{ success?: boolean; error?: string | null }>;
  removeWorkspace?: (registryId: string) => Promise<{ success?: boolean; error?: string | null }>;
};

export type AgentWorkspace = {
  type?: string | null;
  branch?: string | null;
  repositoryName?: string | null;
  repositoryPath?: string | null;
  worktreePath?: string | null;
};

export type AgentInfo = {
  id: string;
  registryId?: string | null;
  provider?: string | null;
  project?: string | null;
  metadata?: {
    centralProjectId?: string | null;
    centralRoomId?: string | null;
    centralWorkerId?: string | null;
    projectPath?: string | null;
    source?: string | null;
    workspace?: AgentWorkspace | null;
  } | null;
};

export type TaskOutputPayload = {
  text: string;
  type?: string;
};

export function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    agentRegistryId: params.get('agentRegistryId') || '',
    agentName: params.get('agentName') || 'Agent',
    avatarFile: params.get('avatarFile') || '',
  };
}

export function getBridge(): TaskChatBridge | null {
  return (window as Window & { taskChatAPI?: TaskChatBridge }).taskChatAPI || null;
}

export function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function formatTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (isSameDay(timestamp, now)) return `${hh}:${mm}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()} ${hh}:${mm}`;
}

export function resolveRepositoryPath(agent: AgentInfo | null): string {
  if (!agent) return '';
  const workspace = agent.metadata?.workspace || null;
  return workspace?.repositoryPath || agent.metadata?.projectPath || agent.project || workspace?.worktreePath || '';
}

export async function fetchAgentInfo(agentRegistryId: string): Promise<AgentInfo | null> {
  try {
    const response = await fetch('/api/agents');
    if (response.ok) {
      const agents = (await response.json()) as AgentInfo[];
      if (Array.isArray(agents)) {
        const local = agents.find((agent) => agent?.id === agentRegistryId || agent?.registryId === agentRegistryId);
        if (local) return local;
      }
    }
  } catch {}

  try {
    const response = await fetch(`/api/server/agents/${encodeURIComponent(agentRegistryId)}`);
    if (!response.ok) return null;
    const payload = await response.json() as { agent?: any };
    const agent = payload?.agent;
    if (!agent?.id) return null;
    return {
      id: agent.id,
      registryId: agent.id,
      provider: agent.provider || null,
      project: agent.workspace?.label || agent.projectId || 'central',
      metadata: {
        centralProjectId: agent.projectId || null,
        centralRoomId: agent.roomId || null,
        centralWorkerId: agent.workspace?.workerId || null,
        source: 'central',
        workspace: agent.workspace ? {
          type: 'central',
          branch: agent.workspace.branch || null,
          repositoryName: agent.workspace.label || agent.workspace.repoRemote || null,
          repositoryPath: null,
          worktreePath: null,
        } : null,
      },
    };
  } catch {
    return null;
  }
}

export function closeWindow(agentRegistryId: string) {
  const bridge = getBridge();
  if (bridge?.close) bridge.close(agentRegistryId);
  else window.close();
}

export async function submitAgentTask(options: {
  agentInfo: AgentInfo | null;
  agentName: string;
  agentRegistryId: string;
  prompt: string;
}): Promise<{ error?: string; taskId?: string }> {
  const { agentInfo, agentName, agentRegistryId, prompt } = options;
  const isCentralAgent = agentInfo?.metadata?.source === 'central';
  const response = await fetch(isCentralAgent ? '/api/server/tasks' : '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isCentralAgent ? {
      agentId: agentRegistryId,
      projectId: agentInfo?.metadata?.centralProjectId || undefined,
      roomId: agentInfo?.metadata?.centralRoomId || undefined,
      workerId: agentInfo?.metadata?.centralWorkerId || undefined,
      title: `${agentName}: ${prompt.slice(0, 50)}`,
      prompt,
    } : {
      title: `${agentName}: ${prompt.slice(0, 50)}`,
      prompt,
      provider: agentInfo?.provider || 'claude',
      executionEnvironment: 'native',
      model: null,
      maxTurns: 30,
      repositoryPath: resolveRepositoryPath(agentInfo),
      priority: 'normal',
      autoMergeOnSuccess: false,
      agentRegistryId,
    }),
  });
  const result = (await response.json()) as { error?: string | { message?: string }; id?: string; task?: { id?: string } };
  const error = typeof result?.error === 'string' ? result.error : result?.error?.message || '';
  return {
    error: error || undefined,
    taskId: result?.id || result?.task?.id || undefined,
  };
}
