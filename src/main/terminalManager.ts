/**
 * Terminal Manager
 * Manages node-pty instances for embedded terminals
 */

import fs from 'fs';
import os from 'os';
import type { BrowserWindow } from 'electron';
import type { DashboardOpenOptions, DashboardTerminalProfile } from '../shared/contracts/index.js';
import { resolveProjectPathForPlatform } from '../utils';

type DebugLog = (message: string) => void;
type TerminalProfileServiceLike = {
  resolveProfile(profileId?: string | null): (DashboardTerminalProfile & {
    command: string;
    args?: string[];
  }) | null;
};
type TerminalEntry = {
  pty: import('node-pty').IPty;
  cols: number;
  rows: number;
  dataBuf: string;
};

/**
 * Escape cmd.exe metacharacters (`&`, `|`, `<`, `>`, `^`, `(`, `)`) with `^`
 * for arguments that node-pty's CRT quoter will pass through unquoted.
 * If the arg already contains whitespace or `"`, node-pty wraps it in `"..."`
 * and cmd treats the metacharacters as literal — no `^` needed. Otherwise cmd
 * would interpret e.g. `fix&login` as two commands.
 */
function escapeCmdMetacharsForUnquoted(arg) {
  const str = String(arg ?? '');
  if (/[\s"]/.test(str)) return str;
  return str.replace(/[&|<>^()]/g, '^$&');
}

class TerminalManager {
  declare debugLog: DebugLog;
  declare getWindow: () => BrowserWindow | null;
  declare terminalProfileService: TerminalProfileServiceLike | null;
  declare terminals: Map<string, TerminalEntry>;
  declare outputTaps: Map<string, Array<(data: string) => void>>;
  declare exitTaps: Map<string, Array<(exitCode: number) => void>>;
  declare _policyBlockedNotified: boolean;

  constructor({ debugLog, getWindow, terminalProfileService }) {
    this.debugLog = debugLog || (() => {});
    this.getWindow = getWindow || (() => null);
    this.terminalProfileService = terminalProfileService || null;
    /** @type {Map<string, { pty: import('node-pty').IPty, cols: number, rows: number }>} */
    this.terminals = new Map();
    /** @type {Map<string, Array<(data: string) => void>>} */
    this.outputTaps = new Map();
    /** @type {Map<string, Array<(exitCode: number) => void>>} */
    this.exitTaps = new Map();
    // Prevent duplicate policy-blocked notifications
    this._policyBlockedNotified = false;
  }

  /**
   * Create a new terminal for an agent
   * @param {string} agentId
   * @param {{ cwd?: string, shell?: string, command?: string, args?: string[], cols?: number, rows?: number }} options
   */
  createTerminal(agentId, options: DashboardOpenOptions = {}) {
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
    let command = options.command || options.shell || profile?.command || (process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL || '/bin/bash');
    let args = options.args || profile?.args || [];

    let cwd = resolveProjectPathForPlatform(options.cwd) || os.homedir();
    const cols = options.cols || 120;
    const rows = options.rows || 30;

    // On Windows, node-pty needs resolved command path for non-shell executables.
    // `where` may return multiple results (e.g. a POSIX shell script AND a .cmd wrapper).
    // Prefer .cmd/.exe over extensionless scripts to avoid ERROR_BAD_EXE_FORMAT (193).
    if (process.platform === 'win32' && options.command && !options.command.includes('\\') && !options.command.includes('/')) {
      try {
        const { execFileSync } = require('child_process');
        const candidates = execFileSync('where', [options.command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/);
        const preferred = candidates.find(c => /\.(cmd|exe|bat)$/i.test(c)) || candidates[0];
        if (preferred) command = preferred;
      } catch {}
    }

    // On Windows, when spawning a direct command (e.g. `claude` from Agent
    // Tasks), the ConPTY inherits the system code page — CP949 on Korean
    // Windows — and mis-decodes UTF-8 output from Node-based CLIs as mojibake.
    //
    // Previously we wrapped in `cmd.exe /d /c "chcp 65001>nul && <cmd>"`, but
    // when the target is an npm .cmd shim (like `claude.cmd`) the double
    // cmd.exe nesting — outer `/c` + inner `goto #_undefined_#` trick — causes
    // ConPTY to send CTRL_C_EVENT to the process group, immediately killing the
    // child with STATUS_CONTROL_C_EXIT (-1073741510 / 0xC000013A).
    //
    // Fix: for .cmd shims that wrap a Node script, resolve the actual .js entry
    // point and spawn `node.exe` directly. This avoids cmd.exe entirely and
    // keeps UTF-8 encoding via the `chcp` fallback only when truly needed.
    if (process.platform === 'win32' && options.command) {
      let resolved = false;

      // Try to resolve .cmd shim → node.exe + script.js (avoids cmd.exe entirely)
      if (/\.cmd$/i.test(command)) {
        try {
          const cmdContent = fs.readFileSync(command, 'utf8');
          // Match npm .cmd shim pattern: "%_prog%" "%dp0%\path\to\cli.js" %*
          // or simpler: "%dp0%\node_modules\...\cli.js"
          const jsMatch = cmdContent.match(/"%dp0%\\([^"]+\.js)"/);
          if (jsMatch) {
            const path = require('path');
            const scriptPath = path.join(path.dirname(command), jsMatch[1]);
            if (fs.existsSync(scriptPath)) {
              const originalArgs = args;
              // process.execPath returns the Electron binary in packaged apps,
              // not node.exe. Resolve node via the .cmd shim's own logic or PATH.
              let nodeBin = 'node';
              const shimNodePath = path.join(path.dirname(command), 'node.exe');
              if (fs.existsSync(shimNodePath)) {
                nodeBin = shimNodePath;
              } else {
                try {
                  const { execFileSync } = require('child_process');
                  nodeBin = execFileSync('where', ['node'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0];
                } catch {}
              }
              command = nodeBin;
              args = [scriptPath, ...originalArgs];
              resolved = true;
              this.debugLog(`[Terminal] Resolved .cmd shim to node: ${nodeBin} ${scriptPath}`);
            }
          }
        } catch (e) {
          this.debugLog(`[Terminal] .cmd shim resolution failed: ${e.message}`);
        }
      }

      // Fallback: wrap in cmd.exe /c chcp for non-.cmd commands or if resolution failed
      if (!resolved) {
        const originalCommand = command;
        const originalArgs = args;
        command = process.env.ComSpec || 'cmd.exe';
        args = [
          '/d', '/c', 'chcp', '65001', '>nul', '&&',
          escapeCmdMetacharsForUnquoted(originalCommand),
          ...originalArgs.map(escapeCmdMetacharsForUnquoted),
        ];
      }
    }

    try {
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        cwd = os.homedir();
      }
    } catch {
      cwd = os.homedir();
    }

    const env = Object.assign({}, process.env);
    // Prevent "nested Claude Code session" error when spawning claude CLI
    delete env.CLAUDECODE;
    // Ensure color support
    env.COLORTERM = 'truecolor';
    env.TERM = 'xterm-256color';
    // Hint UTF-8 locale for child processes spawned directly (without cmd.exe
    // chcp wrapper). Node.js CLIs already emit UTF-8; this helps any sub-shells.
    if (process.platform === 'win32') {
      env.LANG = env.LANG || 'en_US.UTF-8';
    }

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

        // Notify output taps (used by Orchestrator)
        const taps = this.outputTaps.get(agentId);
        if (taps) {
          for (const tap of taps) {
            try { tap(data); } catch {}
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

        // Notify exit taps (used by Orchestrator)
        const exitTapList = this.exitTaps.get(agentId);
        if (exitTapList) {
          for (const tap of exitTapList) {
            try { tap(exitCode); } catch {}
          }
          this.exitTaps.delete(agentId);
        }
        this.outputTaps.delete(agentId);
      });

      this.debugLog(`[Terminal] Created: ${agentId.slice(0, 8)} cmd=${command} args=${JSON.stringify(args)} profile=${profile?.id || 'custom'} cwd=${cwd}`);
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

  /**
   * Register a callback to receive terminal output data.
   * Returns a cleanup function to unregister.
   */
  tapOutput(agentId, callback) {
    if (!this.outputTaps.has(agentId)) {
      this.outputTaps.set(agentId, []);
    }
    this.outputTaps.get(agentId).push(callback);
    return () => {
      const taps = this.outputTaps.get(agentId);
      if (taps) {
        const idx = taps.indexOf(callback);
        if (idx >= 0) taps.splice(idx, 1);
      }
    };
  }

  /**
   * Register a callback to receive terminal exit events.
   * Returns a cleanup function to unregister.
   */
  tapExit(agentId, callback) {
    if (!this.exitTaps.has(agentId)) {
      this.exitTaps.set(agentId, []);
    }
    this.exitTaps.get(agentId).push(callback);
    return () => {
      const taps = this.exitTaps.get(agentId);
      if (taps) {
        const idx = taps.indexOf(callback);
        if (idx >= 0) taps.splice(idx, 1);
      }
    };
  }
}

export { TerminalManager };
