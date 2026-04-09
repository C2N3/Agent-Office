import type { AggregateTokenUsage } from './tokenUsage.js';

export type SessionContext = {
  cwd: string;
  meta: Record<string, unknown>;
};

export type PendingSessionStart = {
  sessionId: string;
  cwd: string;
  pid: number;
  isTeammate: boolean;
  isSubagent: boolean;
  initialState: string;
  parentId: string | null;
  meta: Record<string, unknown>;
};

export type SessionPidsMap = Map<string, number>;

export type AgentLike = {
  id?: string;
  currentSessionId?: string | null;
  isRegistered?: boolean;
  sessionId?: string | null;
  state?: string | null;
  tokenUsage?: AggregateTokenUsage | null;
  role?: string | null;
  avatarIndex?: number | null;
  workspace?: unknown;
  model?: string | null;
  lastMessage?: string | null;
  firstSeen?: number | null;
  displayName?: string | null;
  teammateName?: string | null;
  teamName?: string | null;
  runtimeSessionId?: string | null;
  resumeSessionId?: string | null;
  jsonlPath?: string | null;
  projectPath?: string | null;
  provider?: string | null;
  lastActivity?: number | null;
  name?: string | null;
};

export type AgentManagerLike = {
  getAgent(id: string): AgentLike | null | undefined;
  getAllAgents?(): AgentLike[];
  updateAgent(agent: Record<string, unknown>, source: string): void;
  rekeyAgent?(fromId: string, toId: string, fields?: Record<string, unknown>): void;
  removeAgent?(id: string): void;
  transitionToOffline?(id: string): void;
};

export type AgentRegistryLike = {
  replaceSessionId?(
    registryId: string,
    previousSessionId: string,
    nextSessionId: string,
    jsonlPath: string | null,
    updates?: Record<string, unknown>
  ): void;
  linkSession?(registryId: string, sessionId: string, jsonlPath: string | null, updates?: Record<string, unknown>): void;
  getActiveAgents?(): AgentLike[];
  findByProjectPath?(projectPath: string): AgentLike | null | undefined;
  accumulateTokens?(registryId: string, tokenUsage: AggregateTokenUsage | null | undefined): void;
  unlinkSession?(registryId: string): void;
  updateSessionTranscriptPath?(registryId: string, sessionId: string, transcriptPath: string): void;
};

export type SessionStateOptions = {
  agentManager?: AgentManagerLike | null;
  agentRegistry?: AgentRegistryLike | null;
  sessionPids: SessionPidsMap;
  debugLog: (message: string) => void;
  logPrefix?: string;
  updateSource?: string;
};

export function createSessionState({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  logPrefix = 'Event',
  updateSource = 'event',
}: SessionStateOptions) {
  const pendingSessionStarts: PendingSessionStart[] = [];
  const firstToolUseDone = new Map<string, boolean>();
  const sessionToRegistry = new Map<string, string>();
  const sessionContext = new Map<string, SessionContext>();
  const sessionAliases = new Map<string, string>();

  function resolveSessionId(sessionId: string | null | undefined): string | null {
    if (!sessionId) return null;
    let current = sessionId;
    const seen = new Set<string>();
    while (sessionAliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = sessionAliases.get(current) as string;
    }
    return current;
  }

  function resolveAgentId(sessionId: string | null | undefined): string | null {
    const canonicalSessionId = resolveSessionId(sessionId);
    if (!canonicalSessionId) return null;
    return sessionToRegistry.get(canonicalSessionId) || canonicalSessionId;
  }

  function rememberSessionContext(sessionId: string | null | undefined, cwd: string, meta: Record<string, unknown> = {}) {
    const canonicalSessionId = resolveSessionId(sessionId);
    if (!canonicalSessionId) return;
    const existing = sessionContext.get(canonicalSessionId) || { cwd: '', meta: {} };
    sessionContext.set(canonicalSessionId, {
      cwd: cwd || existing.cwd || '',
      meta: {
        ...existing.meta,
        ...meta,
      },
    });
  }

  function getSessionContext(sessionId: string | null | undefined): SessionContext {
    return sessionContext.get(resolveSessionId(sessionId) || '') || { cwd: '', meta: {} };
  }

  function canBindRegistryAgent(registryAgent: AgentLike | null | undefined): boolean {
    if (!registryAgent || !registryAgent.id) return false;
    if (registryAgent.currentSessionId) return false;
    const existing = agentManager ? agentManager.getAgent(registryAgent.id) : null;
    if (existing && existing.isRegistered && existing.sessionId && existing.state !== 'Offline') {
      return false;
    }
    return true;
  }

  function adoptSessionIdentity(previousSessionId: string | null | undefined, nextSessionId: string | null | undefined): string | null {
    const previousCanonical = resolveSessionId(previousSessionId);
    const nextCanonical = resolveSessionId(nextSessionId);

    if (!previousCanonical || !nextCanonical) return nextCanonical || previousCanonical || null;
    if (previousCanonical === nextCanonical) {
      if (previousSessionId !== nextCanonical) {
        sessionAliases.set(previousSessionId as string, nextCanonical);
      }
      return nextCanonical;
    }

    sessionAliases.set(previousSessionId as string, nextCanonical);
    sessionAliases.set(previousCanonical, nextCanonical);

    const previousContext = sessionContext.get(previousCanonical) || null;
    const nextContext = sessionContext.get(nextCanonical) || null;
    if (previousContext) {
      sessionContext.set(nextCanonical, {
        cwd: nextContext?.cwd || previousContext.cwd || '',
        meta: {
          ...(previousContext.meta || {}),
          ...(nextContext?.meta || {}),
        },
      });
      sessionContext.delete(previousCanonical);
    }

    if (firstToolUseDone.has(previousCanonical) && !firstToolUseDone.has(nextCanonical)) {
      firstToolUseDone.set(nextCanonical, firstToolUseDone.get(previousCanonical) as boolean);
    }
    firstToolUseDone.delete(previousCanonical);

    if (sessionPids.has(previousCanonical) && !sessionPids.has(nextCanonical)) {
      sessionPids.set(nextCanonical, sessionPids.get(previousCanonical) as number);
    }
    sessionPids.delete(previousCanonical);

    for (const pending of pendingSessionStarts) {
      if (pending.sessionId === previousCanonical) {
        pending.sessionId = nextCanonical;
      }
    }

    const registryId = sessionToRegistry.get(previousCanonical) || null;
    if (registryId) {
      sessionToRegistry.delete(previousCanonical);
      sessionToRegistry.set(nextCanonical, registryId);
      agentRegistry?.replaceSessionId?.(
        registryId,
        previousCanonical,
        nextCanonical,
        sessionContext.get(nextCanonical)?.meta?.jsonlPath as string | null || null,
        {
          runtimeSessionId: previousSessionId,
          resumeSessionId: nextCanonical,
        }
      );

      const registeredAgent = agentManager?.getAgent(registryId);
      if (registeredAgent) {
        agentManager?.updateAgent({
          ...registeredAgent,
          sessionId: nextCanonical,
          runtimeSessionId: registeredAgent.runtimeSessionId || previousSessionId,
          resumeSessionId: nextCanonical,
        }, updateSource);
      }
    } else if (agentManager?.getAgent(previousCanonical)) {
      agentManager.rekeyAgent?.(previousCanonical, nextCanonical, {
        sessionId: nextCanonical,
        runtimeSessionId: previousSessionId,
        resumeSessionId: nextCanonical,
      });
    }

    debugLog(`[${logPrefix}] Session alias adopted: ${previousCanonical.slice(0, 8)} → ${nextCanonical.slice(0, 8)}`);
    return nextCanonical;
  }

  function cleanupSessionResources(sessionId: string | null | undefined) {
    const canonicalSessionId = resolveSessionId(sessionId);
    if (!canonicalSessionId) return;
    firstToolUseDone.delete(canonicalSessionId);
    sessionPids.delete(canonicalSessionId);
    for (const [alias, canonical] of Array.from(sessionAliases.entries())) {
      if (alias === canonicalSessionId || canonical === canonicalSessionId) {
        sessionAliases.delete(alias);
      }
    }
    debugLog(`[Cleanup] Resources cleared for ${canonicalSessionId.slice(0, 8)}`);
  }

  function enqueueSessionStart(entry: PendingSessionStart) {
    pendingSessionStarts.push(entry);
  }

  function flushPendingStarts(handleSessionStart: (sessionId: string, cwd: string, pid: number, entry: PendingSessionStart) => void) {
    while (pendingSessionStarts.length > 0) {
      const entry = pendingSessionStarts.shift() as PendingSessionStart;
      handleSessionStart(entry.sessionId, entry.cwd, entry.pid, entry);
    }
  }

  function cleanup() {
    pendingSessionStarts.length = 0;
    firstToolUseDone.clear();
    sessionToRegistry.clear();
    sessionContext.clear();
    sessionAliases.clear();
  }

  return {
    pendingSessionStarts,
    firstToolUseDone,
    sessionToRegistry,
    resolveSessionId,
    resolveAgentId,
    adoptSessionIdentity,
    rememberSessionContext,
    getSessionContext,
    canBindRegistryAgent,
    cleanupSessionResources,
    enqueueSessionStart,
    flushPendingStarts,
    cleanup,
  };
}
