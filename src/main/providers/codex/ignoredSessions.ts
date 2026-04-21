type IgnoredSessionTrackerOptions = {
  debugLog: (message: string) => void;
  logPrefix?: string;
  resolveSessionId?: ((sessionId: string | null | undefined) => string | null) | null;
};

export function createIgnoredSessionTracker({
  debugLog,
  logPrefix = 'Codex',
  resolveSessionId = null,
}: IgnoredSessionTrackerOptions) {
  const ignoredSessions = new Map<string, string>();

  function canonicalize(sessionId: string | null | undefined): string | null {
    if (!sessionId) return null;
    return typeof resolveSessionId === 'function'
      ? resolveSessionId(sessionId)
      : sessionId;
  }

  function mark(sessionId: string | null | undefined, reason: string) {
    const canonicalSessionId = canonicalize(sessionId);
    if (!canonicalSessionId || ignoredSessions.has(canonicalSessionId)) return;
    ignoredSessions.set(canonicalSessionId, reason);
    debugLog(`[${logPrefix}] Ignoring repeated events for session ${canonicalSessionId.slice(0, 8)}: ${reason}`);
  }

  function clear(sessionId: string | null | undefined) {
    const canonicalSessionId = canonicalize(sessionId);
    if (!canonicalSessionId) return;
    ignoredSessions.delete(canonicalSessionId);
  }

  function shouldSuppress(sessionId: string | null | undefined, eventType: string | null | undefined) {
    const canonicalSessionId = canonicalize(sessionId);
    if (!canonicalSessionId) return false;
    if (eventType === 'session.start' || eventType === 'session.end') return false;
    return ignoredSessions.has(canonicalSessionId);
  }

  function adopt(previousSessionId: string | null | undefined, nextSessionId: string | null | undefined) {
    const previousCanonical = canonicalize(previousSessionId);
    const nextCanonical = canonicalize(nextSessionId);
    if (!previousCanonical || !nextCanonical || previousCanonical === nextCanonical) return;

    const reason = ignoredSessions.get(previousSessionId as string) || ignoredSessions.get(previousCanonical);
    ignoredSessions.delete(previousSessionId as string);
    ignoredSessions.delete(previousCanonical);
    if (reason && !ignoredSessions.has(nextCanonical)) {
      ignoredSessions.set(nextCanonical, reason);
    }
  }

  return {
    mark,
    clear,
    shouldSuppress,
    adopt,
  };
}
