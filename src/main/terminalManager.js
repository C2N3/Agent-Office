/**
 * Terminal Manager
 * Manages node-pty instances for embedded terminals
 */

const os = require('os');

class TerminalManager {
  constructor({ debugLog, getWindow }) {
    this.debugLog = debugLog || (() => {});
    this.getWindow = getWindow || (() => null);
    /** @type {Map<string, { pty: import('node-pty').IPty, cols: number, rows: number }>} */
    this.terminals = new Map();
  }

  /**
   * Create a new terminal for an agent
   * @param {string} agentId
   * @param {{ cwd?: string, shell?: string, cols?: number, rows?: number }} options
   */
  createTerminal(agentId, options = {}) {
    if (this.terminals.has(agentId)) {
      this.debugLog(`[Terminal] Already exists: ${agentId.slice(0, 8)}`);
      return { success: true, existing: true };
    }

    // Lazy-require node-pty to avoid crash if not installed
    let pty;
    try {
      pty = require('node-pty');
    } catch (e) {
      this.debugLog(`[Terminal] node-pty not available: ${e.message}`);
      return { success: false, error: 'node-pty not available' };
    }

    const shell = options.shell || (process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL || '/bin/bash');

    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 120;
    const rows = options.rows || 30;

    const env = Object.assign({}, process.env);
    // Ensure color support
    env.COLORTERM = 'truecolor';
    env.TERM = 'xterm-256color';

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      const entry = { pty: ptyProcess, cols, rows };
      this.terminals.set(agentId, entry);

      // Forward PTY output to dashboard window via IPC
      ptyProcess.onData((data) => {
        const win = this.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal:data', agentId, data);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        this.debugLog(`[Terminal] Exited: ${agentId.slice(0, 8)} code=${exitCode}`);
        this.terminals.delete(agentId);
        const win = this.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal:exit', agentId, exitCode);
        }
      });

      this.debugLog(`[Terminal] Created: ${agentId.slice(0, 8)} shell=${shell} cwd=${cwd}`);
      return { success: true, pid: ptyProcess.pid };
    } catch (e) {
      this.debugLog(`[Terminal] Spawn error: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  writeToTerminal(agentId, data) {
    const entry = this.terminals.get(agentId);
    if (entry) {
      entry.pty.write(data);
    }
  }

  resizeTerminal(agentId, cols, rows) {
    const entry = this.terminals.get(agentId);
    if (entry && cols > 0 && rows > 0) {
      entry.pty.resize(cols, rows);
      entry.cols = cols;
      entry.rows = rows;
    }
  }

  destroyTerminal(agentId) {
    const entry = this.terminals.get(agentId);
    if (entry) {
      try {
        entry.pty.kill();
      } catch (e) {
        this.debugLog(`[Terminal] Kill error: ${e.message}`);
      }
      this.terminals.delete(agentId);
      this.debugLog(`[Terminal] Destroyed: ${agentId.slice(0, 8)}`);
    }
  }

  destroyAll() {
    for (const [id] of this.terminals) {
      this.destroyTerminal(id);
    }
    this.debugLog('[Terminal] All terminals destroyed');
  }

  hasTerminal(agentId) {
    return this.terminals.has(agentId);
  }
}

module.exports = { TerminalManager };
