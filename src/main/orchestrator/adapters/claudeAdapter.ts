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
    const args = [
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '--max-turns', String(options.maxTurns || 30),
    ];
    if (options.model) {
      args.push('--model', options.model);
    }
    // Pass prompt as -p argument since node-pty uses TTY (not pipe)
    args.push('-p', options.prompt);
    return {
      command: 'claude',
      args,
      promptDelivery: 'arg',
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
    return prompt + '\n';
  }
}

module.exports = { ClaudeAdapter };
