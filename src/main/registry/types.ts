import type {
  DashboardAgentRecord,
  DashboardSessionHistoryEntry,
  DashboardWorkspace,
} from '../../shared/contracts/index.js';

export type PersistentSessionHistoryEntry = DashboardSessionHistoryEntry & {
  runtimeSessionId?: string | null;
  resumeSessionId?: string | null;
  transcriptPath?: string | null;
};

export type PersistentAgent = DashboardAgentRecord & {
  projectPath: string;
  createdAt?: number;
  lastActiveAt?: number | null;
  archivedAt?: number | null;
  currentSessionId?: string | null;
  currentRuntimeSessionId?: string | null;
  currentResumeSessionId?: string | null;
  sessionHistory?: PersistentSessionHistoryEntry[];
  workspace?: DashboardWorkspace | null;
};

export type AgentRegistryLike = {
  debugLog: (message: string) => void;
  _save(): void;
};
