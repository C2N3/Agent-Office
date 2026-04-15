/**
 * codexProcessor.js Tests
 * Codex exec --json event normalization and agent state transitions.
 */

const { createCodexProcessor, normalizeCodexEvent } = require('../src/main/providers/codex/processor');

function createMockAgentManager() {
  const agents = new Map();
  return {
    getAgent: jest.fn((id) => agents.get(id) || null),
    updateAgent: jest.fn((data, source) => {
      const id = data.registryId || data.sessionId || data.id;
      agents.set(id, { ...data, id, firstSeen: data.firstSeen || Date.now() });
      return agents.get(id);
    }),
    rekeyAgent: jest.fn((currentId, nextId, fields = {}) => {
      const current = agents.get(currentId);
      const target = agents.get(nextId) || null;
      if (!current) return null;
      const merged = {
        ...(target || {}),
        ...current,
        ...fields,
        id: nextId,
        sessionId: fields.sessionId || current.sessionId || nextId,
      };
      agents.delete(currentId);
      agents.set(nextId, merged);
      return merged;
    }),
    removeAgent: jest.fn((id) => { agents.delete(id); }),
    getAllAgents: jest.fn(() => Array.from(agents.values())),
    getAgentCount: jest.fn(() => agents.size),
    _agents: agents,
  };
}

function createMockAgentRegistry() {
  return {
    findByProjectPath: jest.fn(() => null),
    linkSession: jest.fn(),
    replaceSessionId: jest.fn(),
    updateSessionTranscriptPath: jest.fn(),
    accumulateTokens: jest.fn(),
    unlinkSession: jest.fn(),
  };
}

describe('codexProcessor', () => {
  let processor;
  let agentManager;
  let agentRegistry;
  let sessionPids;
  let debugLog;

  beforeEach(() => {
    agentManager = createMockAgentManager();
    agentRegistry = createMockAgentRegistry();
    sessionPids = new Map();
    debugLog = jest.fn();

    processor = createCodexProcessor({
      agentManager,
      agentRegistry,
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

  test('thread.started uses workspacePath to attach desktop sessions to a registered agent', () => {
    agentRegistry.findByProjectPath.mockReturnValue({
      id: 'registry-1',
      name: 'Desktop Agent',
      role: 'Implementer',
      avatarIndex: 3,
    });

    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      workspacePath: '/workspace/app',
      model: 'gpt-5-codex',
    });

    expect(agentRegistry.findByProjectPath).toHaveBeenCalledWith('/workspace/app');
    expect(agentRegistry.linkSession).toHaveBeenCalledWith('registry-1', 'thread-1234', null, {
      runtimeSessionId: 'thread-1234',
      resumeSessionId: null,
    });
    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        registryId: 'registry-1',
        sessionId: 'thread-1234',
        projectPath: '/workspace/app',
        displayName: 'Desktop Agent',
        role: 'Implementer',
        avatarIndex: 3,
        isRegistered: true,
        provider: 'codex',
        state: 'Waiting',
        model: 'gpt-5-codex',
      }),
      'codex'
    );
  });

  test('thread.started does not steal a character that is already bound to another session', () => {
    agentRegistry.findByProjectPath.mockReturnValue({
      id: 'registry-1',
      name: 'Desktop Agent',
      role: 'Implementer',
      avatarIndex: 3,
      currentSessionId: 'thread-old',
    });

    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    expect(agentRegistry.linkSession).not.toHaveBeenCalled();
    expect(agentManager.getAgent('thread-1234')).toEqual(expect.objectContaining({
      sessionId: 'thread-1234',
      projectPath: '/workspace/app',
      displayName: 'app',
      state: 'Waiting',
      provider: 'codex',
    }));
  });

  test('late registry creation reattaches an active desktop session by project path', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    const attachedSessionId = processor.attachRegisteredAgent({
      id: 'registry-1',
      name: 'Desktop Agent',
      role: 'Implementer',
      projectPath: '/workspace/app',
      avatarIndex: 3,
      provider: 'codex',
    });

    expect(attachedSessionId).toBe('thread-1234');
    expect(agentRegistry.linkSession).toHaveBeenCalledWith('registry-1', 'thread-1234', null, {
      runtimeSessionId: 'thread-1234',
      resumeSessionId: null,
    });
    expect(agentManager.removeAgent).toHaveBeenCalledWith('thread-1234');
    expect(agentManager.getAgent('registry-1')).toEqual(expect.objectContaining({
      registryId: 'registry-1',
      sessionId: 'thread-1234',
      displayName: 'Desktop Agent',
      projectPath: '/workspace/app',
      isRegistered: true,
    }));

    processor.processCodexEvent({
      type: 'turn.started',
      thread_id: 'thread-1234',
    });

    expect(agentManager.getAgent('registry-1')).toEqual(expect.objectContaining({
      state: 'Thinking',
    }));
    expect(agentManager.getAgent('thread-1234')).toBeNull();
  });

  test('late registry creation skips characters that are already bound', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    const attachedSessionId = processor.attachRegisteredAgent({
      id: 'registry-1',
      name: 'Desktop Agent',
      role: 'Implementer',
      projectPath: '/workspace/app',
      avatarIndex: 3,
      provider: 'codex',
      currentSessionId: 'thread-old',
    });

    expect(attachedSessionId).toBeNull();
    expect(agentRegistry.linkSession).not.toHaveBeenCalled();
    expect(agentManager.getAgent('thread-1234')).toEqual(expect.objectContaining({
      sessionId: 'thread-1234',
      displayName: 'app',
    }));
  });

  test('reactivated unbound session auto-creates a new character using cached workspace path', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    processor.endSession('thread-1234');

    expect(agentManager.getAgent('thread-1234')).toBeNull();

    processor.processCodexEvent({
      type: 'turn.started',
      thread_id: 'thread-1234',
    });

    expect(agentManager.getAgent('thread-1234')).toEqual(expect.objectContaining({
      sessionId: 'thread-1234',
      projectPath: '/workspace/app',
      displayName: 'app',
      state: 'Thinking',
      provider: 'codex',
    }));
  });

  test('session JSONL entries reconstruct state for codex desktop or cli sessions', () => {
    processor.processSessionEntry({
      type: 'session_meta',
      payload: {
        id: 'thread-1234',
        workspacePath: '/workspace/app',
        model_slug: 'gpt-5-codex',
      },
    });

    processor.processSessionEntry({
      type: 'event_msg',
      payload: { type: 'task_started' },
    }, { sessionId: 'thread-1234' });

    processor.processSessionEntry({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call-1',
        name: 'exec_command',
        arguments: '{"cmd":"npm test"}',
      },
    }, { sessionId: 'thread-1234' });

    processor.processSessionEntry({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call-1',
      },
    }, { sessionId: 'thread-1234' });

    processor.processSessionEntry({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 5 },
        },
      },
    }, { sessionId: 'thread-1234' });

    processor.processSessionEntry({
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        last_agent_message: 'done',
      },
    }, { sessionId: 'thread-1234' });

    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'thread-1234',
        provider: 'codex',
        state: 'Waiting',
      }),
      'codex'
    );
    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'Working',
        currentTool: 'exec_command',
      }),
      'codex'
    );
    expect(agentManager.updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'Done',
        lastMessage: 'done',
        tokenUsage: expect.objectContaining({
          inputTokens: 60,
          outputTokens: 5,
        }),
      }),
      'codex'
    );
  });

  test('transcript canonical id rekeys a live codex thread id', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    const metaResult = processor.processSessionEntry({
      type: 'session_meta',
      payload: {
        id: 'session-9999',
        workspacePath: '/workspace/app',
        model_slug: 'gpt-5-codex',
      },
    }, { transcriptPath: '/tmp/codex.jsonl' });

    processor.processSessionEntry({
      type: 'event_msg',
      payload: {
        type: 'task_started',
        thread_id: 'thread-1234',
      },
    }, { sessionId: metaResult.sessionId, transcriptPath: '/tmp/codex.jsonl' });

    expect(agentManager.rekeyAgent).toHaveBeenCalledWith('thread-1234', 'session-9999', {
      sessionId: 'session-9999',
      runtimeSessionId: 'thread-1234',
      resumeSessionId: 'session-9999',
    });
    expect(agentManager.getAgent('thread-1234')).toBeNull();
    expect(agentManager.getAgent('session-9999')).toEqual(expect.objectContaining({
      id: 'session-9999',
      sessionId: 'session-9999',
      runtimeSessionId: 'thread-1234',
      resumeSessionId: 'session-9999',
      projectPath: '/workspace/app',
    }));
  });

  test('registered codex agents rekey their saved session history to the canonical id', () => {
    processor.processCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      cwd: '/workspace/app',
      model: 'gpt-5-codex',
    });

    const attachedSessionId = processor.attachRegisteredAgent({
      id: 'registry-1',
      name: 'Desktop Agent',
      role: 'Implementer',
      projectPath: '/workspace/app',
      avatarIndex: 3,
      provider: 'codex',
    });

    expect(attachedSessionId).toBe('thread-1234');

    const metaResult = processor.processSessionEntry({
      type: 'session_meta',
      payload: {
        id: 'session-9999',
        workspacePath: '/workspace/app',
      },
    }, { transcriptPath: '/tmp/codex.jsonl' });

    processor.processSessionEntry({
      type: 'event_msg',
      payload: {
        type: 'task_started',
        thread_id: 'thread-1234',
      },
    }, { sessionId: metaResult.sessionId, transcriptPath: '/tmp/codex.jsonl' });

    expect(agentRegistry.replaceSessionId).toHaveBeenCalledWith(
      'registry-1',
      'thread-1234',
      'session-9999',
      '/tmp/codex.jsonl',
      {
        runtimeSessionId: 'thread-1234',
        resumeSessionId: 'session-9999',
      }
    );
    expect(agentManager.getAgent('registry-1')).toEqual(expect.objectContaining({
      sessionId: 'session-9999',
      runtimeSessionId: 'thread-1234',
      resumeSessionId: 'session-9999',
      isRegistered: true,
    }));
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

  test('uses workspacePath when cwd is not present', () => {
    expect(normalizeCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1234',
      workspacePath: '/workspace/app',
    })).toEqual([
      expect.objectContaining({
        sessionId: 'thread-1234',
        cwd: '/workspace/app',
      })
    ]);
  });
});
