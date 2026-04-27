#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRecursiveWatcher } = require('./watch-utils.cjs');

const projectRoot = path.join(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const srcRoot = path.join(projectRoot, 'src');
const browserRoot = path.join(srcRoot, 'browser');
const assetsRoot = path.join(projectRoot, 'assets');
const watchMode = process.argv.includes('--watch');
const watchTargets = [
  srcRoot,
  assetsRoot,
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, 'tsconfig.emit.json'),
  path.join(projectRoot, 'tsconfig.client.json'),
  path.join(projectRoot, 'vite.config.ts'),
];
const runtimeFiles = [
  { source: path.join(browserRoot, 'remote.html'), destination: path.join(distRoot, 'remote.html') },
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
    path.join(distRoot, 'src', 'browser'),
    path.join(distRoot, 'src', 'office'),
    path.join(distRoot, 'src', 'renderer'),
    path.join(distRoot, 'assets'),
    path.join(distRoot, 'index.html'),
    path.join(distRoot, 'dashboard.html'),
    path.join(distRoot, 'overlay.html'),
    path.join(distRoot, 'pip.html'),
    path.join(distRoot, 'taskChat.html'),
    path.join(distRoot, 'styles.css'),
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
  for (const { source, destination } of runtimeFiles) {
    copyFile(source, destination);
  }
}

function copyAssetsToDist() {
  copyDirectory(assetsRoot, path.join(distRoot, 'assets'));
}

function resolveEmittedRelativeSpecifier(sourceFile, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
  if (path.extname(specifier)) return specifier;

  const absoluteBase = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    { file: `${absoluteBase}.js`, suffix: '.js' },
    { file: `${absoluteBase}.mjs`, suffix: '.mjs' },
    { file: path.join(absoluteBase, 'index.js'), suffix: '/index.js' },
    { file: path.join(absoluteBase, 'index.mjs'), suffix: '/index.mjs' },
  ];

  const match = candidates.find(({ file }) => fs.existsSync(file));
  return match ? `${specifier}${match.suffix}` : specifier;
}

function rewriteEmittedRelativeSpecifiers(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rewritten = source.replace(
    /\b(from\s*|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+?)\2/g,
    (match, prefix, quote, specifier) => {
      const resolved = resolveEmittedRelativeSpecifier(filePath, specifier);
      return `${prefix}${quote}${resolved}${quote}`;
    },
  );

  if (rewritten !== source) {
    fs.writeFileSync(filePath, rewritten);
  }
}

function rewriteEmittedRuntimeImports(directory = path.join(distRoot, 'src')) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteEmittedRuntimeImports(entryPath);
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      rewriteEmittedRelativeSpecifiers(entryPath);
    }
  }
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

function getNativePreviewPackageName() {
  const platformMap = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'win32',
  };
  const archMap = {
    arm: 'arm',
    arm64: 'arm64',
    x64: 'x64',
  };
  const platform = platformMap[process.platform];
  const arch = archMap[process.arch];
  return platform && arch ? `native-preview-${platform}-${arch}` : null;
}

function hasLocalTsgoRuntime() {
  const packageName = getNativePreviewPackageName();
  return Boolean(
    packageName &&
      fs.existsSync(path.join(projectRoot, 'node_modules', '@typescript', packageName)),
  );
}

function runTypeScriptBuild() {
  const tsgoPath = path.join(
    projectRoot,
    'node_modules',
    '@typescript',
    'native-preview',
    'bin',
    'tsgo.js',
  );

  const command = hasLocalTsgoRuntime() ? process.execPath : 'tsgo';
  const args = hasLocalTsgoRuntime() ? [tsgoPath, '-p', 'tsconfig.emit.json'] : ['-p', 'tsconfig.emit.json'];
  const env = { ...process.env };
  if (command === 'tsgo') {
    const localBin = path.join(projectRoot, 'node_modules', '.bin');
    env.PATH = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((entry) => path.resolve(entry) !== localBin)
      .join(path.delimiter);
  }

  return spawnSync(command, args, {
    stdio: 'inherit',
    cwd: projectRoot,
    env,
    shell: process.platform === 'win32' && command === 'tsgo',
  });
}

async function buildOnce() {
  const result = runTypeScriptBuild();

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
  rewriteEmittedRuntimeImports();

  const clientBuildStatus = await buildClientEntries();
  if (clientBuildStatus !== 0) {
    return clientBuildStatus;
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
