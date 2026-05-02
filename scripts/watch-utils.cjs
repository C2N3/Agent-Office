#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const IGNORED_SEGMENTS = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);

function hasIgnoredSegment(targetPath) {
  return targetPath.split(path.sep).some((segment) => IGNORED_SEGMENTS.has(segment));
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function collectDirectories(rootPath, directories) {
  const stats = safeStat(rootPath);
  if (!stats || !stats.isDirectory() || hasIgnoredSegment(rootPath)) {
    return;
  }

  directories.add(rootPath);

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    collectDirectories(path.join(rootPath, entry.name), directories);
  }
}

function createRecursiveWatcher({
  paths,
  onChange,
  debounceMs = 150,
}) {
  const normalizedPaths = paths.map((targetPath) => path.resolve(targetPath));
  const directoryWatchers = new Map();
  const fileWatchers = new Map();
  let timer = null;
  let pendingPath = null;

  function scheduleChange(changedPath) {
    pendingPath = changedPath;
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      const nextPath = pendingPath;
      pendingPath = null;
      onChange(nextPath);
    }, debounceMs);
  }

  function refreshDirectoryWatches() {
    const desiredDirectories = new Set();

    for (const targetPath of normalizedPaths) {
      collectDirectories(targetPath, desiredDirectories);
    }

    for (const [watchedPath, watcher] of directoryWatchers.entries()) {
      if (desiredDirectories.has(watchedPath)) {
        continue;
      }

      watcher.close();
      directoryWatchers.delete(watchedPath);
    }

    for (const directoryPath of desiredDirectories) {
      if (directoryWatchers.has(directoryPath)) {
        continue;
      }

      try {
        const watcher = fs.watch(directoryPath, (_eventType, filename) => {
          const changedPath = filename
            ? path.join(directoryPath, filename.toString())
            : directoryPath;

          scheduleChange(changedPath);
          setTimeout(refreshDirectoryWatches, 25);
        });

        watcher.on('error', () => {
          watcher.close();
          directoryWatchers.delete(directoryPath);
          setTimeout(refreshDirectoryWatches, 25);
        });

        directoryWatchers.set(directoryPath, watcher);
      } catch {
        // The directory may disappear between scanning and watch registration.
      }
    }
  }

  function refreshFileWatches() {
    for (const [watchedPath, listener] of fileWatchers.entries()) {
      if (normalizedPaths.includes(watchedPath)) {
        continue;
      }

      fs.unwatchFile(watchedPath, listener);
      fileWatchers.delete(watchedPath);
    }

    for (const targetPath of normalizedPaths) {
      const stats = safeStat(targetPath);
      if (!stats || !stats.isFile() || fileWatchers.has(targetPath)) {
        continue;
      }

      const listener = (currentStats, previousStats) => {
        if (
          currentStats.mtimeMs === previousStats.mtimeMs &&
          currentStats.size === previousStats.size
        ) {
          return;
        }

        scheduleChange(targetPath);
      };

      fs.watchFile(targetPath, { interval: 250 }, listener);
      fileWatchers.set(targetPath, listener);
    }
  }

  refreshDirectoryWatches();
  refreshFileWatches();

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
      }

      for (const watcher of directoryWatchers.values()) {
        watcher.close();
      }
      directoryWatchers.clear();

      for (const [watchedPath, listener] of fileWatchers.entries()) {
        fs.unwatchFile(watchedPath, listener);
      }
      fileWatchers.clear();
    },
  };
}

module.exports = {
  createRecursiveWatcher,
};
