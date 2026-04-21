jest.mock('../../agentViews.ts', () => ({
  clearUnregisteredAgents: jest.fn(),
  connectSSE: jest.fn(),
  removeAgent: jest.fn(),
  renderAgentList: jest.fn(),
  updateAgent: jest.fn(),
  updateAgentUI: jest.fn(),
}));

jest.mock('../../activityViews.ts', () => ({
  renderArchiveView: jest.fn(),
}));

jest.mock('../../office.ts', () => ({
  setupOfficeInteractionRuntime: jest.fn(),
}));

jest.mock('../../terminal/index.ts', () => ({
  fitActiveTerminal: jest.fn(),
  initResizableHandles: jest.fn(),
  initTerminalProfileMenu: jest.fn(),
  initTerminals: jest.fn(),
  openTerminalForAgent: jest.fn(),
  refreshTerminalProfiles: jest.fn(() => Promise.resolve()),
  resumeRegisteredSession: jest.fn(),
}));

jest.mock('../../../office/index.ts', () => ({
  officeOnAgentCreated: jest.fn(),
  officeOnAgentRemoved: jest.fn(),
  officeOnAgentUpdated: jest.fn(),
  setupOfficeRuntime: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../centralAgents/index.ts', () => ({
  startCentralAgentSync: jest.fn(),
}));

jest.mock('../../app/windowControls.ts', () => ({
  initOverlayControls: jest.fn(),
  initPipControls: jest.fn(),
}));

jest.mock('../../../../shared/uiTooltip.ts', () => ({
  installHoverTooltips: jest.fn(),
}));

describe('dashboard runtime bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.document = {
      getElementById: jest.fn(() => null),
    };
    global.window = {
      addEventListener: jest.fn(),
    };
    global.setTimeout = jest.fn((callback) => {
      callback();
      return 0;
    });
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.document;
    delete global.window;
    delete global.setTimeout;
    delete global.openTerminalForAgent;
  });

  test('installs runtime globals and passes the terminal opener through setup', async () => {
    const { initDashboardRuntime } = require('../bootstrap.ts');
    const { setupOfficeInteractionRuntime } = require('../../office.ts');
    const { setupOfficeRuntime } = require('../../../office/index.ts');
    const { openTerminalForAgent, initTerminals, initTerminalProfileMenu, refreshTerminalProfiles } = require('../../terminal/index.ts');
    const { initPipControls, initOverlayControls } = require('../../app/windowControls.ts');
    const { installHoverTooltips } = require('../../../../shared/uiTooltip.ts');

    await initDashboardRuntime();

    expect(global.openTerminalForAgent).toBe(openTerminalForAgent);
    expect(setupOfficeInteractionRuntime).toHaveBeenCalledWith({ openTerminalForAgent });
    expect(setupOfficeRuntime).toHaveBeenCalled();
    expect(initPipControls).toHaveBeenCalled();
    expect(initOverlayControls).toHaveBeenCalled();
    expect(initTerminals).toHaveBeenCalled();
    expect(initTerminalProfileMenu).toHaveBeenCalled();
    expect(refreshTerminalProfiles).toHaveBeenCalled();
    expect(installHoverTooltips).toHaveBeenCalledWith({
      selector: '.mc-agent-card [data-tooltip], .mc-agent-card button[title]',
    });
    expect(global.window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  test('does not bind events to React-owned archive controls during runtime bootstrap', async () => {
    const archiveRefreshBtn = { addEventListener: jest.fn() };
    const bulkArchiveBtn = { addEventListener: jest.fn() };
    const archiveGrid = { addEventListener: jest.fn() };
    global.document.getElementById = jest.fn((id) => ({
      archiveRefreshBtn,
      bulkArchiveBtn,
      archiveGrid,
    })[id] || null);

    const { initDashboardRuntime } = require('../bootstrap.ts');
    await initDashboardRuntime();

    expect(archiveRefreshBtn.addEventListener).not.toHaveBeenCalled();
    expect(bulkArchiveBtn.addEventListener).not.toHaveBeenCalled();
    expect(archiveGrid.addEventListener).not.toHaveBeenCalled();
  });
});
