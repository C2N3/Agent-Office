const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function createLocalStorage() {
  return {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
  };
}

describe('dashboard react-owned surfaces', () => {
  beforeEach(() => {
    jest.resetModules();
    global.localStorage = createLocalStorage();
    global.document = {
      getElementById: jest.fn(() => null),
    };
    global.dashboardAPI = { platform: 'win32' };
  });

  afterEach(() => {
    delete global.dashboardAPI;
    delete global.document;
    delete global.localStorage;
  });

  test('setDashboardView normalizes and persists the current view', () => {
    const { getDashboardSnapshot, setDashboardView } = require('../public/dashboard/state/store.ts');

    setDashboardView('REMOTE');

    expect(global.localStorage.setItem).toHaveBeenCalledWith('mc-view', 'remote');
    expect(getDashboardSnapshot().currentView).toBe('remote');
  });

  test('AgentCard renders callback-owned actions and timeline data', () => {
    const { AgentCard } = require('../public/dashboard/agentCard/view.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(AgentCard, {
        agent: {
          id: 'agent-1',
          registryId: 'registry-1',
          name: 'Agent',
          nickname: 'Builder',
          status: 'working',
          project: 'app',
          isRegistered: true,
          metadata: {
            workspace: {
              branch: 'codex/react-boundary',
              repositoryName: 'app',
              type: 'git-worktree',
            },
          },
        },
        focused: true,
        history: [
          { state: 'waiting', ts: 100 },
          { state: 'working', ts: 200 },
        ],
        onAssignTask: jest.fn(),
        onChangeAvatar: jest.fn(),
        onDelete: jest.fn(),
        onFocus: jest.fn(),
        onFormTeam: jest.fn(),
        onMergeWorkspace: jest.fn(),
        onOpenHistory: jest.fn(),
        onRemoveWorkspace: jest.fn(),
        onTerminate: jest.fn(),
        onUnregister: jest.fn(),
      }),
    );

    expect(markup).toContain('agent-assign-task-btn');
    expect(markup).toContain('agent-form-team-btn');
    expect(markup).toContain('agent-workspace-btn merge');
    expect(markup).toContain('mc-timeline');
    expect(markup).toContain('Builder');
  });

  test('TerminalTabs renders the active tab chrome in React', () => {
    const { TerminalTabs } = require('../public/dashboard/terminal/chrome.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(TerminalTabs, {
        activeId: 'agent-1',
        terminals: [
          ['agent-1', { exited: false, label: 'Main Agent' }],
          ['agent-2', { exited: true, label: 'Support Agent' }],
        ],
        onActivate: jest.fn(),
        onClose: jest.fn(),
      }),
    );

    expect(markup).toContain('terminal-tab active');
    expect(markup).toContain('Main Agent');
    expect(markup).toContain('Support Agent');
    expect(markup).toContain('terminal-tab-dot exited');
  });

  test('DashboardModals renders provider options from typed provider data', () => {
    const { DashboardModals } = require('../public/dashboard/react/modals.tsx');

    const markup = renderToStaticMarkup(React.createElement(DashboardModals));

    expect(markup).toContain('data-provider="claude"');
    expect(markup).toContain('data-provider="codex"');
    expect(markup).toContain('name="taskProvider"');
    expect(markup).toContain('name="taskExecutionEnvironment"');
    expect(markup).toContain('Current App');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });
});
