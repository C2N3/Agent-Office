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

  test('avatar picker modal resolves the shared office module', () => {
    const { AvatarPickerModal } = require('../src/client/dashboard/react/avatarPickerModal.tsx');

    expect(typeof AvatarPickerModal).toBe('function');
  });
});
