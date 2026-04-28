
import type { DashboardAgent, DashboardOpenOptions } from './dashboard/shared';

function toTimestamp(value) {
  return Number.isFinite(value) ? value : 0;
}

function getSessionRecency(entry, index) {
  if (!entry || typeof entry !== 'object') return index;
  return Math.max(
    toTimestamp(entry.startedAt),
    toTimestamp(entry.endedAt),
    index
  );
}

export function findLatestResumableSession(history) {
  if (!Array.isArray(history) || history.length === 0) return null;

  let latest = null;
  let latestScore = -1;

  history.forEach((entry, index) => {
    if (!(entry?.resumeSessionId || entry?.sessionId)) return;
    const score = getSessionRecency(entry, index);
    if (!latest || score > latestScore) {
      latest = entry;
      latestScore = score;
    }
  });

  return latest;
}

export function shouldAutoResumeRegisteredAgent(agent: DashboardAgent | undefined, openOptions: DashboardOpenOptions = {}) {
  if (openOptions.skipAutoResume) return false;
  if (!agent || !agent.isRegistered || !agent.registryId) return false;
  return agent.status === 'offline';
}

export function getDirectResumeSessionId(agent: DashboardAgent | undefined, openOptions: DashboardOpenOptions = {}) {
  if (openOptions.skipAutoResume) return null;
  if (!agent || typeof agent !== 'object') return null;

  const provider = agent?.metadata?.provider || agent?.provider || null;
  if (provider !== 'codex') return null;

  const status = agent?.status || '';
  if (!['offline', 'completed'].includes(status)) return null;

  return agent?.resumeSessionId || agent?.sessionId || null;
}
