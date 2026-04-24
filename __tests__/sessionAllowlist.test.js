/**
 * SessionAllowlist Tests
 *
 * Tracks orchestrator-spawned task sessions so provider gates only
 * react to task-launched CLIs.
 */

const { SessionAllowlist, normalizeCwd, sharedSessionAllowlist } = require('../src/main/orchestrator/sessionAllowlist');

describe('normalizeCwd', () => {
  test('returns empty string for nullish input', () => {
    expect(normalizeCwd(null)).toBe('');
    expect(normalizeCwd(undefined)).toBe('');
    expect(normalizeCwd('')).toBe('');
  });

  test('lowercases and normalizes slashes', () => {
    expect(normalizeCwd('C:\\Users\\Alice\\Project')).toBe('c:/users/alice/project');
    expect(normalizeCwd('/Users/Alice/Project')).toBe('/users/alice/project');
  });

  test('strips trailing slashes', () => {
    expect(normalizeCwd('/foo/bar/')).toBe('/foo/bar');
    expect(normalizeCwd('/foo/bar///')).toBe('/foo/bar');
  });

  test('collapses duplicate slashes', () => {
    expect(normalizeCwd('/foo//bar\\\\baz')).toBe('/foo/bar/baz');
  });
});

describe('SessionAllowlist', () => {
  let allowlist;

  beforeEach(() => {
    allowlist = new SessionAllowlist();
  });

  describe('register / unregister', () => {
    test('registered task is discoverable by taskId, pid, and cwd', () => {
      allowlist.register({ taskId: 't1', pid: 12345, cwd: '/repo/a', provider: 'claude' });

      expect(allowlist.hasTaskId('t1')).toBe(true);
      expect(allowlist.hasPid(12345)).toBe(true);
      expect(allowlist.hasCwd('/repo/a')).toBe(true);
      expect(allowlist.size()).toBe(1);
    });

    test('hasCwd normalizes lookup input', () => {
      allowlist.register({ taskId: 't1', pid: 1, cwd: '/Users/Alice/Work' });
      expect(allowlist.hasCwd('/users/alice/work')).toBe(true);
      expect(allowlist.hasCwd('/Users/Alice/Work/')).toBe(true);
      expect(allowlist.hasCwd('\\Users\\Alice\\Work')).toBe(true);
    });

    test('unregister removes all indices', () => {
      allowlist.register({ taskId: 't1', pid: 9, cwd: '/repo/a' });
      allowlist.unregister('t1');

      expect(allowlist.hasTaskId('t1')).toBe(false);
      expect(allowlist.hasPid(9)).toBe(false);
      expect(allowlist.hasCwd('/repo/a')).toBe(false);
      expect(allowlist.size()).toBe(0);
    });

    test('re-register replaces the previous entry cleanly', () => {
      allowlist.register({ taskId: 't1', pid: 100, cwd: '/repo/a' });
      allowlist.register({ taskId: 't1', pid: 200, cwd: '/repo/b' });

      expect(allowlist.hasPid(100)).toBe(false);
      expect(allowlist.hasPid(200)).toBe(true);
      expect(allowlist.hasCwd('/repo/a')).toBe(false);
      expect(allowlist.hasCwd('/repo/b')).toBe(true);
    });

    test('multiple tasks in the same cwd — cwd stays allowed until all unregister', () => {
      allowlist.register({ taskId: 't1', pid: 1, cwd: '/repo/shared' });
      allowlist.register({ taskId: 't2', pid: 2, cwd: '/repo/shared' });

      allowlist.unregister('t1');
      expect(allowlist.hasCwd('/repo/shared')).toBe(true);

      allowlist.unregister('t2');
      expect(allowlist.hasCwd('/repo/shared')).toBe(false);
    });

    test('ignores entries without a taskId', () => {
      allowlist.register({ taskId: '', pid: 1, cwd: '/x' });
      expect(allowlist.size()).toBe(0);
    });

    test('register without pid still tracks cwd and taskId', () => {
      allowlist.register({ taskId: 't1', cwd: '/repo/a' });
      expect(allowlist.hasTaskId('t1')).toBe(true);
      expect(allowlist.hasCwd('/repo/a')).toBe(true);
      expect(allowlist.hasPid(0)).toBe(false);
    });
  });

  describe('accepts', () => {
    beforeEach(() => {
      allowlist.register({ taskId: 't1', pid: 555, cwd: '/repo/a' });
    });

    test('accepts when cwd matches', () => {
      expect(allowlist.accepts({ cwd: '/repo/a', pid: 999 })).toBe(true);
    });

    test('accepts when pid matches', () => {
      expect(allowlist.accepts({ cwd: '/other', pid: 555 })).toBe(true);
    });

    test('accepts when only taskId matches', () => {
      expect(allowlist.accepts({ taskId: 't1' })).toBe(true);
    });

    test('rejects when nothing matches', () => {
      expect(allowlist.accepts({ cwd: '/other', pid: 999, taskId: 'tx' })).toBe(false);
    });

    test('rejects empty signals', () => {
      expect(allowlist.accepts({})).toBe(false);
      expect(allowlist.accepts({ cwd: '', pid: 0 })).toBe(false);
    });
  });

  describe('resolvers', () => {
    test('resolveTaskIdByCwd returns a registered taskId', () => {
      allowlist.register({ taskId: 't1', pid: 1, cwd: '/repo/a' });
      expect(allowlist.resolveTaskIdByCwd('/repo/a')).toBe('t1');
      expect(allowlist.resolveTaskIdByCwd('/missing')).toBeNull();
    });

    test('resolveTaskIdByPid returns a registered taskId', () => {
      allowlist.register({ taskId: 't1', pid: 42, cwd: '/x' });
      expect(allowlist.resolveTaskIdByPid(42)).toBe('t1');
      expect(allowlist.resolveTaskIdByPid(9999)).toBeNull();
    });
  });

  describe('clear', () => {
    test('drops all entries', () => {
      allowlist.register({ taskId: 't1', pid: 1, cwd: '/a' });
      allowlist.register({ taskId: 't2', pid: 2, cwd: '/b' });
      allowlist.clear();
      expect(allowlist.size()).toBe(0);
    });
  });
});

describe('sharedSessionAllowlist', () => {
  test('is a singleton instance of SessionAllowlist', () => {
    expect(sharedSessionAllowlist).toBeInstanceOf(SessionAllowlist);
  });
});
