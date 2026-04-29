function makeJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('taskChat model', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('fetchAgentInfo finds active registered agents by registryId', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/agents') {
        return makeJsonResponse([
          {
            id: 'session-1',
            registryId: 'registry-1',
            provider: 'codex',
            metadata: {
              projectPath: '/repo',
            },
          },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { fetchAgentInfo } = require('../src/client/taskChat/model.ts');

    await expect(fetchAgentInfo('registry-1')).resolves.toEqual(expect.objectContaining({
      id: 'session-1',
      registryId: 'registry-1',
      provider: 'codex',
    }));
  });

  test('submitAgentTask keeps the matched agent provider and repository path', async () => {
    global.fetch = jest.fn(async () => makeJsonResponse({ id: 'task-1' }));

    const { submitAgentTask } = require('../src/client/taskChat/model.ts');

    await expect(submitAgentTask({
      agentInfo: {
        id: 'session-1',
        registryId: 'registry-1',
        provider: 'codex',
        metadata: {
          projectPath: '/repo',
        },
      },
      agentName: 'Codex Agent',
      agentRegistryId: 'registry-1',
      prompt: 'run tests',
    })).resolves.toEqual({ taskId: 'task-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({
      agentRegistryId: 'registry-1',
      provider: 'codex',
      repositoryPath: '/repo',
      prompt: 'run tests',
    }));
  });
});
