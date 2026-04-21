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
    global.document = {
      getElementById: jest.fn(() => null),
    };
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
  });

  afterEach(() => {
    delete global.document;
    delete global.dashboardAPI;
    delete global.localStorage;
    try {
      const { state } = require('../src/client/dashboard/shared.ts');
      state.agents.clear();
      state.agentHistory.clear();
      state.focusedAgentId = null;
    } catch {}
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

  test('renameAgentNickname persists nickname edits and updates dashboard state', async () => {
    global.dashboardAPI = {
      removeNickname: jest.fn(async () => ({ success: true })),
      setNickname: jest.fn(async () => ({ success: true, nickname: 'Ace' })),
    };

    const { state } = require('../src/client/dashboard/shared.ts');
    const { subscribeDashboardStore } = require('../src/client/dashboard/state/store.ts');
    const { renameAgentNickname } = require('../src/client/dashboard/agentActions.ts');
    const listener = jest.fn();
    const unsubscribe = subscribeDashboardStore(listener);

    state.agents.set('agent-1', { id: 'agent-1', name: 'Agent One', nickname: null });

    await expect(renameAgentNickname('agent-1', '  Ace  ')).resolves.toBe(true);

    expect(global.dashboardAPI.setNickname).toHaveBeenCalledWith('agent-1', 'Ace');
    expect(state.agents.get('agent-1').nickname).toBe('Ace');
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    await expect(renameAgentNickname('agent-1', '')).resolves.toBe(true);

    expect(global.dashboardAPI.removeNickname).toHaveBeenCalledWith('agent-1');
    expect(state.agents.get('agent-1').nickname).toBeNull();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  test('assign task payload preserves agent workspace defaults', () => {
    const { createAssignTaskPayload } = require('../src/client/dashboard/react/assignTaskModal/index.tsx');

    const payload = createAssignTaskPayload(
      {
        id: 'agent-1',
        registryId: 'registry-1',
        name: 'Builder',
        status: 'waiting',
        metadata: {
          workspace: {
            repositoryPath: '/repo/app',
            worktreePath: '/worktree/app',
          },
          provider: 'codex',
        },
      },
      {
        prompt: '  Fix the failing dashboard test  ',
        provider: 'codex',
        model: '',
        maxTurns: '42',
        priority: 'high',
        executionEnvironment: 'native',
        autoMergeOnSuccess: true,
      },
    );

    expect(payload).toMatchObject({
      title: 'Builder: Fix the failing dashboard test',
      prompt: 'Fix the failing dashboard test',
      provider: 'codex',
      executionEnvironment: 'native',
      model: null,
      maxTurns: 42,
      repositoryPath: '/repo/app',
      priority: 'high',
      autoMergeOnSuccess: true,
      agentRegistryId: 'registry-1',
    });
  });
});
