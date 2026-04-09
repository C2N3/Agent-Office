#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRecursiveWatcher } = require('./watch-utils');

const projectRoot = path.join(__dirname, '..');
const roots = ['src', 'public'].map((segment) => path.join(projectRoot, segment));
const watchMode = process.argv.includes('--watch');
const watchTargets = [
  ...roots,
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, 'tsconfig.emit.json'),
];
const browserGlobalTargets = [
  'dist/public/dashboardResume.js',
  'dist/src/office/office-character.js',
  'dist/src/office/office-config.js',
  'dist/src/office/office-coords.js',
  'dist/src/office/office-init.js',
  'dist/src/office/office-layers.js',
  'dist/src/office/office-pathfinder.js',
  'dist/src/office/office-renderer.js',
  'dist/src/office/office-sprite.js',
  'dist/src/office/office-ui.js',
];

let buildRunning = false;
let queuedBuild = false;
let watcher = null;

function hasTypeScriptSource(dir) {
  if (!fs.existsSync(dir)) return false;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasTypeScriptSource(fullPath)) return true;
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      return true;
    }
  }

  return false;
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
    const sourcePath = path.join(projectRoot, relativePath);
    const destinationPath = path.join(projectRoot, 'dist', relativePath);
    if (!fs.existsSync(sourcePath)) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, fs.readFileSync(sourcePath));
  }
}

function sanitizeBrowserGlobalOutputs() {
  for (const relativePath of browserGlobalTargets) {
    const outputPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(outputPath)) continue;

    const original = fs.readFileSync(outputPath, 'utf8');
    const sanitized = original
      .replace(/^Object\.defineProperty\(exports,\s*"__esModule",\s*\{\s*value:\s*true\s*\}\);\r?\n/m, '')
      .replace(/\r?\nexport \{\};\s*$/, '\n');

    if (sanitized !== original) {
      fs.writeFileSync(outputPath, sanitized, 'utf8');
    }
  }
}

function buildOnce() {
  if (!roots.some(hasTypeScriptSource)) {
    return 0;
  }

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

  if ((result.status ?? 1) === 0) {
    copyTargetsToDist();
    sanitizeBrowserGlobalOutputs();
  }

  return result.status ?? 0;
}

function runWatchedBuild(triggerPath = 'initial build') {
  if (buildRunning) {
    queuedBuild = true;
    return;
  }

  buildRunning = true;
  const status = buildOnce();
  if (status === 0) {
    console.log(`[build-types] Build complete: ${triggerPath}`);
  }
  buildRunning = false;

  if (queuedBuild) {
    queuedBuild = false;
    runWatchedBuild('queued changes');
  }
}

function shutdown() {
  if (watcher) {
    watcher.close();
  }
  process.exit(0);
}

if (!watchMode) {
  process.exit(buildOnce());
}

runWatchedBuild();

watcher = createRecursiveWatcher({
  paths: watchTargets,
  onChange: (changedPath) => {
    const relativePath = path.relative(projectRoot, changedPath).replace(/\\/g, '/');
    runWatchedBuild(relativePath || '.');
  },
});

console.log('[build-types] Watching src/, public/, and tsconfig files');

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
