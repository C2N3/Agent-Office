const path = require('path');
const { createFileChangeClassifier } = require('../scripts/dev-runtime/file-change');

describe('dev-runtime file-change classifier', () => {
  const projectRoot = path.join(__dirname, '..');
  const classifier = createFileChangeClassifier(projectRoot);

  test('lets Vite handle browser source, assets, and html changes without a dist rebuild', () => {
    expect(classifier.isViteHandledChange(path.join(projectRoot, 'src/client/dashboard.ts'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'src/client/dashboard.ts'))).toBe(false);
    expect(classifier.isViteHandledChange(path.join(projectRoot, 'src/renderer/init.ts'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'src/renderer/init.ts'))).toBe(false);
    expect(classifier.isViteHandledChange(path.join(projectRoot, 'assets/shared/avatars.json'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'assets/shared/avatars.json'))).toBe(false);
    expect(classifier.isViteHandledChange(path.join(projectRoot, 'index.html'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'index.html'))).toBe(false);
    expect(classifier.isViteHandledChange(path.join(projectRoot, 'dashboard.html'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'dashboard.html'))).toBe(false);
  });

  test('keeps runtime-only entrypoints on the dist rebuild path', () => {
    expect(classifier.requiresBuild(path.join(projectRoot, 'src/main/windowing/core.ts'))).toBe(true);
    expect(classifier.requiresBuild(path.join(projectRoot, 'remote.html'))).toBe(true);
  });

  test('marks Vite config changes for a Vite restart without rebuilding dist', () => {
    const viteConfigPath = path.join(projectRoot, 'vite.config.ts');
    expect(classifier.requiresViteRestart(viteConfigPath)).toBe(true);
    expect(classifier.requiresBuild(viteConfigPath)).toBe(false);
  });
});
