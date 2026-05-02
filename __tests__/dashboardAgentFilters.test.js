describe('dashboard agent filters', () => {
  function loadFiltersWithFloorManager(floorManager) {
    jest.resetModules();
    jest.doMock('../src/client/office/floorManager.ts', () => ({ floorManager }));

    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.document = {
      getElementById: jest.fn(() => null),
    };

    return require('../src/client/dashboard/agentFilters.ts');
  }

  afterEach(() => {
    jest.dontMock('../src/client/office/floorManager.ts');
    delete global.localStorage;
    delete global.document;
  });

  test('assigns a new hidden agent to the current floor before registered-only filtering', () => {
    const floorManager = {
      getAgentFloor: jest.fn(() => null),
      getCurrentFloor: jest.fn(() => ({ id: 'floor-2', name: '2F' })),
      assignAgent: jest.fn(),
      isAgentOnCurrentFloor: jest.fn(() => true),
    };
    const { shouldDisplayAgent } = loadFiltersWithFloorManager(floorManager);

    expect(shouldDisplayAgent({ id: 'agent-1', isRegistered: false })).toBe(false);
    expect(floorManager.assignAgent).toHaveBeenCalledWith('agent-1', 'floor-2');
    expect(floorManager.isAgentOnCurrentFloor).not.toHaveBeenCalled();
  });

  test('does not move an agent that is already assigned to a floor', () => {
    const existingFloor = { id: 'floor-1', name: '1F' };
    const floorManager = {
      getAgentFloor: jest.fn(() => existingFloor),
      getCurrentFloor: jest.fn(() => ({ id: 'floor-2', name: '2F' })),
      assignAgent: jest.fn(),
      isAgentOnCurrentFloor: jest.fn(() => true),
    };
    const { shouldDisplayAgent } = loadFiltersWithFloorManager(floorManager);

    expect(shouldDisplayAgent({ id: 'agent-1', isRegistered: true })).toBe(true);
    expect(floorManager.assignAgent).not.toHaveBeenCalled();
    expect(floorManager.isAgentOnCurrentFloor).toHaveBeenCalledWith('agent-1');
  });
});
