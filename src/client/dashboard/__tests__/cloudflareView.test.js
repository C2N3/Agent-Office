describe('cloudflare tunnel adapter', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('fetches tunnel status without caching', async () => {
    const status = {
      running: true,
      url: 'https://example.trycloudflare.com',
      error: null,
      startedAt: 123,
      cloudflaredFound: true,
      token: 'configured',
    };
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => status,
    }));

    const { fetchCloudflareTunnelStatus } = require('../cloudflareView.ts');

    await expect(fetchCloudflareTunnelStatus()).resolves.toBe(status);
    expect(global.fetch).toHaveBeenCalledWith('/api/tunnel', { cache: 'no-store' });
  });

  test('posts start and stop actions through the tunnel API', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    }));

    const { startCloudflareTunnel, stopCloudflareTunnel } = require('../cloudflareView.ts');

    await startCloudflareTunnel();
    await stopCloudflareTunnel();

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/tunnel/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/tunnel/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('surfaces API errors from tunnel actions', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'already running' }),
    }));

    const { startCloudflareTunnel } = require('../cloudflareView.ts');

    await expect(startCloudflareTunnel()).rejects.toThrow('already running');
  });
});
