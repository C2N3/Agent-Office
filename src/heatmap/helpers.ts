// @ts-nocheck
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexSessionRoots } = require('../main/codexPaths');
const { pruneOldDays, savePersisted, loadPersisted } = require('./persistence');
const { scanFile } = require('./scan/file');

function listJsonlFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getRoots() {
  const roots = [];
  const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeRoot)) {
    roots.push(claudeRoot);
  }
  const codexEnv = process.env.NODE_ENV === 'test' ? {} : process.env;
  for (const codexRoot of getCodexSessionRoots({ env: codexEnv, homedir: os.homedir() })) {
    roots.push(codexRoot);
  }
  return roots;
}

module.exports = {
  getRoots,
  listJsonlFiles,
  scanFile,
  pruneOldDays,
  savePersisted,
  loadPersisted,
};
