/**
 * codexProcessor.js Tests
 * Codex exec --json event normalization and agent state transitions.
 */

const { createCodexProcessor, normalizeCodexEvent } = require('../src/main/codexProcessor');

function createMockAgentManager() {
  const agents = new Map();
  return {
    getAgent: jest.fn((id) => agents.get(id) || null),
    updateAgent: jest.fn((data, source) => {
      const id = data.sessionId || data.id;
      agents.set(id, { ...data, id, firstSeen: data.firstSeen || Date.now() });
      return agents.get(id);
    }),
    removeAgent: jest.fn((id) => { agents.delete(id); }),
    getAllAgents: jest.fn(() => Array.from(agents.values())),
    getAgentCount: jest.fn(() => agents.size),
    _agents: agents,
  };
}

describe('codexProcessor', () => {
  let processor;
  let agentManager;
  let sessionPids;
  let debugLog;

  beforeEach(() => {
    agentManager = createMockAgentManager();
    sessionPids = new Map();
    debugLog = jest.fn();

    processor = createCodexProcessor({
      agentManager,
      sessionPids,
      debugLog,
    });
  });

  test('thread.started creates a Codex agent', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'thread-1234',
        provider: 'codex',
        displayName: 'app',
        state: 'Waiting',
        model: 'gpt-5-codex',
      }),
      'codex'
    );
  });

  test('turn.started moves agent to Thinking', () => {
    agentManager._agents.set('thread-1234', {
      id: 'thread-1234',
      sessionId: 'thread-1234',
      provider: 'codex',
      state: 'Done',
    });

    processor.processCodexEvent({
      type: 'turn.started',
      thread_id: 'thread-1234',
    });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'Thinking' }),
      'codex'
    );
  });

  test('command execution item drives Working -> Thinking transitions', () => {
    agentManager._agents.set('thread-1234', {
      id: 'thread-1234',
      sessionId: 'thread-1234',
      provider: 'codex',
      state: 'Thinking',
    });

    processor.processCodexEvent({
      type: 'item.started',
      thread_id: 'thread-1234',
      item: { type: 'command_execution', command: 'npm test' },
    });
    processor.processCodexEvent({
      type: 'item.completed',
      thread_id: 'thread-1234',
      item: { type: 'command_execution', command: 'npm test' },
    });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'Working', currentTool: 'Command' }),
      'codex'
    );
    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'Thinking', currentTool: null }),
      'codex'
    );
  });

  test('agent_message completion stores last message', () => {
    agentManager._agents.set('thread-1234', {
      id: 'thread-1234',
      sessionId: 'thread-1234',
      provider: 'codex',
      state: 'Thinking',
    });

    processor.processCodexEvent({
      type: 'item.completed',
      thread_id: 'thread-1234',
      item: { type: 'agent_message', text: 'Finished the patch.' },
    });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ lastMessage: 'Finished the patch.' }),
      'codex'
    );
  });

  test('turn.completed accumulates usage and marks agent Done', () => {
    agentManager._agents.set('thread-1234', {
      id: 'thread-1234',
      sessionId: 'thread-1234',
      provider: 'codex',
      model: 'gpt-5-codex',
      state: 'Thinking',
      lastMessage: 'Finished the patch.',
      tokenUsage: { inputTokens: 10, outputTokens: 5, estimatedCost: 0 },
    });

    processor.processCodexEvent({
      type: 'turn.completed',
      thread_id: 'thread-1234',
      usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40 },
    });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'Done',
        currentTool: null,
        lastMessage: 'Finished the patch.',
        tokenUsage: expect.objectContaining({
          inputTokens: 130,
          outputTokens: 45,
        }),
      }),
      'codex'
    );
  });

  test('exec.completed removes the session', () => {
    agentManager._agents.set('thread-1234', {
      id: 'thread-1234',
      sessionId: 'thread-1234',
      provider: 'codex',
      state: 'Done',
    });

    processor.processCodexEvent({
      type: 'exec.completed',
      thread_id: 'thread-1234',
    });

    expect(agentManager.removeAgent).toHaveBeenCalledWith('thread-1234');
  });
});

describe('normalizeCodexEvent', () => {
  test('returns empty list for untracked items without thread context', () => {
    expect(normalizeCodexEvent({
      type: 'item.completed',
      item: { type: 'plan_update' },
    })).toEqual([]);
  });

  test('maps MCP tool calls to codex tool events', () => {
    expect(normalizeCodexEvent({
      type: 'item.started',
      thread_id: 'thread-1234',
      item: { type: 'mcp_tool_call', server: 'figma', tool_name: 'get_node' },
    })).toEqual([
      expect.objectContaining({
        type: 'tool.start',
        sessionId: 'thread-1234',
        toolName: 'figma',
        toolInput: { tool_name: 'get_node', server: 'figma' },
      })
    ]);
  });
});
