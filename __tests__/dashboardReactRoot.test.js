let React;
let renderToStaticMarkup;

function createLocalStorage() {
  return {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
  };
}

describe('dashboard react-owned surfaces', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    renderToStaticMarkup = require('react-dom/server').renderToStaticMarkup;
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
    delete global.requestAnimationFrame;
  });

  test('setDashboardView normalizes and persists the current view', () => {
    const {
      getDashboardSnapshot,
      setDashboardView,
      setPsPolicyBlocked,
      setTerminalProfileMenuOpen,
    } = require('../src/client/dashboard/state/store.ts');

    setDashboardView('REMOTE');
    setPsPolicyBlocked(true);
    setTerminalProfileMenuOpen(true);

    expect(global.localStorage.setItem).toHaveBeenCalledWith('mc-view', 'remote');
    expect(getDashboardSnapshot().currentView).toBe('remote');
    expect(getDashboardSnapshot().psPolicyBlocked).toBe(true);
    expect(getDashboardSnapshot().terminalProfileMenuOpen).toBe(true);
  });

  test('dashboard snapshots keep a stable reference until the store changes', () => {
    const {
      getDashboardSnapshot,
      setDashboardView,
    } = require('../src/client/dashboard/state/store.ts');

    const firstSnapshot = getDashboardSnapshot();
    expect(getDashboardSnapshot()).toBe(firstSnapshot);

    setDashboardView('remote');
    const changedSnapshot = getDashboardSnapshot();
    expect(changedSnapshot).not.toBe(firstSnapshot);
    expect(getDashboardSnapshot()).toBe(changedSnapshot);
  });

  test('AgentCard renders callback-owned actions and timeline data', () => {
    const { AgentCard } = require('../src/client/dashboard/agentCard/view.tsx');

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
        onChangeAvatar: jest.fn(),
        onDelete: jest.fn(),
        onFocus: jest.fn(),
        onRename: jest.fn(),
        onTerminate: jest.fn(),
        onUnregister: jest.fn(),
      }),
    );

    expect(markup).toContain('agent-avatar-btn');
    expect(markup).toContain('Double-click to rename');
    expect(markup).toContain('agent-terminate-btn');
    expect(markup).toContain('mc-timeline');
    expect(markup).toContain('Builder');
    expect(markup).not.toContain('agent-assign-task-btn');
    expect(markup).not.toContain('agent-form-team-btn');
    expect(markup).not.toContain('agent-workspace-btn');
  });

  test('AgentCard disables rename affordance for non-owned central agents', () => {
    const { AgentCard } = require('../src/client/dashboard/agentCard/view.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(AgentCard, {
        agent: {
          id: 'central-1',
          name: 'Remote Agent',
          status: 'offline',
          isRegistered: true,
          metadata: {
            canRename: false,
            source: 'central',
          },
        },
        focused: false,
        history: [],
        onChangeAvatar: jest.fn(),
        onDelete: jest.fn(),
        onFocus: jest.fn(),
        onRename: jest.fn(),
        onTerminate: jest.fn(),
        onUnregister: jest.fn(),
      }),
    );

    expect(markup).toContain('Remote Agent');
    expect(markup).not.toContain('Double-click to rename');
    expect(markup).not.toContain('nickname-input');
  });

  test('TerminalTabs renders the active tab chrome in React', () => {
    const { TerminalTabs } = require('../src/client/dashboard/terminal/chrome.tsx');

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

  test('PowerShellPolicyBanner renders the terminal policy actions in React', () => {
    const { PowerShellPolicyBanner } = require('../src/client/dashboard/terminal/chrome.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(PowerShellPolicyBanner, {
        visible: true,
        onDismiss: jest.fn(),
        onFix: jest.fn(),
      }),
    );

    expect(markup).toContain('ps-policy-banner');
    expect(markup).toContain('설정 열기');
    expect(markup).toContain('닫기');
  });

  test('TerminalProfileMenu renders profile selection from typed state', () => {
    const { TerminalProfileMenu } = require('../src/client/dashboard/terminal/chrome.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(TerminalProfileMenu, {
        defaultProfileId: 'pwsh',
        onClose: jest.fn(),
        onOpenProfile: jest.fn(),
        onSetDefaultProfile: jest.fn(),
        open: true,
        profiles: [
          { id: 'pwsh', title: 'PowerShell' },
          { id: 'bash', title: 'bash' },
        ],
      }),
    );

    expect(markup).toContain('terminal-launch-popover');
    expect(markup).toContain('Open default terminal');
    expect(markup).toContain('PowerShell');
    expect(markup).toContain('terminal-profile-badge');
    expect(markup).toContain('Use when pressing the New Terminal button');
  });

  test('terminal panel collapse state toggles without binding the rendered button', () => {
    global.localStorage.getItem.mockReturnValue('true');
    global.requestAnimationFrame = jest.fn((callback) => {
      callback();
      return 1;
    });
    const {
      getTerminalPanelCollapsed,
      initTerminalPanelCollapse,
      subscribeTerminalPanelCollapse,
      toggleTerminalPanelCollapsed,
    } = require('../src/client/dashboard/terminal/collapse.ts');
    const listener = jest.fn();
    const fitActiveTerminal = jest.fn();

    const unsubscribe = subscribeTerminalPanelCollapse(listener);
    initTerminalPanelCollapse(fitActiveTerminal);
    expect(getTerminalPanelCollapsed()).toBe(true);
    expect(global.document.getElementById).not.toHaveBeenCalledWith('terminalCollapseBtn');

    toggleTerminalPanelCollapsed(fitActiveTerminal);
    expect(getTerminalPanelCollapsed()).toBe(false);
    expect(global.localStorage.setItem).toHaveBeenCalledWith('mc-terminal-panel-collapsed', 'false');
    expect(global.requestAnimationFrame).toHaveBeenCalled();
    expect(fitActiveTerminal).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  test('TerminalPanel renders the standalone terminal chrome', () => {
    const { TerminalPanel } = require('../src/client/dashboard/root/terminalPanel.tsx');

    const markup = renderToStaticMarkup(
      React.createElement(TerminalPanel, {
        activeTerminalId: null,
        terminalDefaultProfileId: null,
        terminalProfileMenuOpen: false,
        terminalProfiles: [],
        terminals: [],
      }),
    );

    expect(markup).toContain('class="terminal-view-panel panel"');
    expect(markup).toContain('id="terminalNewBtn"');
    expect(markup).toContain('No terminal open');
    expect(markup).not.toContain('id="terminalCollapseBtn"');
  });

  test('DashboardModals keeps inactive modals unmounted by default', () => {
    const { DashboardModals } = require('../src/client/dashboard/react/modals.tsx');

    const markup = renderToStaticMarkup(React.createElement(DashboardModals));

    expect(markup).not.toContain('id="createAgentModal"');
    expect(markup).not.toContain('id="assignTaskModal"');
    expect(markup).not.toContain('id="taskReportModal"');
    expect(markup).not.toContain('id="teamReportModal"');
    expect(markup).not.toContain('conv-overlay');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });

  test('CreateAgentFormFields renders provider options from typed provider data', () => {
    const { CreateAgentFormFields } = require('../src/client/dashboard/react/createAgentModal/fields.tsx');
    const { buildDefaultCreateAgentFormState } = require('../src/client/dashboard/react/createAgentModal/state.ts');

    const noop = jest.fn();
    const markup = renderToStaticMarkup(React.createElement(CreateAgentFormFields, {
      baseBranchOptions: [],
      error: '',
      formState: buildDefaultCreateAgentFormState(),
      inspectStatus: 'Worktree options are available when the effective strategy is managed git worktree.',
      nameInputRef: { current: null },
      previewStatus: 'Enter a workspace path to inspect how it will be registered.',
      submitting: false,
      worktreeEnabled: false,
      onBaseBranchChange: noop,
      onBranchChange: noop,
      onBranchFocus: noop,
      onBrowseWorkspaceParent: noop,
      onBrowseWorkspacePath: noop,
      onCancel: noop,
      onChange: noop,
      onProviderChange: noop,
      onStartPointChange: noop,
      onSubmit: noop,
      onSymlinkPathsChange: noop,
    }));

    expect(markup).toContain('Claude');
    expect(markup).toContain('Codex');
    expect(markup).toContain('Gemini');
    expect(markup).toContain('provider-btn active');
    expect(markup).not.toContain('data-provider=');
  });

});
