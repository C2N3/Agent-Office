const {
  loadDashboardRemoteAuthModule,
  loadDashboardServerModule,
} = require('../src/main/dashboardRuntimeLoader');
const { loadMainTunnelManager } = require('../src/dashboardServer/tunnelManagerLookup');

describe('dashboard runtime loaders', () => {
  test('loads dashboard server through native ESM import', async () => {
    const serverModule = await loadDashboardServerModule();

    expect(typeof serverModule.startServer).toBe('function');
    expect(typeof serverModule.setAgentManager).toBe('function');
  });

  test('loads remote auth through native ESM import', async () => {
    const remoteAuthModule = await loadDashboardRemoteAuthModule();

    expect(typeof remoteAuthModule.loadOrCreateToken).toBe('function');
  });

  test('loads the main tunnel manager singleton directly', () => {
    const tunnelManager = loadMainTunnelManager();

    expect(typeof tunnelManager.getStatus).toBe('function');
    expect(typeof tunnelManager.start).toBe('function');
    expect(typeof tunnelManager.stop).toBe('function');
  });
});
