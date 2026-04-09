jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

const { AgentRegistry, normalizePath } = require('../src/main/agentRegistry');

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

describe('agentRegistry.replaceSessionId', () => {
  test('updates current session and history entries to the canonical id', () => {
    const registry = new AgentRegistry(() => {});
    const agent = registry.createAgent({ name: 'Codex', projectPath: '/workspace/app', provider: 'codex' });

    registry.linkSession(agent.id, 'thread-1', '/tmp/codex.jsonl');
    const replaced = registry.replaceSessionId(agent.id, 'thread-1', 'session-1');

    expect(replaced).toBe(true);

    const updated = registry.getAgent(agent.id);
    expect(updated.currentSessionId).toBe('session-1');
    expect(updated.sessionHistory).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        transcriptPath: '/tmp/codex.jsonl',
      }),
    ]);
  });
});
