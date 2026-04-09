// @ts-nocheck

const MAX_BUFFER_SIZE = 4000;

class OutputParser {
  constructor(adapter) {
    this.adapter = adapter;
    this.buffer = '';
  }

  feed(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
    }
    return this.adapter.parseOutput(chunk, this.buffer);
  }

  isContextExhausted() {
    return this.adapter.detectContextExhaustion(this.buffer);
  }

  getRecentOutput(chars = 500) {
    return this.buffer.slice(-chars);
  }

  reset() {
    this.buffer = '';
  }
}

module.exports = { OutputParser };
