const { ClaudeAdapter } = require('./adapters/claudeAdapter');
const { CodexAdapter } = require('./adapters/codexAdapter');
const { GeminiAdapter } = require('./adapters/geminiAdapter');
const { normalizeProvider } = require('../providers/registry');

function createCLIAdapter(provider) {
  const normalizedProvider = normalizeProvider(provider, String(provider || '').trim() ? null : undefined);
  switch (normalizedProvider) {
    case 'claude':
      return new ClaudeAdapter();
    case 'codex':
      return new CodexAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      throw new Error(`Unknown CLI provider: ${provider}`);
  }
}

module.exports = { createCLIAdapter };
