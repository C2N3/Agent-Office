const path = require('path');

const STATIC_ONLY_FILES = new Set([
  'dashboard.html',
  'index.html',
  'pip.html',
  'styles.css',
]);
const RENDERER_STATIC_ONLY_FILES = new Set([
  'dashboard.html',
  'pip.html',
]);
const BUILD_EXTENSIONS = new Set([
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

  function requiresBuild(targetPath) {
    if (!targetPath) return true;
    const relativePath = displayPath(targetPath);
    if (STATIC_ONLY_FILES.has(relativePath)) return false;
    if (relativePath === 'tsconfig.json' || relativePath === 'tsconfig.emit.json') return true;

    const extension = path.extname(relativePath);
    if (!BUILD_EXTENSIONS.has(extension)) return false;
    return relativePath.startsWith('src/') || relativePath.startsWith('public/');
  }

  function isRendererOnlyChange(targetPath) {
    if (!targetPath) return false;
    const relativePath = displayPath(targetPath);
    if (RENDERER_STATIC_ONLY_FILES.has(relativePath)) return true;
    return relativePath.startsWith('public/');
  }

  function getReloadType(targetPath) {
    return displayPath(targetPath).endsWith('.css') ? 'css-update' : 'full-reload';
  }

  function getReloadPath(targetPath) {
    const relativePath = displayPath(targetPath);
    if (relativePath === 'dashboard.html') return '/';
    if (relativePath === 'pip.html') return '/pip';
    if (relativePath === 'overlay.html') return '/overlay';
    if (relativePath.startsWith('public/')) return `/${relativePath}`;
    return null;
  }

  return {
    displayPath,
    getReloadPath,
    getReloadType,
    isRendererOnlyChange,
    requiresBuild,
  };
}

module.exports = { createFileChangeClassifier };
