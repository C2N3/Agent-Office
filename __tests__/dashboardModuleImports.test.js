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

  test('create agent modal resolves', () => {
    const { CreateAgentModal } = require('../src/client/dashboard/react/createAgentModal/index.tsx');

    expect(typeof CreateAgentModal).toBe('function');
  });
});
