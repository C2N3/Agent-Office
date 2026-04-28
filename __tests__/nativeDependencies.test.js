import {
  loadCloudflaredPackageBin,
  loadNodePty,
  loadTreeKill,
} from '../src/main/nativeDependencies';

describe('native dependency bridge', () => {
  test('loads node-pty through the provided package loader', () => {
    const pty = { spawn: jest.fn() };
    const packageRequire = jest.fn(() => pty);

    expect(loadNodePty(packageRequire)).toBe(pty);
    expect(packageRequire).toHaveBeenCalledWith('node-pty');
  });

  test('loads the cloudflared package bin through the provided package loader', () => {
    const packageRequire = jest.fn(() => ({ bin: '/opt/cloudflared' }));

    expect(loadCloudflaredPackageBin(packageRequire)).toBe('/opt/cloudflared');
    expect(packageRequire).toHaveBeenCalledWith('cloudflared');
  });

  test('returns null when the cloudflared package does not expose a string bin', () => {
    expect(loadCloudflaredPackageBin(() => ({ bin: null }))).toBeNull();
  });

  test('loads tree-kill through the provided package loader', () => {
    const treeKill = jest.fn();
    const packageRequire = jest.fn(() => treeKill);

    expect(loadTreeKill(packageRequire)).toBe(treeKill);
    expect(packageRequire).toHaveBeenCalledWith('tree-kill');
  });

  test('falls back to process.kill when tree-kill is unavailable', () => {
    const originalKill = process.kill;
    const kill = jest.fn();
    process.kill = kill;

    try {
      const fallback = loadTreeKill(() => {
        throw new Error('missing');
      });
      const callback = jest.fn();

      fallback(12345, 'SIGTERM', callback);

      expect(kill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(callback).toHaveBeenCalledWith();
    } finally {
      process.kill = originalKill;
    }
  });
});
