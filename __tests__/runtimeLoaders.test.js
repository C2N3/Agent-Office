const {
  loadChildProcess,
  loadPath,
} = require('../src/main/runtimeLoaders');

describe('runtime loaders', () => {
  test('loads child_process through the provided package loader', () => {
    const childProcess = { execFile: jest.fn(), execFileSync: jest.fn() };
    const packageRequire = jest.fn(() => childProcess);

    expect(loadChildProcess(packageRequire)).toBe(childProcess);
    expect(packageRequire).toHaveBeenCalledWith('child_process');
  });

  test('loads path through the provided package loader', () => {
    const pathModule = { join: jest.fn(), dirname: jest.fn() };
    const packageRequire = jest.fn(() => pathModule);

    expect(loadPath(packageRequire)).toBe(pathModule);
    expect(packageRequire).toHaveBeenCalledWith('path');
  });
});
