import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { adaptAgentToDashboard } from '../dashboardAdapter.js';
import { loadOfficeLayoutManifest, resolveOfficeLayoutAssetPath } from '../officeLayout.js';
import { ASSET_ROOT, MIME_TYPES } from './constants.js';
import { getClients, getRefs } from './context.js';
import { calculateStats } from './stats.js';
import { handleAgentApiRoute } from './agentHandlers.js';
import { handleCreateTask, handleListTasks, handleTaskApiRoute } from './taskHandlers.js';

export { handleAgentApiRoute, handleTaskApiRoute };

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  setHeader(name: string, value: string): void;
  write(data: string): void;
}

interface RequestLike {
  method?: string;
  url?: string;
  headers: { host?: string };
  on(event: 'close', listener: () => void): void;
}

const jsonHeader = { 'Content-Type': 'application/json' };

function handleSSE(req: RequestLike, res: ResponseLike): void {
  const { sseClients } = getClients();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
}

function handleGetAgents(_req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  if (!agentManager) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(agentManager.getAllAgents().map(adaptAgentToDashboard)));
}

function handleGetStats(_req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(calculateStats(agentManager)));
}

function handleGetSessions(_req: RequestLike, res: ResponseLike): void {
  const { sessionScanner } = getRefs();
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(sessionScanner ? sessionScanner.getAllStats() : {}));
}

function handleGetArchivedAgents(_req: RequestLike, res: ResponseLike): void {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(agentRegistryRef.getArchivedAgents()));
}

function handleGetHeatmap(_req: RequestLike, res: ResponseLike, url: URL): void {
  const { heatmapScanner } = getRefs();
  if (!heatmapScanner) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Heatmap scanner not available' }));
    return;
  }
  const days = parseInt(url.searchParams.get('days') || '365', 10);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const range = heatmapScanner.getRange(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({ days: range, lastScan: heatmapScanner.lastScan }));
}

function handleGetHealth(_req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  const { sseClients, wsClients } = getClients();
  res.writeHead(200, jsonHeader);
  res.end(
    JSON.stringify({
      status: 'ok',
      timestamp: Date.now(),
      agents: agentManager ? agentManager.getAgentCount() : 0,
      sseClients: sseClients.size,
      wsClients: wsClients.size,
    })
  );
}

function handleGetAppMeta(_req: RequestLike, res: ResponseLike): void {
  const { appMeta } = getRefs();
  res.writeHead(200, jsonHeader);
  res.end(
    JSON.stringify({
      isDev: !!appMeta?.isDev,
    })
  );
}

function handleGetAvatars(_req: RequestLike, res: ResponseLike): void {
  const charDir = path.join(ASSET_ROOT, 'characters');
  const imgRegex = /\.(webp|png|jpg|jpeg|gif)$/i;
  try {
    const entries = fs.readdirSync(charDir, { withFileTypes: true });
    const categories: { name: string; files: string[] }[] = [];
    const allFiles: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const folderFiles = fs
        .readdirSync(path.join(charDir, entry.name))
        .filter((f) => imgRegex.test(f))
        .sort();
      const prefixed = folderFiles.map((f) => `${entry.name}/${f}`);
      if (prefixed.length > 0) {
        categories.push({ name: entry.name, files: prefixed });
        allFiles.push(...prefixed);
      }
    }
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ categories, allFiles }));
  } catch {
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ categories: [], allFiles: [] }));
  }
}

function handleGetOfficeLayout(_req: RequestLike, res: ResponseLike): void {
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(loadOfficeLayoutManifest()));
}

export function handleGetOfficeLayoutAsset(_req: RequestLike, res: ResponseLike, url: URL): void {
  const assetPath = url.pathname.slice('/api/office-layout/assets/'.length);
  const resolved = resolveOfficeLayoutAssetPath(assetPath);
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const mime = MIME_TYPES[path.extname(resolved)] || 'application/octet-stream';
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

export const apiRoutes = {
  'GET /api/events': handleSSE,
  'GET /api/agents': handleGetAgents,
  'GET /api/stats': handleGetStats,
  'GET /api/sessions': handleGetSessions,
  'GET /api/archived-agents': handleGetArchivedAgents,
  'GET /api/archived-workspaces': handleGetArchivedAgents,
  'GET /api/heatmap': handleGetHeatmap,
  'GET /api/health': handleGetHealth,
  'GET /api/app-meta': handleGetAppMeta,
  'GET /api/office-layout': handleGetOfficeLayout,
  'GET /api/avatars': handleGetAvatars,
  'GET /api/tasks': handleListTasks,
  'POST /api/tasks': handleCreateTask,
} as const;
