const { execFileSync } = require('child_process');

class GeminiAdapter {
  get provider() {
    return 'gemini';
  }

  async checkAvailability() {
    try {
      execFileSync('gemini', ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  }

  buildSpawnConfig(options) {
    const args = ['--yolo'];
    if (options.model) {
      args.push('--model', options.model);
    }
    args.push(options.prompt);
    return {
      command: 'gemini',
      args,
      promptDelivery: 'arg',
      env: {},
    };
  }

  parseOutput(chunk, buffer) {
    const results = [];
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      const stripped = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (!stripped) continue;

      if (/error|failed|exception/i.test(stripped)) {
        results.push({ type: 'error', message: stripped });
      } else if (/done|completed|finished/i.test(stripped)) {
        results.push({ type: 'completion', message: stripped });
      } else {
        results.push({ type: 'text', message: stripped });
      }
    }
    return results;
  }

  detectContextExhaustion(buffer) {
    return /context.*window/i.test(buffer)
      || /token.*limit/i.test(buffer)
      || /input.*too.*long/i.test(buffer);
  }
}

module.exports = { GeminiAdapter };
