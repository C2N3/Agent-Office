const path = require('path');
const { pathToFileURL } = require('url');
import {
  isDirectEntrypoint,
  moduleDirname,
  moduleFilename,
  resolveFromModule,
} from '../src/runtime/module';

describe('runtime module helpers', () => {
  const fixturePath = path.join(__dirname, '..', 'src', 'runtime', 'module.ts');
  const fixtureUrl = pathToFileURL(fixturePath);

  test('moduleFilename resolves a file URL to a filesystem path', () => {
    expect(moduleFilename(fixtureUrl)).toBe(fixturePath);
    expect(moduleFilename(fixtureUrl.href)).toBe(fixturePath);
  });

  test('moduleDirname resolves the containing directory for a module URL', () => {
    expect(moduleDirname(fixtureUrl)).toBe(path.dirname(fixturePath));
  });

  test('resolveFromModule resolves relative to the module directory', () => {
    expect(resolveFromModule(fixtureUrl, '..', 'main.ts')).toBe(path.join(__dirname, '..', 'src', 'main.ts'));
  });

  test('isDirectEntrypoint matches direct file-path execution', () => {
    expect(isDirectEntrypoint(fixtureUrl, fixturePath)).toBe(true);
  });

  test('isDirectEntrypoint matches direct file-URL execution', () => {
    expect(isDirectEntrypoint(fixtureUrl, fixtureUrl.href)).toBe(true);
  });

  test('isDirectEntrypoint rejects missing or different entrypoints', () => {
    expect(isDirectEntrypoint(fixtureUrl, undefined)).toBe(false);
    expect(isDirectEntrypoint(fixtureUrl, path.join(__dirname, '..', 'src', 'main.ts'))).toBe(false);
  });
});
