import { getCodexSessionRoots } from '../src/main/providers/codex/paths';

describe('codexPaths', () => {
  test('returns an explicit session root when configured', () => {
    const existsSync = jest.fn((target) => target === '/custom/codex/sessions');

    expect(getCodexSessionRoots({
      env: { PIXEL_AGENT_CODEX_SESSION_ROOT: '/custom/codex/sessions' },
      existsSync,
      localRoot: '/local/.codex/sessions',
      wslRoot: '\\\\wsl.localhost\\Ubuntu\\home\\user\\.codex\\sessions',
    })).toEqual(['/custom/codex/sessions']);
  });

  test('includes both local and WSL roots when both exist', () => {
    const roots = new Set([
      'C:\\Users\\alice\\.codex\\sessions',
      '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex\\sessions',
    ]);
    const existsSync = jest.fn((target) => roots.has(target));

    expect(getCodexSessionRoots({
      env: {},
      existsSync,
      localRoot: 'C:\\Users\\alice\\.codex\\sessions',
      wslRoot: '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex\\sessions',
    })).toEqual([
      'C:\\Users\\alice\\.codex\\sessions',
      '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex\\sessions',
    ]);
  });

  test('deduplicates identical roots', () => {
    const existsSync = jest.fn(() => true);

    expect(getCodexSessionRoots({
      env: {},
      existsSync,
      localRoot: '/home/user/.codex/sessions',
      wslRoot: '/home/user/.codex/sessions',
    })).toEqual(['/home/user/.codex/sessions']);
  });
});
