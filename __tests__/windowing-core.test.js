jest.mock('../src/dashboardServer/index.ts', () => ({
  setAgentManager: jest.fn(),
  setSessionScanner: jest.fn(),
  setHeatmapScanner: jest.fn(),
  setAgentRegistry: jest.fn(),
  startServer: jest.fn(() => ({ close: jest.fn() })),
}));

const dashboardServer = require('../src/dashboardServer/index.ts');
const { createWindowManagerCore } = require('../src/main/windowing/core');

function createWindowManager(overrides = {}) {
  return createWindowManagerCore({
    agentManager: { getAllAgents: jest.fn(() => []) },
    agentRegistry: {},
    sessionScanner: {},
    heatmapScanner: {},
    debugLog: jest.fn(),
    adaptAgentToDashboard: jest.fn((agent) => agent),
    errorHandler: { setMainWindow: jest.fn() },
    getWindowSizeForAgents: jest.fn(() => ({ width: 300, height: 200 })),
    ...overrides,
  });
}

describe('windowing core', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('starts the dashboard server from the emitted windowing module path', () => {
    const windowManager = createWindowManager();

    windowManager.startDashboardServer();

    expect(dashboardServer.setAgentManager).toHaveBeenCalled();
    expect(dashboardServer.setSessionScanner).toHaveBeenCalled();
    expect(dashboardServer.setHeatmapScanner).toHaveBeenCalled();
    expect(dashboardServer.setAgentRegistry).toHaveBeenCalled();
    expect(dashboardServer.startServer).toHaveBeenCalledTimes(1);
  });
});
