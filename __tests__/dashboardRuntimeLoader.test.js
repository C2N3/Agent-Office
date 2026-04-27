const {
  loadDashboardRemoteAuthModule,
  loadDashboardServerModule,
} = require('../src/main/dashboardRuntimeLoader');
const { loadMainTunnelManager } = require('../src/dashboardServer/tunnelManagerLookup');

function moduleNotFound(specifier) {
  const error = new Error(`Cannot find module '${specifier}'`);
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

function createPackageRequire(modulesBySpecifier) {
  return jest.fn((specifier) => {
    if (specifier in modulesBySpecifier) {
      const value = modulesBySpecifier[specifier];
      if (value instanceof Error) throw value;
      return value;
    }
    throw moduleNotFound(specifier);
  });
}

describe('dashboard runtime loaders', () => {
  test('loads dashboard server from the emitted runtime path', () => {
    const serverModule = { startServer: jest.fn() };
    const packageRequire = createPackageRequire({
      '../../dashboardServer/index.js': serverModule,
    });

    expect(loadDashboardServerModule(packageRequire)).toBe(serverModule);
    expect(packageRequire).toHaveBeenCalledWith('../../dashboardServer/index.js');
  });

  test('falls back to source dashboard server path for Jest/source runtime', () => {
    const serverModule = { startServer: jest.fn() };
    const packageRequire = createPackageRequire({
      '../../dashboardServer/index.ts': serverModule,
    });

    expect(loadDashboardServerModule(packageRequire)).toBe(serverModule);
    expect(packageRequire).toHaveBeenNthCalledWith(1, '../../dashboardServer/index.js');
    expect(packageRequire).toHaveBeenNthCalledWith(2, '../../dashboardServer/index.ts');
  });

  test('does not hide nested dashboard server module failures', () => {
    const nestedFailure = moduleNotFound('nested-package');
    const packageRequire = createPackageRequire({
      '../../dashboardServer/index.js': nestedFailure,
      '../../dashboardServer/index.ts': { startServer: jest.fn() },
    });

    expect(() => loadDashboardServerModule(packageRequire)).toThrow(nestedFailure);
    expect(packageRequire).toHaveBeenCalledTimes(1);
  });

  test('loads remote auth from the emitted runtime path', () => {
    const remoteAuthModule = { loadOrCreateToken: jest.fn(() => 'token') };
    const packageRequire = createPackageRequire({
      '../../dashboardServer/remoteAuth.js': remoteAuthModule,
    });

    expect(loadDashboardRemoteAuthModule(packageRequire)).toBe(remoteAuthModule);
  });

  test('falls back to source tunnel manager path for Jest/source runtime', () => {
    const tunnelManager = { getStatus: jest.fn() };
    const packageRequire = createPackageRequire({
      '../main/tunnelManager.ts': { tunnelManager },
    });

    expect(loadMainTunnelManager(packageRequire)).toBe(tunnelManager);
    expect(packageRequire).toHaveBeenNthCalledWith(1, '../main/tunnelManager.js');
    expect(packageRequire).toHaveBeenNthCalledWith(2, '../main/tunnelManager.ts');
  });
});
