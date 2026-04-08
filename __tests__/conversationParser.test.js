/**
 * conversationParser.js Tests
 * Claude and Codex transcript/session JSONL parsing
 */

const fs = require('fs');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

const { getConversationSummary, parseConversation } = require('../src/main/conversationParser');

function buildJsonl(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

describe('conversationParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses Claude transcripts without changing existing behavior', () => {
    fs.readFileSync.mockReturnValue(buildJsonl([
      { type: 'user', timestamp: '2026-03-07T10:00:00Z', message: { content: 'hello' } },
      {
        type: 'assistant',
        timestamp: '2026-03-07T10:00:05Z',
        message: {
          model: 'claude-sonnet-4-6',
          content: [
            { type: 'text', text: 'hi there' },
            { type: 'tool_use', name: 'Read', id: 'tool-1' },
          ],
          usage: { input_tokens: 10, output_tokens: 2 },
        },
      },
      { type: 'system', timestamp: '2026-03-07T10:00:10Z', subtype: 'SessionEnd', sessionId: 'sess-1' },
    ]));

    const result = parseConversation('/tmp/claude.jsonl');

    expect(result.sessionId).toBe('sess-1');
    expect(result.totalCount).toBe(3);
    expect(result.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: 'hi there',
        toolUses: [{ name: 'Read', id: 'tool-1' }],
        tokens: { input: 10, output: 2, cacheRead: 0, cacheCreate: 0 },
      }),
      expect.objectContaining({ role: 'system', content: 'SessionEnd', sessionId: 'sess-1' }),
    ]);
  });

  test('parses Codex session JSONL into conversation messages', () => {
    fs.readFileSync.mockReturnValue(buildJsonl([
      { type: 'session_meta', timestamp: '2026-03-07T10:00:00Z', payload: { id: 'thread-123', workspacePath: '/workspace/app' } },
      { type: 'event_msg', timestamp: '2026-03-07T10:00:01Z', payload: { type: 'task_started', thread_id: 'thread-123', message: 'run tests' } },
      {
        type: 'response_item',
        timestamp: '2026-03-07T10:00:02Z',
        payload: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'exec_command',
          arguments: '{"cmd":"npm test"}',
          thread_id: 'thread-123',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-03-07T10:00:03Z',
        payload: {
          type: 'message',
          thread_id: 'thread-123',
          content: [{ type: 'output_text', text: 'build complete' }],
        },
      },
      { type: 'event_msg', timestamp: '2026-03-07T10:00:04Z', payload: { type: 'agent_message', thread_id: 'thread-123', message: 'final answer' } },
      { type: 'event_msg', timestamp: '2026-03-07T10:00:05Z', payload: { type: 'task_complete', thread_id: 'thread-123', last_agent_message: 'final answer' } },
    ]));

    const result = parseConversation('/tmp/codex.jsonl');

    expect(result.sessionId).toBe('thread-123');
    expect(result.totalCount).toBe(5);
    expect(result.messages).toEqual([
      expect.objectContaining({ role: 'system', content: 'Thread started', sessionId: 'thread-123' }),
      expect.objectContaining({ role: 'user', content: 'run tests', sessionId: 'thread-123' }),
      expect.objectContaining({
        role: 'assistant',
        content: '',
        toolUses: [{ name: 'exec_command', id: 'call-1' }],
        sessionId: 'thread-123',
      }),
      expect.objectContaining({ role: 'assistant', content: 'build complete', sessionId: 'thread-123' }),
      expect.objectContaining({ role: 'assistant', content: 'final answer', sessionId: 'thread-123' }),
    ]);
  });

  test('summarizes Codex sessions using parsed conversation messages', () => {
    fs.readFileSync.mockReturnValue(buildJsonl([
      { type: 'session_meta', timestamp: '2026-03-07T10:00:00Z', payload: { id: 'thread-123' } },
      { type: 'event_msg', timestamp: '2026-03-07T10:00:02Z', payload: { type: 'agent_message', thread_id: 'thread-123', message: 'done' } },
    ]));

    expect(getConversationSummary('/tmp/codex.jsonl')).toEqual({
      messageCount: 1,
      firstAt: '2026-03-07T10:00:02Z',
      lastAt: '2026-03-07T10:00:02Z',
    });
  });
});
