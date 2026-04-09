#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'public'),
];

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

if (!roots.some(hasTypeScriptSource)) {
  process.exit(0);
}

const tsgoPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@typescript',
  'native-preview',
  'bin',
  'tsgo.js',
);
const result = spawnSync(process.execPath, [tsgoPath, '-p', 'tsconfig.emit.json'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

if (result.error) {
  console.error('[build-types] Failed to execute tsgo:', result.error);
  process.exit(1);
}

const copyTargets = [
  'src/dashboardAdapter.js',
  'src/officeLayout.js',
  'src/utils.js',
  'src/pricing.js',
  'src/main/agentRegistry.js',
  'src/main/conversationParser.js',
];

for (const relativePath of copyTargets) {
  const sourcePath = path.join(__dirname, '..', relativePath);
  const destinationPath = path.join(__dirname, '..', 'dist', relativePath);
  if (!fs.existsSync(sourcePath)) continue;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, fs.readFileSync(sourcePath));
}

process.exit(result.status ?? 0);
