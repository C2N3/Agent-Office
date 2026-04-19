const {
  buildGuestInviteLink,
  flagsFromRemoteMode,
  modeUsesWorkerToken,
  parseGuestInviteLink,
} = require('../public/dashboard/remoteMode.ts');

describe('remoteMode helpers', () => {
  test('buildGuestInviteLink uses the central server origin and guest secret fragment', () => {
    expect(buildGuestInviteLink('https://central.example.test/', 'guest-secret')).toBe(
      'https://central.example.test/#aoGuestSecret=guest-secret'
    );
  });

  test('parseGuestInviteLink extracts origin and guest secret', () => {
    expect(parseGuestInviteLink('https://central.example.test/#aoGuestSecret=guest-secret')).toEqual({
      baseUrl: 'https://central.example.test',
      guestSecret: 'guest-secret',
    });
  });

  test('maps remote modes to derived worker and sync flags', () => {
    expect(flagsFromRemoteMode('local')).toEqual({ workerEnabled: false, agentSyncEnabled: false });
    expect(flagsFromRemoteMode('host')).toEqual({ workerEnabled: true, agentSyncEnabled: true });
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
