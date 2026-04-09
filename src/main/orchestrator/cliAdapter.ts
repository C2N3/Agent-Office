// @ts-nocheck
const { ClaudeAdapter } = require('./adapters/claudeAdapter');
const { CodexAdapter } = require('./adapters/codexAdapter');
const { GeminiAdapter } = require('./adapters/geminiAdapter');

function createCLIAdapter(provider) {
  switch (provider) {
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
