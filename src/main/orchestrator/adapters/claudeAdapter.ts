// @ts-nocheck
const { execFileSync } = require('child_process');

class ClaudeAdapter {
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
    // Run in interactive mode (no --print) so the full TUI is visible
    // in the terminal: tool calls, file reads/writes, streaming, etc.
    // Note: do NOT pass the prompt as a positional arg — `claude "prompt"`
    // runs in one-shot mode and exits after responding, leaving the user
    // unable to continue the conversation. Instead spawn claude bare and
    // deliver the prompt via stdin so the TUI stays interactive.
    const args = [
      '--verbose',
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
    return prompt + '\r';
  }
}

module.exports = { ClaudeAdapter };
