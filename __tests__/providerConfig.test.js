const fs = require('fs');
import { getEnabledProviders } from '../src/main/providerConfig';

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

  test('supports explicit Gemini only mode', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'gemini' })).toEqual(['gemini']);
  });

  test('detects Codex from an explicit session root override', () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((target) => target === '/custom/codex/sessions');
    expect(getEnabledProviders({ PIXEL_AGENT_CODEX_SESSION_ROOT: '/custom/codex/sessions' })).toEqual(['claude', 'codex']);
  });

  test('supports comma-separated provider list', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDERS: 'claude, codex, claude' })).toEqual(['claude', 'codex']);
  });

  test('supports all alias', () => {
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'all' })).toEqual(['claude', 'codex', 'gemini']);
  });

  test('falls back to Claude when value is invalid', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getEnabledProviders({ PIXEL_AGENT_PROVIDER: 'unknown' })).toEqual(['claude']);
  });
});
