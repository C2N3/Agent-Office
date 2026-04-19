const {
  CENTRAL_CONNECTION_MODES,
  configFromConnectionMode,
  connectionModeFromConfig,
  getConnectionModeMeta,
} = require('../public/dashboard/centralServerMode');

describe('centralServerMode', () => {
  test('maps mode selections to persisted config flags', () => {
    expect(configFromConnectionMode('local')).toEqual({ workerEnabled: false, agentSyncEnabled: false });
    expect(configFromConnectionMode('sync')).toEqual({ workerEnabled: false, agentSyncEnabled: true });
    expect(configFromConnectionMode('worker')).toEqual({ workerEnabled: true, agentSyncEnabled: false });
    expect(configFromConnectionMode('worker-sync')).toEqual({ workerEnabled: true, agentSyncEnabled: true });
  });

  test('derives the selected mode from saved config flags', () => {
    expect(connectionModeFromConfig({ workerEnabled: false, agentSyncEnabled: false })).toBe('local');
    expect(connectionModeFromConfig({ workerEnabled: false, agentSyncEnabled: true })).toBe('sync');
    expect(connectionModeFromConfig({ workerEnabled: true, agentSyncEnabled: false })).toBe('worker');
    expect(connectionModeFromConfig({ workerEnabled: true, agentSyncEnabled: true })).toBe('worker-sync');
  });

  test('round-trips all supported modes', () => {
    for (const mode of CENTRAL_CONNECTION_MODES) {
      expect(connectionModeFromConfig(configFromConnectionMode(mode))).toBe(mode);
    }
  });

  test('only worker modes require a worker token field', () => {
    expect(getConnectionModeMeta('local').usesWorkerToken).toBe(false);
    expect(getConnectionModeMeta('sync').usesWorkerToken).toBe(false);
    expect(getConnectionModeMeta('worker').usesWorkerToken).toBe(true);
    expect(getConnectionModeMeta('worker-sync').usesWorkerToken).toBe(true);
  });
});
