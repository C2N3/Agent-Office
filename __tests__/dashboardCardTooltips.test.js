describe('dashboard character card tooltips', () => {
  beforeEach(() => {
    jest.resetModules();
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.document = {
      getElementById: jest.fn(() => null),
    };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.document;
  });

  test('renders action buttons with app tooltip text and accessible labels', () => {
    const { buildAgentCardHtml } = require('../src/client/dashboard/agentCard/markup.ts');

    const html = buildAgentCardHtml({
      id: 'agent-1',
      registryId: 'registry-1',
      name: 'Agent',
      displayName: 'Agent',
      status: 'waiting',
      project: 'app',
      isRegistered: true,
      metadata: {
        workspace: {
          type: 'git-worktree',
          branch: 'codex/test',
          repositoryName: 'app',
        },
      },
    });

    expect(html).toContain('data-tooltip="Session History"');
    expect(html).toContain('aria-label="Session History"');
    expect(html).toContain('data-tooltip="Assign Task"');
    expect(html).toContain('aria-label="Assign Task"');
    expect(html).toContain('data-tooltip="Form Team"');
    expect(html).toContain('aria-label="Form Team"');
    expect(html).toContain('data-tooltip="Merge branch and clean up workspace"');
    expect(html).toContain('data-tooltip="Remove workspace and delete branch without merge"');
    expect(html).not.toContain('title="Assign Task"');
    expect(html).not.toContain('title="Form Team"');
  });
});
