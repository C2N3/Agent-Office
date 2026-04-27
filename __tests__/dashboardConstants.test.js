const path = require('path');
const constants = require('../src/dashboardServer/constants');

describe('dashboard server path constants', () => {
  test('resolve source runtime paths from the current module location', () => {
    const projectRoot = path.resolve(__dirname, '..');

    expect(constants.PROJECT_ROOT).toBe(projectRoot);
    expect(constants.APP_ROOT).toBe(projectRoot);
    expect(constants.ASSET_ROOT).toBe(path.join(projectRoot, 'assets'));
    expect(constants.HTML_FILE).toBe(path.join(projectRoot, 'src', 'browser', 'dashboard.html'));
  });
});
