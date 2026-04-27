import { execFileSync } from 'child_process';

export class GeminiAdapter {
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
    // --prompt= (empty value) enables headless mode; actual prompt delivered via stdin pipe.
    // Must use --prompt= (single arg) instead of -p '' because Windows cmd.exe drops empty string args.
    const args = ['--yolo', '--prompt='];
    if (options.model) {
      args.push('--model', options.model);
    }
    return {
      command: 'gemini',
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
