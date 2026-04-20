#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const { createRecursiveWatcher } = require('./watch-utils');

const projectRoot = path.join(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const srcRoot = path.join(projectRoot, 'src');
const assetsRoot = path.join(projectRoot, 'assets');
const watchMode = process.argv.includes('--watch');
const watchTargets = [
  srcRoot,
  assetsRoot,
  path.join(projectRoot, 'dashboard.html'),
  path.join(projectRoot, 'index.html'),
  path.join(projectRoot, 'overlay.html'),
  path.join(projectRoot, 'pip.html'),
  path.join(projectRoot, 'remote.html'),
  path.join(projectRoot, 'styles.css'),
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, 'tsconfig.emit.json'),
  path.join(projectRoot, 'tsconfig.client.json'),
  path.join(projectRoot, 'vite.config.ts'),
];
const rendererEntryPoints = [
  path.join(projectRoot, 'src', 'renderer', 'init.ts'),
];
const runtimeFiles = [
  'index.html',
  'remote.html',
  'styles.css',
];

let buildRunning = false;
let queuedBuild = false;
let watcher = null;

function copyFile(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) return;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, fs.readFileSync(sourcePath));
}

function copyDirectory(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (!entry.isFile()) continue;
    copyFile(sourcePath, destinationPath);
  }
}

function cleanBrowserOutputs() {
  const cleanupTargets = [
    path.join(distRoot, 'public'),
    path.join(distRoot, 'src', 'client'),
    path.join(distRoot, 'src', 'office'),
    path.join(distRoot, 'src', 'renderer'),
    path.join(distRoot, 'assets'),
    path.join(distRoot, 'dashboard.html'),
    path.join(distRoot, 'overlay.html'),
    path.join(distRoot, 'pip.html'),
  ];

  for (const targetPath of cleanupTargets) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
}

function copyTargetsToDist() {
  const copyTargets = [
    'src/dashboardAdapter.js',
    'src/officeLayout.js',
    'src/utils.js',
    'src/pricing.js',
    'src/main/agentRegistry.js',
    'src/main/conversationParser.js',
  ];

  for (const relativePath of copyTargets) {
    copyFile(
      path.join(projectRoot, relativePath),
      path.join(distRoot, relativePath),
    );
  }
}

function copyRuntimeFilesToDist() {
  for (const relativePath of runtimeFiles) {
    copyFile(
      path.join(projectRoot, relativePath),
      path.join(distRoot, relativePath),
    );
  }
}

function copyAssetsToDist() {
  copyDirectory(assetsRoot, path.join(distRoot, 'assets'));
}

function copyRendererStylesToDist() {
  copyDirectory(
    path.join(srcRoot, 'renderer', 'styles'),
    path.join(distRoot, 'src', 'renderer', 'styles'),
  );
}

async function buildClientEntries() {
  try {
    const { build } = await import('vite');
    await build({
      configFile: path.join(projectRoot, 'vite.config.ts'),
      mode: 'production',
    });
    return 0;
  } catch (error) {
    console.error('[build-types] Vite build failed:', error);
    return 1;
  }
}

async function buildRendererEntry() {
  const result = await esbuild.build({
    bundle: true,
    entryPoints: rendererEntryPoints,
    entryNames: '[dir]/[name]',
    format: 'esm',
    jsx: 'automatic',
    legalComments: 'none',
    loader: {
      '.json': 'json',
    },
    logLevel: 'silent',
    outbase: projectRoot,
    outdir: distRoot,
    platform: 'browser',
    target: ['es2022'],
    write: true,
  });

  return result.errors?.length ? 1 : 0;
}

async function buildOnce() {
  const tsgoPath = path.join(
    projectRoot,
    'node_modules',
    '@typescript',
    'native-preview',
    'bin',
    'tsgo.js',
  );

  const result = spawnSync(process.execPath, [tsgoPath, '-p', 'tsconfig.emit.json'], {
    stdio: 'inherit',
    cwd: projectRoot,
  });

  if (result.error) {
    console.error('[build-types] Failed to execute tsgo:', result.error);
    return 1;
  }

  if ((result.status ?? 1) !== 0) {
    return result.status ?? 1;
  }

  cleanBrowserOutputs();
  copyTargetsToDist();
  copyRuntimeFilesToDist();
  copyAssetsToDist();
  copyRendererStylesToDist();

  const clientBuildStatus = await buildClientEntries();
  if (clientBuildStatus !== 0) {
    return clientBuildStatus;
  }

  const rendererBuildStatus = await buildRendererEntry();
  if (rendererBuildStatus !== 0) {
    return rendererBuildStatus;
  }

  return 0;
}

async function runWatchedBuild(triggerPath = 'initial build') {
  if (buildRunning) {
    queuedBuild = true;
    return;
  }

  buildRunning = true;
  const status = await buildOnce();
  if (status === 0) {
    console.log(`[build-types] Build complete: ${triggerPath}`);
  }
  buildRunning = false;

  if (queuedBuild) {
    queuedBuild = false;
    void runWatchedBuild('queued changes');
  }
}

function shutdown() {
  if (watcher) {
    watcher.close();
  }
  process.exit(0);
}

if (!watchMode) {
  buildOnce()
    .then((status) => {
      process.exit(status);
    })
    .catch((error) => {
      console.error('[build-types] Build failed:', error);
      process.exit(1);
    });
} else {
  void runWatchedBuild();

  watcher = createRecursiveWatcher({
    paths: watchTargets,
    onChange: (changedPath) => {
      const relativePath = path.relative(projectRoot, changedPath).replace(/\\/g, '/');
      void runWatchedBuild(relativePath || '.');
    },
  });

  console.log('[build-types] Watching src/, assets/, HTML, CSS, and tsconfig files');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
