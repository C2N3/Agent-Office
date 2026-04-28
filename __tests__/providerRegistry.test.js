import {
  buildProviderResumeCommand,
  getProviderDefinition,
  getProviderIds,
  normalizeProvider,
  providerSupportsActiveSessionFileRecovery,
  providerSupportsTranscriptStats,
} from '../src/main/providers/registry';

describe('provider registry', () => {
  test('lists known providers from one registry', () => {
    expect(getProviderIds()).toEqual(['claude', 'codex', 'gemini']);
  });

  test('normalizes provider ids and falls back to the default provider', () => {
    expect(normalizeProvider(' Codex ')).toBe('codex');
    expect(normalizeProvider('unknown')).toBe('claude');
    expect(normalizeProvider('unknown', null)).toBeNull();
  });

  test('builds resume commands per provider capability', () => {
    expect(buildProviderResumeCommand('claude', 'session-1')).toBe('claude --resume session-1\r');
    expect(buildProviderResumeCommand('codex', 'thread-1')).toBe('codex resume thread-1\r');
    expect(buildProviderResumeCommand('gemini', 'gemini-1')).toBeNull();
    expect(buildProviderResumeCommand('unknown', 'unknown-1')).toBeNull();
    expect(buildProviderResumeCommand(null, 'legacy-1')).toBe('claude --resume legacy-1\r');
  });

  test('exposes provider capabilities explicitly', () => {
    expect(getProviderDefinition('gemini').cliCommand).toBe('gemini');
    expect(providerSupportsTranscriptStats('claude')).toBe(true);
    expect(providerSupportsTranscriptStats('gemini')).toBe(false);
    expect(providerSupportsActiveSessionFileRecovery('codex')).toBe(true);
    expect(providerSupportsActiveSessionFileRecovery('claude')).toBe(false);
  });
});
