#!/usr/bin/env node

const path = require('path');

async function startViteDevServer({
  host = '127.0.0.1',
  port = Number(process.env.DASHBOARD_DEV_SERVER_PORT || 3001),
  projectRoot = path.join(__dirname, '..'),
  createServer: providedCreateServer,
} = {}) {
  const createServer = providedCreateServer || (await import('vite')).createServer;
  const server = await createServer({
    configFile: path.join(projectRoot, 'vite.config.ts'),
    server: {
      host,
      port,
      strictPort: true,
    },
  });

  await server.listen();

  const resolvedUrl = server.resolvedUrls?.local?.[0] || `http://${host}:${port}/`;

  return {
    url: resolvedUrl.replace(/\/$/, ''),
    ready: Promise.resolve(),
    async close() {
      await server.close();
    },
  };
}

module.exports = {
  startViteDevServer,
};

if (require.main === module) {
  startViteDevServer()
    .then(({ url }) => {
      console.log(`[vite-dev-server] ready at ${url}`);
    })
    .catch((error) => {
      console.error('[vite-dev-server] Failed to start:', error);
      process.exit(1);
    });
}
