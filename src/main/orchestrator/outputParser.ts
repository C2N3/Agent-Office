// @ts-nocheck

const MAX_BUFFER_SIZE = 4000;
const MAX_FULL_BUFFER_SIZE = 100000; // 100KB for full output capture

class OutputParser {
  constructor(adapter) {
    this.adapter = adapter;
    this.buffer = '';
    this.fullBuffer = '';
  }

  feed(chunk) {
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

  isContextExhausted() {
    return this.adapter.detectContextExhaustion(this.buffer);
  }

  getRecentOutput(chars = 500) {
    return this.buffer.slice(-chars);
  }

  getFullOutput() {
    return this.fullBuffer;
  }

  reset() {
    this.buffer = '';
    this.fullBuffer = '';
  }
}

module.exports = { OutputParser };
