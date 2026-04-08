/**
 * pricing.js Tests — getContextWindowSize
 */

const {
  normalizeModelName,
  getContextWindowSize,
  MODEL_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
  MODEL_PRICING,
} = require('../src/pricing');

describe('getContextWindowSize', () => {
  test('returns correct size for known models', () => {
    expect(getContextWindowSize('claude-opus-4-6')).toBe(200000);
    expect(getContextWindowSize('claude-sonnet-4-5')).toBe(200000);
    expect(getContextWindowSize('claude-haiku-4-6')).toBe(200000);
  });

  test('returns default for unknown model', () => {
    expect(getContextWindowSize('gpt-4o')).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getContextWindowSize('unknown-model')).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  test('returns default for null/undefined/empty', () => {
    expect(getContextWindowSize(null)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getContextWindowSize(undefined)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getContextWindowSize('')).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  test('normalizes Codex model names', () => {
    expect(normalizeModelName('gpt-5-codex')).toBe('codex');
    expect(normalizeModelName('codex')).toBe('codex');
    expect(getContextWindowSize('gpt-5-codex')).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(MODEL_PRICING.codex).toBeDefined();
    expect(MODEL_CONTEXT_WINDOWS.codex).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  test('MODEL_CONTEXT_WINDOWS covers all MODEL_PRICING keys', () => {
    for (const model of Object.keys(MODEL_PRICING)) {
      expect(MODEL_CONTEXT_WINDOWS).toHaveProperty(model);
    }
  });
});
