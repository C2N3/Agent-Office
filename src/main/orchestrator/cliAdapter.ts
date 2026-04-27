import { ClaudeAdapter } from './adapters/claudeAdapter';
import { CodexAdapter } from './adapters/codexAdapter';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { normalizeProvider } from '../providers/registry';

export function createCLIAdapter(provider) {
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
