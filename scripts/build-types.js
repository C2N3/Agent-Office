#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [
  path.join(__dirname, '..', 'src', 'main', 'eventProcessor'),
  path.join(__dirname, '..', 'src', 'dashboardServer'),
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

const tscPath = path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.emit.json'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

if (result.error) {
  console.error('[build-types] Failed to execute TypeScript compiler:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
