const { getEnabledProviders } = require('../src/main/providerConfig');

describe('providerConfig', () => {
  test('defaults to Claude only', () => {
    expect(getEnabledProviders({})).toEqual(['claude']);
  });

  test('supports explicit Codex only mode', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'codex' })).toEqual(['codex']);
  });

  test('supports comma-separated provider list', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDERS: 'claude, codex, claude' })).toEqual(['claude', 'codex']);
  });

  test('supports all alias', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'all' })).toEqual(['claude', 'codex']);
  });

  test('falls back to Claude when value is invalid', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'unknown' })).toEqual(['claude']);
  });
});
