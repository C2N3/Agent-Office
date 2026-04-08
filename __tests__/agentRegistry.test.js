const { normalizePath } = require('../src/main/agentRegistry');

describe('agentRegistry.normalizePath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  test('matches Windows project paths with WSL mount paths on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    expect(normalizePath('D:\\workspace\\Agent-Office'))
      .toBe(normalizePath('/mnt/d/workspace/Agent-Office'));
  });

  test('matches Windows project paths with WSL UNC mount paths on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    expect(normalizePath('D:\\workspace\\Agent-Office'))
      .toBe(normalizePath('\\\\wsl.localhost\\Ubuntu\\mnt\\d\\workspace\\Agent-Office'));
  });
});
