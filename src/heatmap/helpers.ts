import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCodexSessionRoots } from '../main/providers/codex/paths.js';
import { loadPersisted, pruneOldDays, savePersisted } from './persistence.js';
import { scanFile } from './scan/file.js';

export function listJsonlFiles(dir) {
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

export function getRoots() {
  const roots = [];
  const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeRoot)) {
    roots.push(claudeRoot);
  }
  const codexEnv = process.env.NODE_ENV === 'test' ? {} : process.env;
  for (const codexRoot of getCodexSessionRoots({
    env: codexEnv,
    homedir: os.homedir(),
    wslRoot: process.env.NODE_ENV === 'test' ? null : undefined,
  })) {
    roots.push(codexRoot);
  }
  return roots;
}

export {
  scanFile,
  pruneOldDays,
  savePersisted,
  loadPersisted,
};
