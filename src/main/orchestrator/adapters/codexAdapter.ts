const { execFileSync } = require('child_process');

class CodexAdapter {
  get provider() {
    return 'codex';
  }

  async checkAvailability() {
    try {
      execFileSync('codex', ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  }

  buildSpawnConfig(options) {
    // Prompt delivered via stdin pipe instead of trailing argument to avoid
    // Windows command-line length limits and shell escaping issues.
    const args = ['exec', '--full-auto'];
    if (options.model) {
      args.push('--model', options.model);
    }
    return {
      command: 'codex',
      args,
      promptDelivery: 'stdin',
      outputFormat: 'text',
      env: {},
    };
  }

  buildStdinPrompt(prompt) {
    return prompt + '\n';
  }

  parseOutput(chunk, buffer) {
    const results = [];
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      const stripped = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (!stripped) continue;

      if (/applying\s+patch/i.test(stripped)) {
        results.push({ type: 'tool_use', toolName: 'patch', message: stripped });
      } else if (/running\s+command/i.test(stripped)) {
        results.push({ type: 'tool_use', toolName: 'command', message: stripped });
      } else if (/done|completed|finished/i.test(stripped)) {
        results.push({ type: 'completion', message: stripped });
      } else if (/error|failed|exception/i.test(stripped)) {
        results.push({ type: 'error', message: stripped });
      } else {
        results.push({ type: 'text', message: stripped });
      }
    }
    return results;
  }

  detectContextExhaustion(buffer) {
    return /context.*exhaust/i.test(buffer)
      || /token.*limit.*reached/i.test(buffer)
      || /maximum.*context/i.test(buffer);
  }
}

module.exports = { CodexAdapter };
