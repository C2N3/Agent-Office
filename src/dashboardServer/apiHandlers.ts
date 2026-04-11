import fs from 'fs';
import path from 'path';
import { URL } from 'url';
const { adaptAgentToDashboard } = require('../dashboardAdapter.js') as {
  adaptAgentToDashboard: (agent: any) => any;
};
const { loadOfficeLayoutManifest, resolveOfficeLayoutAssetPath } = require('../officeLayout.js') as {
  loadOfficeLayoutManifest: () => any;
  resolveOfficeLayoutAssetPath: (assetPath: string) => string | null;
};
const { getConversationSummary, parseConversation } = require('../main/conversationParser.js') as {
  getConversationSummary: (transcriptPath: string) => any;
  parseConversation: (transcriptPath: string, options?: { limit?: number; offset?: number }) => any;
};
import { MIME_TYPES, PROJECT_ROOT } from './constants.js';
import { getClients, getRefs } from './context.js';
import { calculateStats } from './stats.js';
import {
  handleCreateTask,
  handleListTasks,
  handleTaskApiRoute,
} from './taskHandlers.js';
import {
  handleCreateTeam,
  handleListTeams,
  handleGetTeam,
  handleTeamReport,
  handleTeamMerge,
  handleTeamReject,
  handleTeamCancel,
} from './teamHandlers.js';

export { handleTaskApiRoute };

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

function handleGetAgentById(_req: RequestLike, res: ResponseLike, url: URL): void {
  const { agentManager, sessionScanner } = getRefs();
  if (!agentManager) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agentId = url.pathname.split('/').pop();
  const agent = agentManager.getAgent(agentId);
  if (!agent) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent not found' }));
    return;
  }
  const sessionStats = sessionScanner ? sessionScanner.getSessionStats(agentId) : null;
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({ ...agent, sessionStats }));
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
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: Date.now(),
    agents: agentManager ? agentManager.getAgentCount() : 0,
    sseClients: sseClients.size,
    wsClients: wsClients.size,
  }));
}

function handleGetAvatars(_req: RequestLike, res: ResponseLike): void {
  const charDir = path.join(PROJECT_ROOT, 'public', 'characters');
  try {
    const files = fs.readdirSync(charDir).filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f)).sort();
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify(files));
  } catch {
    res.writeHead(200, jsonHeader);
    res.end('["avatar_0.webp"]');
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

function handleGetSessionHistory(_req: RequestLike, res: ResponseLike, registryId: string): void {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const enriched = agentRegistryRef.getSessionHistory(registryId).map((entry: any) => ({
    ...entry,
    summary: entry.transcriptPath ? getConversationSummary(entry.transcriptPath) : null,
  }));
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(enriched));
}

function handleGetConversation(_req: RequestLike, res: ResponseLike, registryId: string, sessionId: string, url: URL): void {
  const { agentRegistryRef, agentManager } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const entry = agentRegistryRef.findSessionHistoryEntry(registryId, sessionId);
  let transcriptPath = entry ? entry.transcriptPath : null;
  if (!transcriptPath && agentManager) {
    const agent = agentManager.getAgent(registryId);
    if (agent && (agent.sessionId === sessionId || agent.runtimeSessionId === sessionId || agent.resumeSessionId === sessionId) && agent.jsonlPath) {
      transcriptPath = agent.jsonlPath;
    }
  }

  if (!transcriptPath) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Transcript not found for this session' }));
    return;
  }

  const limit = parseInt(url.searchParams.get('limit') || '0', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const result = parseConversation(transcriptPath, { limit: limit || undefined, offset: offset || undefined });
  if (!result) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Could not parse transcript file' }));
    return;
  }

  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(result));
}

export function handleAgentApiRoute(req: RequestLike, res: ResponseLike, url: URL): boolean {
  if (!(url.pathname.startsWith('/api/agents/') && req.method === 'GET')) return false;
  const parts = url.pathname.replace('/api/agents/', '').split('/');
  if (parts.length === 2 && parts[1] === 'history') {
    handleGetSessionHistory(req, res, parts[0]);
    return true;
  }
  if (parts.length === 3 && parts[1] === 'conversation') {
    handleGetConversation(req, res, parts[0], parts[2], url);
    return true;
  }
  handleGetAgentById(req, res, url);
  return true;
}

export function handleTeamApiRoute(req: RequestLike, res: ResponseLike, url: URL): boolean {
  if (!url.pathname.startsWith('/api/teams')) return false;

  if (url.pathname === '/api/teams' || url.pathname === '/api/teams/') {
    if (req.method === 'GET') { handleListTeams(req as any, res as any); return true; }
    if (req.method === 'POST') { handleCreateTeam(req as any, res as any); return true; }
    return false;
  }

  const parts = url.pathname.replace('/api/teams/', '').split('/').filter(Boolean);
  const teamId = parts[0];
  const action = parts[1];

  if (req.method === 'GET' && !action) { handleGetTeam(req as any, res as any, teamId); return true; }
  if (req.method === 'GET' && action === 'report') { handleTeamReport(req as any, res as any, teamId); return true; }
  if (req.method === 'POST' && action === 'merge') { handleTeamMerge(req as any, res as any, teamId); return true; }
  if (req.method === 'POST' && action === 'reject') { handleTeamReject(req as any, res as any, teamId); return true; }
  if (req.method === 'POST' && action === 'cancel') { handleTeamCancel(req as any, res as any, teamId); return true; }

  return false;
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
  'GET /api/office-layout': handleGetOfficeLayout,
  'GET /api/avatars': handleGetAvatars,
  'GET /api/tasks': handleListTasks,
  'POST /api/tasks': handleCreateTask,
} as const;
