(function attachDashboardResumeUtils(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.dashboardResumeUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDashboardResumeUtils() {
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

  function findLatestResumableSession(history) {
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

  function shouldAutoResumeRegisteredAgent(agent, openOptions = {}) {
    if (openOptions.skipAutoResume) return false;
    if (!agent || !agent.isRegistered || !agent.registryId) return false;
    return agent.status === 'offline';
  }

  return {
    findLatestResumableSession,
    shouldAutoResumeRegisteredAgent,
  };
}));
