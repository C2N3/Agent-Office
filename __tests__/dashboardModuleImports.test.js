describe('dashboard module imports', () => {
  beforeEach(() => {
    global.localStorage = {
      getItem: jest.fn(() => null),
    };
    global.document = {
      getElementById: jest.fn(() => null),
    };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.document;
  });

  test('avatar picker resolves the shared office module', () => {
    const { setupAvatarPicker } = require('../src/client/dashboard/modals/avatarPicker.ts');

    expect(typeof setupAvatarPicker).toBe('function');
  });
});
