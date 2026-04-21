const { resolveBrowserEntryPath } = require('../scripts/vite-browser-routes.ts');

describe('vite browser routes', () => {
  test('serves the dashboard at the dev server root', () => {
    expect(resolveBrowserEntryPath('/')).toBe('/dashboard.html');
  });

  test('keeps the Electron main renderer entry explicit', () => {
    expect(resolveBrowserEntryPath('/index.html')).toBeNull();
  });

  test('serves auxiliary windows on slash routes', () => {
    expect(resolveBrowserEntryPath('/pip')).toBe('/pip.html');
    expect(resolveBrowserEntryPath('/overlay')).toBe('/overlay.html');
  });
});
