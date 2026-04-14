
export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'provisioning'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type CLIProvider = 'claude' | 'codex' | 'gemini';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface TaskDefinition {
  id: string;
  title: string;
  prompt: string;
  provider: CLIProvider;
  fallbackProviders: CLIProvider[];
  model?: string | null;
  maxTurns?: number;

  // Dependency chain
  parentTaskId: string | null;
  childTaskIds: string[];
  dependsOn: string[];

  // Workspace
  repositoryPath: string;
  branchName?: string | null;
  baseBranch?: string | null;
  workspaceParent?: string | null;
  copyPaths?: string[];
  symlinkPaths?: string[];
  bootstrapCommand?: string;

  // Metadata
  agentRegistryId?: string | null;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;

  // Runtime state
  status: TaskStatus;
  currentProvider: CLIProvider | null;
  attempt: number;
  maxAttempts: number;
  terminalId?: string | null;
  workspacePath?: string | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  lastOutput?: string | null;
  outputPath?: string | null;

  // Merge config
  autoMergeOnSuccess: boolean;
  deleteBranchOnMerge: boolean;
}

export interface TaskStoreData {
  version: 1;
  tasks: TaskDefinition[];
}

export interface CLISpawnOptions {
  cwd: string;
  prompt: string;
  model?: string | null;
  maxTurns?: number;
  env?: Record<string, string>;
}

export interface CLISpawnResult {
  command: string;
  args: string[];
  promptDelivery: 'stdin' | 'arg';
  env: Record<string, string>;
  outputFormat?: 'text' | 'stream-json';
}

export interface OutputParseResult {
  type: 'progress' | 'tool_use' | 'completion' | 'error' | 'context_exhaustion' | 'text';
  toolName?: string;
  message?: string;
  tokenUsage?: { input: number; output: number };
  isContextExhausted?: boolean;
  exitReason?: string;
}

export interface CLIAdapter {
  readonly provider: CLIProvider;
  checkAvailability(): Promise<boolean>;
  buildSpawnConfig(options: CLISpawnOptions): CLISpawnResult;
  parseOutput(chunk: string, buffer: string): OutputParseResult[];
  detectContextExhaustion(buffer: string): boolean;
  buildStdinPrompt?(prompt: string): string;
}

export interface ContextDetectionResult {
  isExhausted: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  provider: CLIProvider;
}

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
