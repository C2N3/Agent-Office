// @ts-nocheck
/**
 * Terminal Manager
 * Manages node-pty instances for embedded terminals
 */

const fs = require('fs');
const os = require('os');
const { resolveProjectPathForPlatform } = require('../utils');

class TerminalManager {
  constructor({ debugLog, getWindow, terminalProfileService }) {
    this.debugLog = debugLog || (() => {});
    this.getWindow = getWindow || (() => null);
    this.terminalProfileService = terminalProfileService || null;
    /** @type {Map<string, { pty: import('node-pty').IPty, cols: number, rows: number }>} */
    this.terminals = new Map();
    // Prevent duplicate policy-blocked notifications
    this._policyBlockedNotified = false;
  }

  /**
   * Create a new terminal for an agent
   * @param {string} agentId
   * @param {{ cwd?: string, shell?: string, command?: string, args?: string[], cols?: number, rows?: number }} options
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

    // Support custom command (e.g. 'claude') with args, or resolve a configured shell profile.
    const profile = (!options.command && !options.shell && this.terminalProfileService)
      ? this.terminalProfileService.resolveProfile(options.profileId)
      : null;
    const command = options.command || options.shell || profile?.command || (process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL || '/bin/bash');
    const args = options.args || profile?.args || [];

    let cwd = resolveProjectPathForPlatform(options.cwd) || os.homedir();
    const cols = options.cols || 120;
    const rows = options.rows || 30;

    try {
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        cwd = os.homedir();
      }
    } catch {
      cwd = os.homedir();
    }

    const env = Object.assign({}, process.env);
    // Ensure color support
    env.COLORTERM = 'truecolor';
    env.TERM = 'xterm-256color';

    try {
      const ptyProcess = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      const entry = { pty: ptyProcess, cols, rows, dataBuf: '' };
      this.terminals.set(agentId, entry);

      // Forward PTY output to dashboard window via IPC
      ptyProcess.onData((data) => {
        const win = this.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal:data', agentId, data);

          // Detect PowerShell execution policy block (matches both English and Korean Windows)
          // Buffer last 512 chars to handle strings split across chunks
          if (!this._policyBlockedNotified) {
            entry.dataBuf = (entry.dataBuf + data).slice(-512);
            if (
              entry.dataBuf.includes('PSSecurityException') ||
              entry.dataBuf.includes('scripts is disabled on this system') ||
              entry.dataBuf.includes('about_Execution_Policies') ||
              entry.dataBuf.includes('UnauthorizedAccess')
            ) {
              this._policyBlockedNotified = true;
              win.webContents.send('powershell:policy-blocked');
            }
          }
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

      this.debugLog(`[Terminal] Created: ${agentId.slice(0, 8)} cmd=${command} profile=${profile?.id || 'custom'} cwd=${cwd}`);
      return {
        success: true,
        pid: ptyProcess.pid,
        profileId: profile?.id || null,
        profileLabel: profile?.title || null,
      };
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
