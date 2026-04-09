// @ts-nocheck
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function getLocalCodexSessionsRoot(homedir = os.homedir()) {
  return path.join(homedir, '.codex', 'sessions');
}

function getWindowsAccessibleWslCodexRoot(runExec = execFileSync) {
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

function getCodexSessionRoots(options = {}) {
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

module.exports = {
  getCodexSessionRoots,
  getLocalCodexSessionsRoot,
  getWindowsAccessibleWslCodexRoot,
};
