#!/usr/bin/env node

const { spawn } = require('child_process');

// Some shells export ELECTRON_RUN_AS_NODE, which breaks app startup.
delete process.env.ELECTRON_RUN_AS_NODE;

const electronBinary = require('electron');
const electronArgs = ['.', ...process.argv.slice(2)];

const child = spawn(electronBinary, electronArgs, {
  stdio: 'inherit',
  windowsHide: false,
  env: process.env
});

child.on('error', (error) => {
  console.error('[run-electron] Failed to start Electron:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
