#!/usr/bin/env node

const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createRecursiveWatcher } = require('./watch-utils');
const { startRendererDevServer } = require('./renderer-dev-server');

const projectRoot = path.join(__dirname, '..');
const buildScript = path.join(__dirname, 'build-types.js');
const electronScript = path.join(__dirname, 'run-electron.js');

const STATIC_ONLY_FILES = new Set([
  'dashboard.html',
  'index.html',
  'pip.html',
  'styles.css',
]);
const RENDERER_STATIC_ONLY_FILES = new Set([
  'dashboard.html',
  'pip.html',
]);

const BUILD_EXTENSIONS = new Set([
  '.d.ts',
  '.js',
  '.json',
  '.ts',
]);

const watchTargets = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'public'),
  path.join(projectRoot, 'dashboard.html'),
  path.join(projectRoot, 'index.html'),
  path.join(projectRoot, 'pip.html'),
  path.join(projectRoot, 'styles.css'),
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, 'tsconfig.emit.json'),
];

let electronChild = null;
let shuttingDown = false;
let cycleActive = false;
let restartRequested = false;
let pendingPath = null;
let pendingReason = null;
let pendingBuild = false;
let pendingAction = null;
let pendingReloadType = null;
let watcher = null;
let rendererDevServer = null;

function displayPath(targetPath) {
  if (!targetPath) {
    return 'unknown';
  }

  return path.relative(projectRoot, targetPath).replace(/\\/g, '/') || '.';
}

function requiresBuild(targetPath) {
  if (!targetPath) {
    return true;
  }

  const relativePath = displayPath(targetPath);
  if (STATIC_ONLY_FILES.has(relativePath)) {
    return false;
  }

  if (relativePath === 'tsconfig.json' || relativePath === 'tsconfig.emit.json') {
    return true;
  }

  const extension = path.extname(relativePath);
  if (!BUILD_EXTENSIONS.has(extension)) {
    return false;
  }

  return relativePath.startsWith('src/') || relativePath.startsWith('public/');
}

function isRendererOnlyChange(targetPath) {
  if (!targetPath) {
    return false;
  }

  const relativePath = displayPath(targetPath);
  if (RENDERER_STATIC_ONLY_FILES.has(relativePath)) {
    return true;
  }

  return relativePath.startsWith('public/') || relativePath.startsWith('src/office/');
}

function getReloadType(targetPath) {
  const relativePath = displayPath(targetPath);
  if (relativePath.endsWith('.css')) {
    return 'css-update';
  }
  return 'full-reload';
}

function getReloadPath(targetPath) {
  const relativePath = displayPath(targetPath);
  if (relativePath === 'dashboard.html') {
    return '/';
  }
  if (relativePath === 'pip.html') {
    return '/pip';
  }
  if (relativePath === 'overlay.html') {
    return '/overlay';
  }
  if (relativePath.startsWith('public/')) {
    return `/${relativePath}`;
  }
  return null;
}

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
      DASHBOARD_DEV_SERVER_URL: rendererDevServer?.url || process.env.DASHBOARD_DEV_SERVER_URL || 'http://localhost:3001',
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

function flushPendingChange() {
  if (cycleActive || !pendingReason || !pendingAction) {
    return;
  }

  const reason = pendingReason;
  const changedPath = pendingPath;
  const needsBuild = pendingBuild;
  const action = pendingAction;
  const reloadType = pendingReloadType;

  pendingPath = null;
  pendingReason = null;
  pendingBuild = false;
  pendingAction = null;
  pendingReloadType = null;
  cycleActive = true;

  if (needsBuild) {
    console.log(`[dev-runtime] Rebuilding runtime after ${reason}`);
    const exitCode = runBuild();
    if (exitCode !== 0) {
      console.error('[dev-runtime] Build failed. Waiting for the next change before restarting Electron.');
      finishCycle();
      return;
    }
  } else if (action === 'restart') {
    console.log(`[dev-runtime] Restarting Electron after ${reason}`);
  } else {
    console.log(`[dev-runtime] Refreshing renderer after ${reason}`);
  }

  if (action === 'reload') {
    rendererDevServer?.broadcastUpdate({
      path: getReloadPath(changedPath),
      type: reloadType || 'full-reload',
    });
    finishCycle();
    return;
  }

  requestRestart();
}

function queueChange(changedPath) {
  pendingPath = changedPath;
  pendingReason = displayPath(changedPath);
  pendingBuild = pendingBuild || requiresBuild(changedPath);
  if (isRendererOnlyChange(changedPath) && pendingAction !== 'restart') {
    pendingAction = 'reload';
    const nextReloadType = getReloadType(changedPath);
    pendingReloadType = pendingReloadType === 'full-reload' || nextReloadType === 'full-reload'
      ? 'full-reload'
      : nextReloadType;
  } else {
    pendingAction = 'restart';
    pendingReloadType = null;
  }
  flushPendingChange();
}

function shutdown(signal) {
  shuttingDown = true;

  if (watcher) {
    watcher.close();
  }

  if (rendererDevServer) {
    rendererDevServer.close();
    rendererDevServer = null;
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

  rendererDevServer = startRendererDevServer({ projectRoot });
  try {
    await rendererDevServer.ready;
  } catch (error) {
    console.error('[dev-runtime] Failed to start renderer dev server:', error);
    process.exit(1);
  }

  console.log(`[dev-runtime] Renderer dev server ready at ${rendererDevServer.url}`);

  startElectron();

  watcher = createRecursiveWatcher({
    paths: watchTargets,
    onChange: queueChange,
  });

  console.log('[dev-runtime] Watching src/, public/, HTML, CSS, and tsconfig files');

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
