import {
  findLatestResumableSession,
  getDirectResumeSessionId,
  shouldAutoResumeRegisteredAgent,
} from '../src/client/dashboardResume';

describe('dashboardResume utils', () => {
  describe('findLatestResumableSession', () => {
    test('returns null for empty history', () => {
      expect(findLatestResumableSession([])).toBeNull();
      expect(findLatestResumableSession(null)).toBeNull();
    });

    test('picks the newest entry by startedAt', () => {
      const latest = findLatestResumableSession([
        { sessionId: 'older', startedAt: 100 },
        { sessionId: 'newer', startedAt: 200 },
      ]);

      expect(latest).toEqual(expect.objectContaining({ sessionId: 'newer' }));
    });

    test('falls back to endedAt and list order for legacy entries', () => {
      const latest = findLatestResumableSession([
        { sessionId: 'first' },
        { sessionId: 'second', endedAt: 300 },
        { sessionId: 'third' },
      ]);

      expect(latest).toEqual(expect.objectContaining({ sessionId: 'second' }));
    });

    test('ignores entries without a sessionId', () => {
      const latest = findLatestResumableSession([
        { startedAt: 1000 },
        { sessionId: 'valid', startedAt: 500 },
      ]);

      expect(latest).toEqual(expect.objectContaining({ sessionId: 'valid' }));
    });
  });

  describe('shouldAutoResumeRegisteredAgent', () => {
    test('allows offline registered agents', () => {
      expect(shouldAutoResumeRegisteredAgent({
        isRegistered: true,
        registryId: 'reg-1',
        status: 'offline',
      })).toBe(true);
    });

    test('blocks when skipAutoResume is set', () => {
      expect(shouldAutoResumeRegisteredAgent({
        isRegistered: true,
        registryId: 'reg-1',
        status: 'offline',
      }, { skipAutoResume: true })).toBe(false);
    });

    test('blocks non-offline or non-registered agents', () => {
      expect(shouldAutoResumeRegisteredAgent({
        isRegistered: true,
        registryId: 'reg-1',
        status: 'working',
      })).toBe(false);

      expect(shouldAutoResumeRegisteredAgent({
        isRegistered: false,
        registryId: null,
        status: 'offline',
      })).toBe(false);
    });
  });

  describe('getDirectResumeSessionId', () => {
    test('returns resumeSessionId for inactive codex agents', () => {
      expect(getDirectResumeSessionId({
        status: 'completed',
        resumeSessionId: 'run-123',
        metadata: { provider: 'codex' },
      })).toBe('run-123');
    });

    test('falls back to sessionId for legacy codex agents', () => {
      expect(getDirectResumeSessionId({
        status: 'offline',
        sessionId: 'run-legacy',
        metadata: { provider: 'codex' },
      })).toBe('run-legacy');
    });

    test('blocks active, skipped, or non-codex agents', () => {
      expect(getDirectResumeSessionId({
        status: 'working',
        resumeSessionId: 'run-123',
        metadata: { provider: 'codex' },
      })).toBeNull();

      expect(getDirectResumeSessionId({
        status: 'completed',
        resumeSessionId: 'run-123',
        metadata: { provider: 'claude' },
      })).toBeNull();

      expect(getDirectResumeSessionId({
        status: 'completed',
        resumeSessionId: 'run-123',
        metadata: { provider: 'codex' },
      }, { skipAutoResume: true })).toBeNull();
    });
  });
});
