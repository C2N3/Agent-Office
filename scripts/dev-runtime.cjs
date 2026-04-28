#!/usr/bin/env node

const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createRecursiveWatcher } = require('./watch-utils.cjs');
const { startViteDevServer } = require('./vite-dev-server.cjs');
const { createFileChangeClassifier } = require('./dev-runtime/file-change.cjs');

const projectRoot = path.join(__dirname, '..');
const browserRoot = path.join(projectRoot, 'src', 'browser');
const buildScript = path.join(__dirname, 'build-types.cjs');
const electronScript = path.join(__dirname, 'run-electron.cjs');

const watchTargets = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'assets'),
  browserRoot,
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, 'tsconfig.emit.json'),
  path.join(projectRoot, 'tsconfig.client.json'),
  path.join(projectRoot, 'vite.config.ts'),
];

let electronChild = null;
let shuttingDown = false;
let cycleActive = false;
let restartRequested = false;
let pendingPath = null;
let pendingReason = null;
let pendingBuild = false;
let pendingElectronRestart = false;
let pendingViteRestart = false;
let watcher = null;
let viteDevServer = null;
const {
  displayPath,
  isViteHandledChange,
  requiresBuild,
  requiresViteRestart,
} = createFileChangeClassifier(projectRoot);

function runBuild() {
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('[dev-runtime] Failed to run build:dist:', result.error);
    return 1;
  }

  return result.status ?? 1;
}

function finishCycle() {
  cycleActive = false;

  if (pendingReason) {
    setImmediate(flushPendingChange);
  }
}

function startElectron() {
  electronChild = spawn(process.execPath, [electronScript, '--dev'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DASHBOARD_DEV_SERVER_URL: viteDevServer?.url || process.env.DASHBOARD_DEV_SERVER_URL || 'http://127.0.0.1:3001',
    },
    stdio: 'inherit',
    windowsHide: false,
  });

  electronChild.on('error', (error) => {
    console.error('[dev-runtime] Failed to start Electron:', error);
    process.exit(1);
  });

  electronChild.on('exit', (code) => {
    const shouldRestart = restartRequested && !shuttingDown;

    electronChild = null;
    restartRequested = false;

    if (shouldRestart) {
      startElectron();
      finishCycle();
      return;
    }

    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }

    process.exit(code ?? 0);
  });
}

function requestRestart() {
  if (!electronChild) {
    startElectron();
    finishCycle();
    return;
  }

  restartRequested = true;
  electronChild.kill('SIGTERM');

  setTimeout(() => {
    if (restartRequested && electronChild) {
      electronChild.kill('SIGKILL');
    }
  }, 4000).unref();
}

async function restartViteServer() {
  if (viteDevServer) {
    await viteDevServer.close();
  }

  viteDevServer = await startViteDevServer({ projectRoot });
  await viteDevServer.ready;
  console.log(`[dev-runtime] Vite dev server ready at ${viteDevServer.url}`);
}

async function flushPendingChange() {
  if (cycleActive || !pendingReason) {
    return;
  }

  const reason = pendingReason;
  const needsBuild = pendingBuild;
  const needsElectronRestart = pendingElectronRestart;
  const needsViteRestart = pendingViteRestart;

  pendingPath = null;
  pendingReason = null;
  pendingBuild = false;
  pendingElectronRestart = false;
  pendingViteRestart = false;
  cycleActive = true;

  if (needsBuild) {
    console.log(`[dev-runtime] Rebuilding runtime after ${reason}`);
    const exitCode = runBuild();
    if (exitCode !== 0) {
      console.error('[dev-runtime] Build failed. Waiting for the next change before restarting Electron.');
      finishCycle();
      return;
    }
  }

  if (needsViteRestart) {
    console.log(`[dev-runtime] Restarting Vite after ${reason}`);
    try {
      await restartViteServer();
    } catch (error) {
      console.error('[dev-runtime] Failed to restart Vite:', error);
      finishCycle();
      return;
    }
  }

  if (needsElectronRestart) {
    requestRestart();
    return;
  }

  finishCycle();
}

function queueChange(changedPath) {
  const relativePath = displayPath(changedPath);

  if (requiresBuild(changedPath)) {
    pendingPath = changedPath;
    pendingReason = relativePath;
    pendingBuild = true;
    pendingElectronRestart = true;
    void flushPendingChange();
    return;
  }

  if (requiresViteRestart(changedPath)) {
    pendingPath = changedPath;
    pendingReason = relativePath;
    pendingViteRestart = true;
    void flushPendingChange();
    return;
  }

  if (isViteHandledChange(changedPath)) {
    console.log(`[dev-runtime] Vite handling ${relativePath}`);
  }
}

async function shutdown(signal) {
  shuttingDown = true;

  if (watcher) {
    watcher.close();
  }

  if (viteDevServer) {
    await viteDevServer.close();
    viteDevServer = null;
  }

  if (!electronChild) {
    process.exit(0);
    return;
  }

  restartRequested = false;
  electronChild.kill(signal || 'SIGTERM');
}

async function main() {
  console.log('[dev-runtime] Building initial dist runtime');
  const initialExitCode = runBuild();
  if (initialExitCode !== 0) {
    process.exit(initialExitCode);
  }

  try {
    await restartViteServer();
  } catch (error) {
    console.error('[dev-runtime] Failed to start Vite dev server:', error);
    process.exit(1);
  }

  startElectron();

  watcher = createRecursiveWatcher({
    paths: watchTargets,
    onChange: queueChange,
  });

  console.log('[dev-runtime] Watching src/, assets/, HTML, CSS, and tsconfig files');

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

void main();
