import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { hasViteAssetQuery } from './scripts/vite-asset-query.js';
import { resolveBrowserEntryPath } from './scripts/vite-browser-routes.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(projectRoot, 'assets');

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveAssetPath(requestPath: string): string | null {
  const relativePath = decodeURIComponent(requestPath.replace(/^\/assets\//, ''));
  const resolvedPath = path.resolve(assetRoot, relativePath);
  const rel = path.relative(assetRoot, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolvedPath;
}

function browserContractPlugin(): Plugin {
  return {
    name: 'agent-office-browser-contract',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const pathname = requestUrl.pathname;
        const entryPath = resolveBrowserEntryPath(pathname);

        if (entryPath) {
          req.url = `${entryPath}${requestUrl.search}`;
          next();
          return;
        }

        if (!pathname.startsWith('/assets/')) {
          next();
          return;
        }

        if (hasViteAssetQuery(requestUrl.searchParams)) {
          next();
          return;
        }

        const assetPath = resolveAssetPath(pathname);
        if (!assetPath || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', MIME_TYPES[path.extname(assetPath)] || 'application/octet-stream');
        fs.createReadStream(assetPath).pipe(res);
      });
    },
    handleHotUpdate(context) {
      if (context.file.startsWith(assetRoot)) {
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
      return undefined;
    },
  };
}

export default defineConfig(({ command }) => ({
  appType: 'mpa',
  base: command === 'build' ? './' : '/',
  publicDir: false,
  plugins: [
    react(),
    browserContractPlugin(),
  ],
  resolve: {
    alias: {
      '@client': path.join(projectRoot, 'src', 'client'),
      '@shared': path.join(projectRoot, 'src', 'shared'),
    },
  },
  build: {
    assetsDir: 'assets/client',
    emptyOutDir: false,
    outDir: 'dist',
    rollupOptions: {
      input: {
        dashboard: path.join(projectRoot, 'dashboard.html'),
        index: path.join(projectRoot, 'index.html'),
        overlay: path.join(projectRoot, 'overlay.html'),
        pip: path.join(projectRoot, 'pip.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.DASHBOARD_DEV_SERVER_PORT || 3001),
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/lib': 'http://127.0.0.1:3000',
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
    },
  },
}));
