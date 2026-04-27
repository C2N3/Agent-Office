import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { ExecFileSyncOptionsWithStringEncoding } from 'child_process';

type CodexSessionRootsOptions = {
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
  homedir?: string;
  localRoot?: string | null;
  wslRoot?: string | null;
  runExec?: (
    file: string,
    args: string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => string | Buffer;
};

type RunExec = NonNullable<CodexSessionRootsOptions['runExec']>;

export function getLocalCodexSessionsRoot(homedir = os.homedir()) {
  return path.join(homedir, '.codex', 'sessions');
}

export function getWindowsAccessibleWslCodexRoot(runExec: RunExec = execFileSync as RunExec) {
  if (process.platform !== 'win32') return null;

  try {
    const output = runExec('wsl.exe', ['sh', '-lc', 'wslpath -w "$HOME/.codex/sessions"'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const resolved = String(output || '').trim();
    return resolved || null;
  } catch {
    return null;
  }
}

export function getCodexSessionRoots(options: CodexSessionRootsOptions = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const localRoot = options.localRoot || getLocalCodexSessionsRoot(options.homedir);
  const wslRoot = options.wslRoot === undefined
    ? getWindowsAccessibleWslCodexRoot(options.runExec)
    : options.wslRoot;

  const configuredRoot = (env.PIXEL_AGENT_CODEX_SESSION_ROOT || '').trim();
  const candidates = [
    configuredRoot || null,
    localRoot || null,
    wslRoot || null,
  ];

  return candidates.filter((root, index, list) => {
    if (!root) return false;
    if (list.indexOf(root) !== index) return false;
    return existsSync(root);
  });
}
