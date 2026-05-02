import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { APP_ROOT, ASSET_ROOT, HTML_FILE, MIME_TYPES, OVERLAY_FILE, PIP_FILE, REMOTE_FILE, TASK_CHAT_FILE } from './constants';
import {
  apiRoutes,
  handleAgentApiRoute,
  handleGetOfficeLayoutAsset,
  handleGetOfficeTilemap,
  handlePutOfficeTilemap,
  handleCreateOfficeTilemap,
  handleTaskApiRoute,
} from './apiHandlers';
import { handleCentralServerRoute } from './centralServerProxy';
import { extractToken, isValidToken } from './remoteAuth';
import { handleGetTunnel, handleStartTunnel, handleStopTunnel } from './tunnelHandlers';

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  setHeader(name: string, value: string): void;
}

interface RequestLike {
  method?: string;
  url?: string;
  headers: { host?: string };
}

function serveFile(
  res: ResponseLike,
  filePath: string,
  contentType: string,
  cacheControl?: string,
  errorStatus = 404,
): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(errorStatus, { 'Content-Type': 'text/plain' });
      res.end(errorStatus === 500 ? 'Internal Server Error' : 'Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      ...(cacheControl ? { 'Cache-Control': cacheControl } : {}),
    });
    res.end(data);
  });
}

function resolveStaticAssetPath(pathname: string): string | null {
  const relativeAssetPath = decodeURIComponent(pathname.slice('/assets/'.length));
  const resolved = path.resolve(ASSET_ROOT, relativeAssetPath);
  const rel = path.relative(ASSET_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

function handleRequest(req: RequestLike, res: ResponseLike): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    handleAPIRequest(req, res, url);
    return;
  }

  if (pathname === '/ws') {
    res.writeHead(426);
    res.end('WebSocket connection required');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, HTML_FILE, 'text/html; charset=utf-8', undefined, 500);
    return;
  }
  if (pathname === '/remote') {
    serveFile(res, REMOTE_FILE, 'text/html; charset=utf-8', undefined, 500);
    return;
  }
  if (pathname === '/pip') {
    serveFile(res, PIP_FILE, 'text/html; charset=utf-8', undefined, 500);
    return;
  }
  if (pathname === '/overlay') {
    serveFile(res, OVERLAY_FILE, 'text/html; charset=utf-8', undefined, 500);
    return;
  }
  if (pathname === '/task-chat') {
    serveFile(res, TASK_CHAT_FILE, 'text/html; charset=utf-8', undefined, 500);
    return;
  }

  if (pathname.startsWith('/lib/')) {
    const libMap: Record<string, string> = {
      '/lib/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
      '/lib/xterm.js.map': 'node_modules/@xterm/xterm/lib/xterm.js.map',
      '/lib/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
      '/lib/xterm-addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
      '/lib/addon-fit.js.map': 'node_modules/@xterm/addon-fit/lib/addon-fit.js.map',
      '/lib/xterm-addon-web-links.js': 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js',
      '/lib/addon-web-links.js.map': 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js.map',
      '/lib/marked.umd.js': 'node_modules/marked/lib/marked.umd.js',
    };
    const mapped = libMap[pathname];
    if (mapped) {
      const filePath = path.join(APP_ROOT, mapped);
      serveFile(res, filePath, MIME_TYPES[path.extname(filePath)] || 'application/octet-stream', 'no-cache');
      return;
    }
  }

  if (pathname.startsWith('/assets/')) {
    const assetPath = resolveStaticAssetPath(pathname);
    if (!assetPath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    serveFile(res, assetPath, MIME_TYPES[path.extname(assetPath)] || 'application/octet-stream', 'no-cache');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

const WRITE_METHODS = new Set(['POST', 'DELETE', 'PATCH', 'PUT']);

function handleAPIRequest(req: RequestLike, res: ResponseLike, url: URL): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Remote-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (WRITE_METHODS.has(req.method || '') && url.pathname !== '/api/health') {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
      const token = extractToken(req);
      if (!isValidToken(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: valid token required for write operations' }));
        return;
      }
    }
  }

  const routeKey = `${req.method} ${url.pathname}`;
  if (handleCentralServerRoute(req as any, res as any, url)) return;

  const handler = apiRoutes[routeKey as keyof typeof apiRoutes];
  if (handler) {
    handler(req as any, res as any, url);
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/office-layout/assets/')) {
    handleGetOfficeLayoutAsset(req as any, res as any, url);
    return;
  }
  if (url.pathname.startsWith('/api/office-tilemap/')) {
    if (req.method === 'GET') { handleGetOfficeTilemap(req as any, res as any, url); return; }
    if (req.method === 'PUT') { handlePutOfficeTilemap(req as any, res as any, url); return; }
    if (req.method === 'POST') { handleCreateOfficeTilemap(req as any, res as any, url); return; }
  }
  if (handleTaskApiRoute(req as any, res as any, url)) return;
  if (handleAgentApiRoute(req as any, res as any, url)) return;

  if (url.pathname === '/api/tunnel' && req.method === 'GET') { handleGetTunnel(req, res); return; }
  if (url.pathname === '/api/tunnel/start' && req.method === 'POST') { handleStartTunnel(req, res); return; }
  if (url.pathname === '/api/tunnel/stop' && req.method === 'POST') { handleStopTunnel(req, res); return; }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

export {
  apiRoutes,
  handleAPIRequest,
  handleRequest,
};
