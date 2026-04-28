const path = require('path');

const VITE_HANDLED_FILES = new Set([
  'src/browser/dashboard.html',
  'src/browser/index.html',
  'src/browser/overlay.html',
  'src/browser/pip.html',
  'src/browser/styles.css',
]);
const BUILD_REQUIRED_STATIC_FILES = new Set([
  'src/browser/remote.html',
]);
const VITE_RESTART_FILES = new Set([
  'tsconfig.client.json',
  'vite.config.ts',
]);
const BUILD_EXTENSIONS = new Set([
  '.css',
  '.d.ts',
  '.js',
  '.json',
  '.ts',
]);

function createFileChangeClassifier(projectRoot) {
  function displayPath(targetPath) {
    if (!targetPath) return 'unknown';
    return path.relative(projectRoot, targetPath).replace(/\\/g, '/') || '.';
  }

  function isClientSource(relativePath) {
    return relativePath.startsWith('src/client/')
      || relativePath.startsWith('src/renderer/')
      || relativePath.startsWith('assets/');
  }

  function isViteHandledRelativePath(relativePath) {
    return VITE_HANDLED_FILES.has(relativePath) || isClientSource(relativePath);
  }

  function requiresViteRestartRelativePath(relativePath) {
    return VITE_RESTART_FILES.has(relativePath);
  }

  function isViteHandledChange(targetPath) {
    if (!targetPath) return false;
    return isViteHandledRelativePath(displayPath(targetPath));
  }

  function requiresViteRestart(targetPath) {
    if (!targetPath) return false;
    return requiresViteRestartRelativePath(displayPath(targetPath));
  }

  function requiresBuild(targetPath) {
    if (!targetPath) return true;
    const relativePath = displayPath(targetPath);

    if (requiresViteRestartRelativePath(relativePath) || isViteHandledRelativePath(relativePath)) {
      return false;
    }
    if (BUILD_REQUIRED_STATIC_FILES.has(relativePath)) {
      return true;
    }
    if (relativePath === 'tsconfig.json' || relativePath === 'tsconfig.emit.json') {
      return true;
    }

    const extension = path.extname(relativePath);
    if (!BUILD_EXTENSIONS.has(extension)) {
      return relativePath.startsWith('src/') && !isClientSource(relativePath);
    }

    return relativePath.startsWith('src/') && !isClientSource(relativePath);
  }

  return {
    displayPath,
    isViteHandledChange,
    requiresBuild,
    requiresViteRestart,
  };
}

module.exports = { createFileChangeClassifier };
