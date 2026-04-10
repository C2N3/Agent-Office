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
  test('updates current session ids while preserving runtime and resume identifiers', () => {
    const registry = new AgentRegistry(() => {});
    const agent = registry.createAgent({ name: 'Codex', projectPath: '/workspace/app', provider: 'codex' });

    registry.linkSession(agent.id, 'thread-1', '/tmp/codex.jsonl');
    const replaced = registry.replaceSessionId(agent.id, 'thread-1', 'session-1', '/tmp/codex.jsonl', {
      runtimeSessionId: 'thread-1',
      resumeSessionId: 'session-1',
    });

    expect(replaced).toBe(true);

    const updated = registry.getAgent(agent.id);
    expect(updated.currentSessionId).toBe('session-1');
    expect(updated.currentRuntimeSessionId).toBe('thread-1');
    expect(updated.currentResumeSessionId).toBe('session-1');
    expect(updated.sessionHistory).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        runtimeSessionId: 'thread-1',
        resumeSessionId: 'session-1',
        transcriptPath: '/tmp/codex.jsonl',
      }),
    ]);
  });
});

describe('agentRegistry.findActiveAgentsByRepository', () => {
  test('matches active agents by workspace repository metadata or resolved project path', () => {
    const registry = new AgentRegistry(() => {});
    const worktreeAgent = registry.createAgent({
      name: 'Worktree Agent',
      projectPath: '/workspace/app-worktree',
      workspace: {
        type: 'git-worktree',
        repositoryPath: '/workspace/app',
        worktreePath: '/workspace/app-worktree',
        branch: 'feature/test',
      },
    });
    const directAgent = registry.createAgent({
      name: 'Direct Agent',
      projectPath: '/workspace/app/packages/service',
    });
    const archivedAgent = registry.createAgent({
      name: 'Archived Agent',
      projectPath: '/workspace/app/legacy',
    });
    registry.archiveAgent(archivedAgent.id);

    const matches = registry.findActiveAgentsByRepository('/workspace/app', (candidatePath) => {
      if (candidatePath.startsWith('/workspace/app/')) {
        return '/workspace/app';
      }
      return candidatePath;
    });

    expect(matches).toEqual([
      expect.objectContaining({ id: worktreeAgent.id }),
      expect.objectContaining({ id: directAgent.id }),
    ]);
  });
});
