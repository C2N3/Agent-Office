const { startViteDevServer } = require('../scripts/vite-dev-server');

describe('vite-dev-server', () => {
  test('starts the Vite server with the repo config and exposes the resolved URL', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const listen = jest.fn().mockResolvedValue(undefined);
    const createServer = jest.fn().mockResolvedValue({
      close,
      listen,
      resolvedUrls: {
        local: ['http://127.0.0.1:3001/'],
      },
    });

    const server = await startViteDevServer({
      createServer,
      projectRoot: '/workspace/app',
    });
    await server.ready;

    expect(createServer).toHaveBeenCalledWith(expect.objectContaining({
      configFile: '/workspace/app/vite.config.ts',
      server: expect.objectContaining({
        host: '127.0.0.1',
        port: 3001,
        strictPort: true,
      }),
    }));
    expect(listen).toHaveBeenCalledTimes(1);
    expect(server.url).toBe('http://127.0.0.1:3001');

    await server.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
