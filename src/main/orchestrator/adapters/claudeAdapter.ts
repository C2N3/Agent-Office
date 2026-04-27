import { execFileSync } from 'child_process';

export class ClaudeAdapter {
  get provider() {
    return 'claude';
  }

  async checkAvailability() {
    try {
      execFileSync('claude', ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  }

  buildSpawnConfig(options) {
    // Headless --print mode: Claude auto-exits on completion and emits
    // structured JSON lines via --output-format stream-json.
    // Prompt is delivered via stdin pipe (not as a command arg) to avoid
    // Windows shell escaping issues and command-line length limits.
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--max-turns', String(options.maxTurns || 30),
    ];
    if (options.model) {
      args.push('--model', options.model);
    }
    return {
      command: 'claude',
      args,
      promptDelivery: 'stdin',
      outputFormat: 'stream-json',
      env: {},
    };
  }

  parseOutput(chunk, buffer) {
    const results = [];
    const stripped = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const lines = stripped.split('\n').filter(Boolean);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/error|failed|exception/i.test(trimmed)) {
        const isContext = /context.*(full|exhaust|limit|exceeded)/i.test(trimmed)
          || /max.*context.*length/i.test(trimmed);
        results.push({
          type: isContext ? 'context_exhaustion' : 'error',
          message: trimmed,
          isContextExhausted: isContext,
        });
      } else {
        results.push({ type: 'text', message: trimmed });
      }
    }
    return results;
  }

  detectContextExhaustion(buffer) {
    return /context.*(full|exhaust|limit|exceeded)/i.test(buffer)
      || /max.*context.*length/i.test(buffer)
      || /conversation.*too.*long/i.test(buffer)
      || /token.*limit.*reached/i.test(buffer);
  }

  buildStdinPrompt(prompt) {
    // Piped stdin uses \n (not \r which is for PTY terminals)
    return prompt + '\n';
  }
}
