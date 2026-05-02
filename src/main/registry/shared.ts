import path from 'path';
import { sanitizeProjectPath } from '../../utils';
import type { AgentRegistryLike, PersistentAgent, PersistentSessionHistoryEntry } from './types';

function convertWslPathToWindowsDrivePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath) return rawPath;

  const normalized = rawPath.replace(/\\/g, '/');
  const directMountMatch = normalized.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/);
  if (directMountMatch) {
    const [, driveLetter, rest = ''] = directMountMatch;
    return `${driveLetter.toUpperCase()}:/${rest}`;
  }

  const uncMountMatch = normalized.match(/^\/\/wsl(?:\.localhost)?\/[^/]+\/mnt\/([a-zA-Z])(?:\/(.*))?$/i);
  if (uncMountMatch) {
    const [, driveLetter, rest = ''] = uncMountMatch;
    return `${driveLetter.toUpperCase()}:/${rest}`;
  }

  return rawPath;
}

export function normalizePath(p) {
  const sanitizedPath = sanitizeProjectPath(p);
  if (!sanitizedPath) return '';

  const isWindows = process.platform === 'win32';
  const pathForResolution = isWindows
    ? convertWslPathToWindowsDrivePath(sanitizedPath)
    : sanitizedPath;

  let norm = isWindows
    ? path.win32.resolve(pathForResolution)
    : path.resolve(pathForResolution);
  if (isWindows) {
    norm = norm.replace(/\\/g, '/').toLowerCase();
  }
  return norm.replace(/\/+$/, '');
}

function sanitizePathList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => sanitizeProjectPath(entry))
    .filter(Boolean);
}

export function sanitizeWorkspace(workspace, fallbackProjectPath = '') {
  if (!workspace || typeof workspace !== 'object') return null;

  const repositoryPath = sanitizeProjectPath(workspace.repositoryPath);
  const worktreePath = sanitizeProjectPath(workspace.worktreePath || fallbackProjectPath);
  const workspaceParent = sanitizeProjectPath(workspace.workspaceParent);
  const branch = String(workspace.branch || '').trim();
  const startPoint = String(workspace.startPoint || '').trim();
  const baseBranch = String(workspace.baseBranch || '').trim();
  const bootstrapCommand = String(workspace.bootstrapCommand || '').trim();

  if (!repositoryPath && !worktreePath && !branch) {
    return null;
  }

  return {
    type: workspace.type || 'git-worktree',
    repositoryPath,
    repositoryName: String(workspace.repositoryName || (repositoryPath ? path.basename(repositoryPath) : '')).trim(),
    worktreePath,
    workspaceParent,
    branch,
    startPoint,
    baseBranch,
    copyPaths: sanitizePathList(workspace.copyPaths),
    symlinkPaths: sanitizePathList(workspace.symlinkPaths),
    bootstrapCommand,
  };
}

export function buildSessionHistoryEntry(entry: Partial<PersistentSessionHistoryEntry> = {}) {
  const runtimeSessionId = entry.runtimeSessionId || entry.sessionId || null;
  const resumeSessionId = entry.resumeSessionId || entry.sessionId || null;
  const sessionId = entry.sessionId || resumeSessionId || runtimeSessionId || null;

  return {
    sessionId,
    runtimeSessionId,
    resumeSessionId,
    transcriptPath: entry.transcriptPath || null,
    startedAt: entry.startedAt ?? null,
    endedAt: entry.endedAt || null,
  };
}

export function sessionEntryMatches(entry, sessionId) {
  if (!entry || !sessionId) return false;
  return entry.sessionId === sessionId
    || entry.runtimeSessionId === sessionId
    || entry.resumeSessionId === sessionId;
}

export function linkAgentSession(
  registry: AgentRegistryLike,
  agent: PersistentAgent | null | undefined,
  registryId: string,
  sessionId: string | null,
  transcriptPath: string | null,
  options: Partial<PersistentSessionHistoryEntry> = {},
) {
  if (!agent) return;
  const runtimeSessionId = options.runtimeSessionId !== undefined ? options.runtimeSessionId : sessionId;
  const resumeSessionId = options.resumeSessionId !== undefined ? options.resumeSessionId : sessionId;
  const resolvedSessionId = sessionId || resumeSessionId || runtimeSessionId || null;

  agent.currentSessionId = resolvedSessionId;
  agent.currentRuntimeSessionId = runtimeSessionId || null;
  agent.currentResumeSessionId = resumeSessionId || null;
  agent.lastActiveAt = Date.now();
  if (!Array.isArray(agent.sessionHistory)) {
    agent.sessionHistory = [];
  }

  const existing = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, resolvedSessionId)
    || sessionEntryMatches(entry, runtimeSessionId)
    || sessionEntryMatches(entry, resumeSessionId));
  if (!existing) {
    agent.sessionHistory.push(buildSessionHistoryEntry({
      sessionId: resolvedSessionId,
      runtimeSessionId,
      resumeSessionId,
      transcriptPath,
      startedAt: Date.now(),
    }));
  } else {
    existing.sessionId = existing.sessionId || resolvedSessionId;
    existing.runtimeSessionId = existing.runtimeSessionId || runtimeSessionId || resolvedSessionId;
    existing.resumeSessionId = existing.resumeSessionId || resumeSessionId || resolvedSessionId;
    if (transcriptPath && !existing.transcriptPath) {
      existing.transcriptPath = transcriptPath;
    }
  }

  registry._save();
  registry.debugLog(`[Registry] Linked session: ${registryId.slice(0, 8)} ← ${(resolvedSessionId || '').slice(0, 8)}`);
}

export function unlinkAgentSession(registry, agent, registryId) {
  if (!agent) return;

  if (agent.currentSessionId && Array.isArray(agent.sessionHistory)) {
    const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, agent.currentSessionId)
      || sessionEntryMatches(item, agent.currentRuntimeSessionId)
      || sessionEntryMatches(item, agent.currentResumeSessionId));
    if (entry && !entry.endedAt) {
      entry.endedAt = Date.now();
    }
  }

  agent.currentSessionId = null;
  agent.currentRuntimeSessionId = null;
  agent.currentResumeSessionId = null;
  agent.lastActiveAt = Date.now();
  registry._save();
  registry.debugLog(`[Registry] Unlinked session: ${registryId.slice(0, 8)}`);
}

export function updateAgentTranscriptPath(registry, agent, sessionId, transcriptPath) {
  if (!agent || !Array.isArray(agent.sessionHistory)) return;
  const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, sessionId));
  if (entry && !entry.transcriptPath && transcriptPath) {
    entry.transcriptPath = transcriptPath;
    registry._save();
  }
}

export function replaceAgentSessionId(
  registry: AgentRegistryLike,
  agent: PersistentAgent | null | undefined,
  registryId: string,
  previousSessionId: string | null,
  nextSessionId: string | null,
  transcriptPath: string | null = null,
  options: Partial<PersistentSessionHistoryEntry> = {},
) {
  if (!agent || !previousSessionId || !nextSessionId) return false;
  const runtimeSessionId = options.runtimeSessionId !== undefined ? options.runtimeSessionId : previousSessionId;
  const resumeSessionId = options.resumeSessionId !== undefined ? options.resumeSessionId : nextSessionId;
  const resolvedSessionId = nextSessionId || resumeSessionId || runtimeSessionId || previousSessionId;

  if (previousSessionId === nextSessionId) {
    if (transcriptPath) {
      updateAgentTranscriptPath(registry, agent, nextSessionId, transcriptPath);
    }
    if (agent.currentRuntimeSessionId == null) agent.currentRuntimeSessionId = runtimeSessionId || null;
    if (agent.currentResumeSessionId == null) agent.currentResumeSessionId = resumeSessionId || null;
    return true;
  }

  if (!Array.isArray(agent.sessionHistory)) {
    agent.sessionHistory = [];
  }

  const previousEntry = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, previousSessionId)) || null;
  const nextEntry = agent.sessionHistory.find((entry) => sessionEntryMatches(entry, nextSessionId)) || null;

  if (agent.currentSessionId === previousSessionId || agent.currentSessionId === runtimeSessionId) {
    agent.currentSessionId = resolvedSessionId;
  }
  agent.currentRuntimeSessionId = agent.currentRuntimeSessionId || runtimeSessionId || previousSessionId;
  agent.currentResumeSessionId = resumeSessionId || nextSessionId || agent.currentResumeSessionId || null;

  if (previousEntry && nextEntry && previousEntry !== nextEntry) {
    nextEntry.sessionId = nextEntry.sessionId || resolvedSessionId;
    nextEntry.runtimeSessionId = nextEntry.runtimeSessionId || previousEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
    nextEntry.resumeSessionId = nextEntry.resumeSessionId || previousEntry.resumeSessionId || resumeSessionId || nextSessionId;
    nextEntry.transcriptPath = nextEntry.transcriptPath || previousEntry.transcriptPath || transcriptPath || null;
    nextEntry.startedAt = Math.min(Number(nextEntry.startedAt) || Infinity, Number(previousEntry.startedAt) || Infinity);
    if (!Number.isFinite(nextEntry.startedAt)) nextEntry.startedAt = previousEntry.startedAt || null;
    nextEntry.endedAt = nextEntry.endedAt || previousEntry.endedAt || null;
    agent.sessionHistory = agent.sessionHistory.filter((entry) => entry !== previousEntry);
  } else if (previousEntry) {
    previousEntry.sessionId = resolvedSessionId;
    previousEntry.runtimeSessionId = previousEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
    previousEntry.resumeSessionId = resumeSessionId || nextSessionId || previousEntry.resumeSessionId || null;
    previousEntry.transcriptPath = previousEntry.transcriptPath || transcriptPath || null;
  } else if (!nextEntry) {
    agent.sessionHistory.push(buildSessionHistoryEntry({
      sessionId: resolvedSessionId,
      runtimeSessionId,
      resumeSessionId,
      transcriptPath,
      startedAt: Date.now(),
    }));
  } else {
    nextEntry.sessionId = nextEntry.sessionId || resolvedSessionId;
    nextEntry.runtimeSessionId = nextEntry.runtimeSessionId || runtimeSessionId || previousSessionId;
    nextEntry.resumeSessionId = nextEntry.resumeSessionId || resumeSessionId || nextSessionId;
    nextEntry.transcriptPath = nextEntry.transcriptPath || transcriptPath || null;
  }

  registry._save();
  registry.debugLog(`[Registry] Session rekeyed: ${previousSessionId.slice(0, 8)} → ${nextSessionId.slice(0, 8)}`);
  return true;
}

export function getAgentSessionHistory(agent) {
  if (!agent) return [];
  return Array.isArray(agent.sessionHistory)
    ? agent.sessionHistory.map((entry) => buildSessionHistoryEntry(entry))
    : [];
}

export function findAgentSessionHistoryEntry(agent, sessionId) {
  if (!agent || !Array.isArray(agent.sessionHistory) || !sessionId) return null;
  const entry = agent.sessionHistory.find((item) => sessionEntryMatches(item, sessionId));
  return entry ? buildSessionHistoryEntry(entry) : null;
}

export function findAgentByProjectPath(
  agents: Iterable<PersistentAgent>,
  rawPath: string | null | undefined,
  options: { includeArchived?: boolean; requireEnabled?: boolean; requireIdle?: boolean } = {},
) {
  if (!rawPath) return null;
  const normalized = normalizePath(rawPath);
  for (const agent of agents) {
    if (!options.includeArchived && agent.archived) continue;
    if (options.requireEnabled && !agent.enabled) continue;
    if (normalizePath(agent.projectPath) !== normalized) continue;
    if (options.requireIdle && agent.currentSessionId) continue;
    return agent;
  }
  return null;
}
