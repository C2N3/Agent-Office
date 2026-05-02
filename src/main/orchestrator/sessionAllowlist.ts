/**
 * Session Allowlist
 *
 * Tracks which provider CLI sessions are "task-owned" — i.e. spawned by the
 * orchestrator for a specific task. Provider integrations (Claude hook,
 * Codex session monitor, Gemini liveness) consult this allowlist before
 * creating agent characters. Sessions outside the allowlist are ignored,
 * so characters only react to Task-launched CLI invocations.
 *
 * Indexed by normalized cwd (primary — task workspaces are unique paths),
 * taskId, and pid. An entry is registered when orchestrator spawns the
 * process and unregistered when the task runtime cleans up.
 */

export type SessionAllowlistEntry = {
  taskId: string;
  pid: number;
  cwd: string;
  provider: string | null;
};

export function normalizeCwd(cwd: string | null | undefined): string {
  if (!cwd) return '';
  return String(cwd).replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
}

export class SessionAllowlist {
  declare _byTaskId: Map<string, SessionAllowlistEntry>;
  declare _byPid: Map<number, string>;
  declare _byCwd: Map<string, Set<string>>;

  constructor() {
    this._byTaskId = new Map();
    this._byPid = new Map();
    this._byCwd = new Map();
  }

  register(entry: { taskId: string; pid?: number | null; cwd?: string | null; provider?: string | null }): void {
    if (!entry || !entry.taskId) return;
    const normalized = normalizeCwd(entry.cwd);
    const pid = typeof entry.pid === 'number' && entry.pid > 0 ? entry.pid : 0;

    // Replace any existing entry for this taskId (re-register on retry)
    this.unregister(entry.taskId);

    const stored: SessionAllowlistEntry = {
      taskId: entry.taskId,
      pid,
      cwd: normalized,
      provider: entry.provider || null,
    };
    this._byTaskId.set(entry.taskId, stored);
    if (pid) this._byPid.set(pid, entry.taskId);
    if (normalized) {
      let set = this._byCwd.get(normalized);
      if (!set) {
        set = new Set();
        this._byCwd.set(normalized, set);
      }
      set.add(entry.taskId);
    }
  }

  unregister(taskId: string): void {
    if (!taskId) return;
    const entry = this._byTaskId.get(taskId);
    if (!entry) return;
    this._byTaskId.delete(taskId);
    if (entry.pid) {
      const mapped = this._byPid.get(entry.pid);
      if (mapped === taskId) this._byPid.delete(entry.pid);
    }
    if (entry.cwd) {
      const set = this._byCwd.get(entry.cwd);
      if (set) {
        set.delete(taskId);
        if (set.size === 0) this._byCwd.delete(entry.cwd);
      }
    }
  }

  hasPid(pid: number | null | undefined): boolean {
    if (!pid || typeof pid !== 'number' || pid <= 0) return false;
    return this._byPid.has(pid);
  }

  hasCwd(cwd: string | null | undefined): boolean {
    const normalized = normalizeCwd(cwd);
    if (!normalized) return false;
    return this._byCwd.has(normalized);
  }

  hasTaskId(taskId: string | null | undefined): boolean {
    if (!taskId) return false;
    return this._byTaskId.has(taskId);
  }

  resolveTaskIdByCwd(cwd: string | null | undefined): string | null {
    const normalized = normalizeCwd(cwd);
    if (!normalized) return null;
    const set = this._byCwd.get(normalized);
    if (!set || set.size === 0) return null;
    return set.values().next().value || null;
  }

  resolveTaskIdByPid(pid: number | null | undefined): string | null {
    if (!pid || typeof pid !== 'number' || pid <= 0) return null;
    return this._byPid.get(pid) || null;
  }

  /**
   * Returns true if any of the provided signals match a registered entry.
   * Used by provider gates that may receive cwd, pid, or both.
   */
  accepts({ cwd, pid, taskId }: { cwd?: string | null; pid?: number | null; taskId?: string | null }): boolean {
    if (taskId && this.hasTaskId(taskId)) return true;
    if (pid && this.hasPid(pid)) return true;
    if (cwd && this.hasCwd(cwd)) return true;
    return false;
  }

  size(): number {
    return this._byTaskId.size;
  }

  clear(): void {
    this._byTaskId.clear();
    this._byPid.clear();
    this._byCwd.clear();
  }
}

export const sharedSessionAllowlist = new SessionAllowlist();
