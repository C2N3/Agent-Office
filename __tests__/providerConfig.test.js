const fs = require('fs');
const { getEnabledProviders } = require('../src/main/providerConfig');

describe('providerConfig', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('defaults to Claude only', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getEnabledProviders({})).toEqual(['claude']);
  });

  test('defaults to Claude and Codex when codex sessions exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(getEnabledProviders({})).toEqual(['claude', 'codex']);
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
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'unknown' })).toEqual(['claude']);
  });
});
