const {
  buildGuestInviteLink,
  flagsFromRemoteMode,
  modeUsesWorkerToken,
  parseGuestInviteLink,
} = require('../src/client/dashboard/remoteMode.ts');

describe('remoteMode helpers', () => {
  test('buildGuestInviteLink uses the local app origin and includes the central server origin in the fragment', () => {
    expect(buildGuestInviteLink('http://localhost:3000/', 'https://central.example.test/', 'guest-secret')).toBe(
      'http://localhost:3000/#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test'
    );
  });

  test('parseGuestInviteLink extracts baseUrl and guest secret from the fragment', () => {
    expect(parseGuestInviteLink('http://localhost:3000/#aoGuestSecret=guest-secret&aoBaseUrl=https%3A%2F%2Fcentral.example.test')).toEqual({
      baseUrl: 'https://central.example.test',
      guestSecret: 'guest-secret',
    });
  });

  test('maps remote modes to derived worker and sync flags', () => {
    expect(flagsFromRemoteMode('local')).toEqual({ workerEnabled: false, agentSyncEnabled: false });
    expect(flagsFromRemoteMode('host')).toEqual({ workerEnabled: false, agentSyncEnabled: false });
    expect(flagsFromRemoteMode('host', { roomSecretConfigured: true })).toEqual({
      workerEnabled: true,
      agentSyncEnabled: true,
    });
    expect(flagsFromRemoteMode('host', { workerTokenConfigured: true })).toEqual({
      workerEnabled: true,
      agentSyncEnabled: true,
    });
    expect(flagsFromRemoteMode('guest')).toEqual({ workerEnabled: false, agentSyncEnabled: false });
    expect(flagsFromRemoteMode('guest', { roomSecretConfigured: true })).toEqual({
      workerEnabled: true,
      agentSyncEnabled: true,
    });
  });

  test('only host mode uses the worker token field', () => {
    expect(modeUsesWorkerToken('local')).toBe(false);
    expect(modeUsesWorkerToken('host')).toBe(true);
    expect(modeUsesWorkerToken('guest')).toBe(false);
  });
});
