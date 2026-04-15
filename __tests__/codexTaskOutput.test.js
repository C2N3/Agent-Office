const { CodexAdapter } = require('../src/main/orchestrator/adapters/codexAdapter');
const { OutputParser } = require('../src/main/orchestrator/outputParser');

describe('Codex task output', () => {
  test('runs Codex exec in JSON mode for structured task chat output', () => {
    const adapter = new CodexAdapter();
    const config = adapter.buildSpawnConfig({
      cwd: '/workspace/app',
      prompt: 'summarize',
      model: 'gpt-5-codex',
      maxTurns: 30,
    });

    expect(config.args).toEqual(expect.arrayContaining(['exec', '--json', '--full-auto']));
    expect(config.outputFormat).toBe('codex-json');
  });

  test('emits only assistant messages from Codex JSON task output', () => {
    const parser = new OutputParser(new CodexAdapter(), 'codex-json');
    const events = parser.feedStdout([
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'exec_command',
          arguments: '{"cmd":"npm test"}',
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'I changed the parser.',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-1',
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'task_complete',
          last_agent_message: 'I changed the parser.',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          content: [{ type: 'output_text', text: 'Follow-up note.' }],
        },
      }),
    ].join('\n') + '\n');

    expect(events).toEqual([
      { type: 'text', message: 'I changed the parser.', merge: false },
      { type: 'text', message: 'Follow-up note.', merge: false },
    ]);
    expect(parser.getFullOutput()).toBe('I changed the parser.\nFollow-up note.\n');
  });
});
