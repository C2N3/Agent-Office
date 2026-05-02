/**
 * ProcessManager — headless child_process.spawn() manager for orchestrator tasks.
 * Replaces node-pty for automated task execution while keeping terminalManager
 * for manual "Open Terminal" sessions.
 *
 * Modeled after CLITrigger's ClaudeManager.startWithSpawn() pattern.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadTreeKill } from '../nativeDependencies';

const treeKill = loadTreeKill();

type DebugLog = (message: string) => void;
type TaskExecutionEnvironment = 'auto' | 'native' | 'wsl';

interface SpawnConfig {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  executionEnvironment?: TaskExecutionEnvironment;
}

interface SpawnResult {
  pid: number;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  exitPromise: Promise<number>;
}

interface ManagedProcess {
  child: import('child_process').ChildProcess;
  pid: number;
}

function toWslPath(rawPath: string): string {
  const normalized = String(rawPath || '').replace(/\\/g, '/');
  if (!normalized) return '~';

  const driveMatch = normalized.match(/^([a-zA-Z]):\/?(.*)$/);
  if (driveMatch) {
    const [, driveLetter, rest = ''] = driveMatch;
    return `/mnt/${driveLetter.toLowerCase()}${rest ? `/${rest}` : ''}`;
  }

  const uncMatch = normalized.match(/^\/\/wsl(?:\.localhost)?\/[^/]+(\/.*)?$/i);
  if (uncMatch) {
    return uncMatch[1] || '/';
  }

  return normalized;
}

function buildWslSpawn(config: SpawnConfig) {
  const wslCwd = toWslPath(config.cwd);
  return {
    command: 'wsl.exe',
    args: [
      '--cd', wslCwd,
      '--exec', 'bash', '-lc',
      'export LANG="${LANG:-C.UTF-8}"; exec "$0" "$@"',
      config.command,
      ...config.args,
    ],
  };
}

function buildSpawnEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = Object.assign({}, process.env, extraEnv);
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const existingPath = env[pathKey] || env.PATH || env.Path || '';
  const pathParts = existingPath.split(path.delimiter).filter(Boolean);
  const defaults = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/Applications/Codex.app/Contents/Resources']
    : process.platform === 'win32'
      ? []
      : ['/usr/local/bin', '/usr/bin', '/bin'];

  for (const entry of defaults) {
    if (!pathParts.includes(entry)) pathParts.unshift(entry);
  }
  env[pathKey] = pathParts.join(path.delimiter);
  if (pathKey !== 'PATH') env.PATH = env[pathKey];
  return env;
}

function resolveSpawnCommand(command: string, env: NodeJS.ProcessEnv): string {
  if (!command || command.includes('/') || command.includes('\\')) return command;
  if (process.platform === 'win32') return command;

  const searchPath = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of searchPath) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return command;
}

export class ProcessManager {
  declare processes: Map<string, ManagedProcess>;
  declare debugLog: DebugLog;

  constructor({ debugLog }: { debugLog?: DebugLog } = {}) {
    this.processes = new Map();
    this.debugLog = debugLog || (() => {});
  }

  /**
   * Spawn a headless CLI process for a task.
   * Uses child_process.spawn with piped stdio (no PTY/ConPTY).
   * On Windows, shell: true resolves .cmd shims automatically.
   */
  spawn(taskId: string, config: SpawnConfig): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      // Clean up any existing process for this task
      if (this.processes.has(taskId)) {
        this.debugLog(`[ProcessManager] Killing existing process for ${taskId.slice(0, 8)}`);
        this.kill(taskId).catch(() => {});
      }

      const env = buildSpawnEnv(config.env || {});
      // Prevent "nested Claude Code session" error
      delete env.CLAUDECODE;
      // Hint UTF-8 locale on Windows
      if (process.platform === 'win32') {
        env.LANG = env.LANG || 'en_US.UTF-8';
      }

      let child: import('child_process').ChildProcess;
      try {
        const useWsl = process.platform === 'win32' && config.executionEnvironment === 'wsl';
        const spawnConfig = useWsl
          ? buildWslSpawn(config)
          : { ...config, command: resolveSpawnCommand(config.command, env) };
        if (useWsl) {
          this.debugLog(`[ProcessManager] Spawning via WSL: ${config.command} cwd=${toWslPath(config.cwd)}`);
        }

        child = spawn(spawnConfig.command, spawnConfig.args, {
          cwd: useWsl ? undefined : config.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          // shell: true on Windows to resolve .cmd shims (claude.cmd, codex.cmd, gemini.cmd)
          // Safe: prompts are delivered via stdin pipe, not as command-line arguments
          shell: process.platform === 'win32' && !useWsl,
          windowsHide: true,
          env,
        });
      } catch (err: any) {
        reject(new Error(
          `Failed to spawn ${config.command}. Is it installed and on PATH? ${err.message}`
        ));
        return;
      }

      let settled = false;
      child.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        reject(new Error(
          `Failed to start ${config.command}. Is it installed and on PATH? ${err.message}`
        ));
      });

      setImmediate(() => {
        if (settled) return;
        const pid = child.pid;
        if (pid === undefined) {
          settled = true;
          reject(new Error(`Failed to get PID for ${config.command} process`));
          return;
        }

        settled = true;
        this.processes.set(taskId, { child, pid });

        const exitPromise = new Promise<number>((resolveExit) => {
          child.on('exit', (code: number | null) => {
            this.processes.delete(taskId);
            resolveExit(code ?? 1);
          });
        });

        resolve({
          pid,
          stdout: child.stdout!,
          stderr: child.stderr!,
          stdin: child.stdin!,
          exitPromise,
        });
      });
    });
  }

  /**
   * Write data to a task's stdin pipe.
   */
  writeStdin(taskId: string, data: string): boolean {
    const proc = this.processes.get(taskId);
    if (!proc || !proc.child.stdin || (proc.child.stdin as any).destroyed) return false;
    proc.child.stdin.write(data);
    return true;
  }

  /**
   * End a task's stdin pipe.
   */
  endStdin(taskId: string): void {
    const proc = this.processes.get(taskId);
    if (!proc || !proc.child.stdin) return;
    try { proc.child.stdin.end(); } catch {}
  }

  /**
   * Kill a task's process tree.
   * Uses tree-kill to terminate the entire process tree (necessary on Windows
   * where shell: true wraps CLIs in cmd.exe).
   * Sends SIGTERM first, escalates to SIGKILL after 5 seconds.
   */
  kill(taskId: string): Promise<void> {
    const proc = this.processes.get(taskId);
    if (!proc) return Promise.resolve();

    // End stdin first
    try { proc.child.stdin?.end(); } catch {}

    // Graceful tree-kill
    try { treeKill(proc.pid, 'SIGTERM'); } catch {}

    return new Promise<void>((resolve) => {
      // Poll for process exit (exit handler deletes from map)
      const checkInterval = setInterval(() => {
        if (!this.processes.has(taskId)) {
          clearInterval(checkInterval);
          clearTimeout(killTimer);
          clearTimeout(deadline);
          resolve();
        }
      }, 200);

      // Escalate to SIGKILL after 5 seconds
      const killTimer = setTimeout(() => {
        if (this.processes.has(taskId)) {
          try { treeKill(proc.pid, 'SIGKILL'); } catch {}
        }
      }, 5000);

      // Final deadline: force-cleanup after 7 seconds
      const deadline = setTimeout(() => {
        clearInterval(checkInterval);
        clearTimeout(killTimer);
        this.processes.delete(taskId);
        resolve();
      }, 7000);
    });
  }

  /**
   * Check if a task's process is still running.
   */
  isRunning(taskId: string): boolean {
    return this.processes.has(taskId);
  }

  /**
   * Kill all managed processes.
   */
  async killAll(): Promise<void> {
    const taskIds = Array.from(this.processes.keys());
    await Promise.all(taskIds.map((id) => this.kill(id)));
  }
}
