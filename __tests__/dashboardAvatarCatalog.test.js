describe('dashboard avatar catalog', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('updates shared avatar arrays in place for already loaded card renderers', () => {
    const catalog = require('../src/client/dashboard/avatarCatalog.ts');
    const filesReference = catalog.SHARED_AVATAR_FILES;
    const dataReference = catalog.SHARED_AVATAR_DATA;

    catalog.setSharedAvatarData({
      categories: [{ name: 'Custom', files: ['Custom/New.webp'] }],
      allFiles: ['Custom/New.webp'],
    });

    expect(catalog.SHARED_AVATAR_FILES).toBe(filesReference);
    expect(catalog.SHARED_AVATAR_DATA).toBe(dataReference);
    expect(filesReference).toEqual(['Custom/New.webp']);
    expect(dataReference.allFiles).toBe(filesReference);
    expect(dataReference.categories).toEqual([{ name: 'Custom', files: ['Custom/New.webp'] }]);
  });

  test('merges live character files into the dashboard avatar catalog', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/assets/shared/avatars.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: [{ name: 'Origin', files: ['Origin/avatar_0.webp'] }],
            allFiles: ['Origin/avatar_0.webp'],
          }),
        });
      }
      if (url === '/api/avatars') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            categories: [
              { name: 'Origin', files: ['Origin/avatar_0.webp'] },
              { name: 'Custom', files: ['Custom/New.webp'] },
            ],
            allFiles: ['Origin/avatar_0.webp', 'Custom/New.webp'],
          }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const { refreshSharedAvatarData, SHARED_AVATAR_FILES } = require('../src/client/dashboard/avatarCatalog.ts');

    const result = await refreshSharedAvatarData();

    expect(SHARED_AVATAR_FILES).toEqual(['Origin/avatar_0.webp', 'Custom/New.webp']);
    expect(result.allFiles).toBe(SHARED_AVATAR_FILES);
    expect(result.categories).toEqual([
      { name: 'Origin', files: ['Origin/avatar_0.webp'] },
      { name: 'Custom', files: ['Custom/New.webp'] },
    ]);
  });
});
