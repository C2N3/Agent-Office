
import type { CLIAdapter, OutputParseResult } from './types.js';

const MAX_BUFFER_SIZE = 4000;
const MAX_FULL_BUFFER_SIZE = 100000; // 100KB for full output capture

class OutputParser {
  declare adapter: CLIAdapter;
  declare outputFormat: 'text' | 'stream-json' | 'codex-json';
  declare buffer: string;
  declare fullBuffer: string;
  declare humanBuffer: string;    // Human-readable text extracted from JSON events
  declare stdoutLineBuf: string;  // Incomplete line buffer for stream-json parsing
  declare contextExhausted: boolean;
  declare lastAssistantMessage: string | null;

  constructor(adapter: CLIAdapter, outputFormat?: 'text' | 'stream-json' | 'codex-json') {
    this.adapter = adapter;
    this.outputFormat = outputFormat || 'text';
    this.buffer = '';
    this.fullBuffer = '';
    this.humanBuffer = '';
    this.stdoutLineBuf = '';
    this.contextExhausted = false;
    this.lastAssistantMessage = null;
  }

  /**
   * Feed raw data (legacy single-stream path, backward compat).
   */
  feed(chunk: string): OutputParseResult[] {
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
    }
    this.fullBuffer += chunk;
    if (this.fullBuffer.length > MAX_FULL_BUFFER_SIZE) {
      this.fullBuffer = this.fullBuffer.slice(-MAX_FULL_BUFFER_SIZE);
    }
    return this.adapter.parseOutput(chunk, this.buffer);
  }

  /**
   * Feed stdout data from headless spawn().
   * For stream-json: parses JSON lines and extracts human-readable text.
   * For text: delegates to adapter.parseOutput().
   */
  feedStdout(chunk: string): OutputParseResult[] {
    // Always accumulate in fullBuffer for getFullOutput()
    this.fullBuffer += chunk;
    if (this.fullBuffer.length > MAX_FULL_BUFFER_SIZE) {
      this.fullBuffer = this.fullBuffer.slice(-MAX_FULL_BUFFER_SIZE);
    }

    if (this.outputFormat === 'stream-json') {
      return this._parseStreamJson(chunk);
    }
    if (this.outputFormat === 'codex-json') {
      return this._parseCodexJson(chunk);
    }

    // Text mode: strip ANSI (output should be clean from spawn, but just in case)
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
    }
    this.humanBuffer += chunk;
    return this.adapter.parseOutput(chunk, this.buffer);
  }

  /**
   * Feed stderr data from headless spawn().
   */
  feedStderr(chunk: string): OutputParseResult[] {
    this.fullBuffer += chunk;
    if (this.fullBuffer.length > MAX_FULL_BUFFER_SIZE) {
      this.fullBuffer = this.fullBuffer.slice(-MAX_FULL_BUFFER_SIZE);
    }

    if (this.outputFormat === 'stream-json') {
      // stderr in stream-json mode may also contain JSON lines
      return this._parseStreamJson(chunk);
    }
    if (this.outputFormat === 'codex-json') {
      return this._parseCodexJson(chunk);
    }

    // Text mode: accumulate as errors
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
    }
    return [{ type: 'error', message: chunk.trim() }];
  }

  /**
   * Parse Claude's stream-json output (one JSON object per line).
   * Extracts human-readable text and detects context exhaustion / errors.
   * Pattern borrowed from CLITrigger's discussion-orchestrator.ts.
   */
  private _parseStreamJson(chunk: string): OutputParseResult[] {
    const results: OutputParseResult[] = [];
    this.stdoutLineBuf += chunk;
    const lines = this.stdoutLineBuf.split('\n');
    this.stdoutLineBuf = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event: Record<string, any>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        // Not valid JSON — treat as raw text
        this._appendHuman(trimmed);
        results.push({ type: 'text', message: trimmed });
        continue;
      }

      switch (event.type) {
        case 'assistant': {
          const content = event.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                this._appendHuman(block.text);
                results.push({ type: 'text', message: block.text });
              } else if (block.type === 'tool_use') {
                const toolName = block.name || 'unknown';
                const detail = this._summarizeToolInput(toolName, block.input);
                const msg = detail ? `[Tool: ${toolName}] ${detail}` : `[Tool: ${toolName}]`;
                this._appendHuman(msg);
                results.push({ type: 'tool_use', toolName, message: msg });
              }
            }
          }
          break;
        }
        case 'result': {
          // Check for context exhaustion in result events
          if (event.is_error || event.subtype === 'error_max_turns') {
            this.contextExhausted = true;
            const msg = typeof event.error === 'string' ? event.error : 'Context exhausted';
            results.push({ type: 'context_exhaustion', message: msg, isContextExhausted: true });
          }
          // Extract token usage if available
          if (event.result) {
            this._appendHuman(typeof event.result === 'string' ? event.result : '');
          }
          break;
        }
        case 'error': {
          const errorMsg = typeof event.error === 'string' ? event.error
            : typeof event.message === 'string' ? event.message
            : JSON.stringify(event);
          this._appendHuman(`[Error] ${errorMsg}`);

          // Check if this is a context exhaustion error
          const isContext = /context.*(full|exhaust|limit|exceeded)/i.test(errorMsg)
            || /max.*context.*length/i.test(errorMsg)
            || /conversation.*too.*long/i.test(errorMsg);
          if (isContext) {
            this.contextExhausted = true;
            results.push({ type: 'context_exhaustion', message: errorMsg, isContextExhausted: true });
          } else {
            results.push({ type: 'error', message: errorMsg });
          }
          break;
        }
        // 'system', 'content_block_start', etc. — skip silently
        default:
          break;
      }
    }

    // Update buffer with human-readable text for context exhaustion detection
    this.buffer = this.humanBuffer.slice(-MAX_BUFFER_SIZE);
    return results;
  }

  private _summarizeToolInput(toolName: string, input: any): string {
    if (!input || typeof input !== 'object') return '';
    switch (toolName) {
      case 'Bash':
        return input.command ? String(input.command).split('\n')[0].slice(0, 120) : '';
      case 'Read':
        return input.file_path || '';
      case 'Edit':
      case 'Write':
        return input.file_path || '';
      case 'Grep':
        return input.pattern ? `"${input.pattern}"${input.path ? ` in ${input.path}` : ''}` : '';
      case 'Glob':
        return input.pattern || '';
      case 'Agent':
        return input.description || '';
      default:
        return '';
    }
  }

  private _parseCodexJson(chunk: string): OutputParseResult[] {
    const results: OutputParseResult[] = [];
    this.stdoutLineBuf += chunk;
    const lines = this.stdoutLineBuf.split('\n');
    this.stdoutLineBuf = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event: Record<string, any>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        this._pushAssistantMessage(results, event.item.text || '');
      } else if (event.type === 'event_msg') {
        this._parseCodexEventMessage(results, event.payload || {});
      } else if (event.type === 'response_item') {
        this._parseCodexResponseItem(results, event.payload || {});
      } else if (event.type === 'turn.failed' || event.type === 'error') {
        const message = event.error || event.message || 'Codex task failed';
        results.push({ type: 'error', message: String(message) });
        this._appendHuman(`[Error] ${String(message)}`);
      }
    }

    this.buffer = this.humanBuffer.slice(-MAX_BUFFER_SIZE);
    return results;
  }

  private _parseCodexEventMessage(results: OutputParseResult[], payload: any): void {
    if (payload.type === 'agent_message') {
      this._pushAssistantMessage(results, payload.message || '');
      return;
    }
    if (payload.type === 'task_complete' && payload.last_agent_message) {
      this._pushAssistantMessage(results, payload.last_agent_message);
    }
  }

  private _parseCodexResponseItem(results: OutputParseResult[], payload: any): void {
    if (payload.type !== 'message' || !Array.isArray(payload.content)) return;
    const text = payload.content
      .filter((item) => item && item.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim();
    this._pushAssistantMessage(results, text);
  }

  private _pushAssistantMessage(results: OutputParseResult[], text: string): void {
    const message = String(text || '').trim();
    if (!message || message === this.lastAssistantMessage) return;
    this.lastAssistantMessage = message;
    this._appendHuman(message);
    results.push({ type: 'text', message, merge: false });
  }

  private _appendHuman(text: string): void {
    if (!text) return;
    this.humanBuffer += text + '\n';
  }

  isContextExhausted(): boolean {
    if (this.contextExhausted) return true;
    return this.adapter.detectContextExhaustion(this.buffer);
  }

  getRecentOutput(chars = 500): string {
    if (this.outputFormat !== 'text') {
      return this.humanBuffer.slice(-chars);
    }
    return this.buffer.slice(-chars);
  }

  getFullOutput(): string {
    if (this.outputFormat !== 'text') {
      return this.humanBuffer;
    }
    return this.fullBuffer;
  }

  reset(): void {
    this.buffer = '';
    this.fullBuffer = '';
    this.humanBuffer = '';
    this.stdoutLineBuf = '';
    this.contextExhausted = false;
    this.lastAssistantMessage = null;
  }
}

module.exports = { OutputParser };
