function createElement(overrides = {}) {
  return {
    addEventListener: jest.fn(),
    classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
    dataset: {},
    innerHTML: '',
    style: {},
    textContent: '',
    value: '',
    checked: false,
    focus: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
}

function installModalDocument() {
  const elements = {
    assignTaskModal: createElement(),
    assignTaskForm: createElement(),
    cancelAssignTaskBtn: createElement(),
    assignTaskError: createElement(),
    assignTaskAgentName: createElement(),
    taskModelInput: createElement(),
    taskPromptInput: createElement(),
    taskMaxTurnsInput: createElement({ value: '30' }),
    taskPriorityInput: createElement({ value: 'normal' }),
    taskAutoMergeInput: createElement({ checked: false }),
  };

  const providerInputs = [
    createElement({ value: 'claude', checked: true }),
    createElement({ value: 'codex', checked: false }),
  ];
  const executionEnvironmentInputs = [
    createElement({ value: 'native', checked: true }),
    createElement({ value: 'sandbox', checked: false }),
  ];

  global.document = {
    getElementById: jest.fn((id) => elements[id] || null),
    querySelectorAll: jest.fn((selector) => {
      if (selector === 'input[name="taskProvider"]') return providerInputs;
      if (selector === 'input[name="taskExecutionEnvironment"]') return executionEnvironmentInputs;
      return [];
    }),
    addEventListener: jest.fn(),
  };

  return { elements, providerInputs, executionEnvironmentInputs };
}

function resetDashboardModalRegistry() {
  const { dashboardModalRegistry } = require('../src/client/dashboard/modals/registry.ts');
  for (const key of Object.keys(dashboardModalRegistry)) {
    delete dashboardModalRegistry[key];
  }
  return dashboardModalRegistry;
}

describe('dashboard modal registry', () => {
  beforeEach(() => {
    jest.resetModules();
    installModalDocument();
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
  });

  afterEach(() => {
    delete global.document;
    delete global.localStorage;
    try {
      const { state } = require('../src/client/dashboard/shared.ts');
      state.agents.clear();
      state.agentHistory.clear();
      state.focusedAgentId = null;
    } catch {}
  });

  test('setupAssignTaskModal registers an open handler', () => {
    const dashboardModalRegistry = resetDashboardModalRegistry();
    const { setupAssignTaskModal } = require('../src/client/dashboard/modals/assignTask.ts');

    setupAssignTaskModal();

    expect(typeof dashboardModalRegistry.openAssignTaskModal).toBe('function');
  });

  test('agentActions invoke registered modal controllers', () => {
    const dashboardModalRegistry = resetDashboardModalRegistry();
    dashboardModalRegistry.openAssignTaskModal = jest.fn();
    dashboardModalRegistry.openAvatarPickerModal = jest.fn();
    dashboardModalRegistry.openSessionHistory = jest.fn();
    dashboardModalRegistry.openTeamFormationModal = jest.fn();

    const { state } = require('../src/client/dashboard/shared.ts');
    state.agents.set('agent-1', { id: 'agent-1', name: 'Agent One' });

    const {
      assignTaskToAgent,
      changeAgentAvatar,
      formTeamForAgent,
      openAgentHistory,
    } = require('../src/client/dashboard/agentActions.ts');

    assignTaskToAgent('agent-1');
    changeAgentAvatar('agent-1', 'registry-1');
    formTeamForAgent('agent-1', 'registry-1');
    openAgentHistory('history-1', 'Agent One');

    expect(dashboardModalRegistry.openAssignTaskModal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-1', name: 'Agent One' }),
    );
    expect(dashboardModalRegistry.openAvatarPickerModal).toHaveBeenCalledWith('agent-1', 'registry-1');
    expect(dashboardModalRegistry.openTeamFormationModal).toHaveBeenCalledWith('agent-1', 'registry-1');
    expect(dashboardModalRegistry.openSessionHistory).toHaveBeenCalledWith('history-1', 'Agent One');
  });
});
