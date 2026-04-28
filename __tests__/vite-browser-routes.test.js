import {
  resolveBrowserEntryPath,
  resolveBrowserSourceModuleFilePath,
  resolveBrowserSourceModulePath,
} from '../scripts/vite-browser-routes.ts';

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

  test('maps browser-relative source module URLs outside the browser root to Vite fs URLs', () => {
    expect(resolveBrowserSourceModuleFilePath('/client/dashboard.ts', '/workspace/app'))
      .toBe('/workspace/app/src/client/dashboard.ts');
    expect(resolveBrowserSourceModulePath('/client/dashboard.ts', '/workspace/app'))
      .toBe('/@fs//workspace/app/src/client/dashboard.ts');
    expect(resolveBrowserSourceModulePath('/renderer/init.ts', '/workspace/app'))
      .toBe('/@fs//workspace/app/src/renderer/init.ts');
    expect(resolveBrowserSourceModulePath('/shared/contracts/ipc.ts', '/workspace/app'))
      .toBe('/@fs//workspace/app/src/shared/contracts/ipc.ts');
  });

  test('rejects source module traversal attempts', () => {
    expect(resolveBrowserSourceModulePath('/client/../main.ts', '/workspace/app')).toBeNull();
  });
});
