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

function collectBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function resolveTaskRepositoryPath(body: any): string {
  const requestedPath = typeof body?.repositoryPath === 'string' ? body.repositoryPath.trim() : '';
  const { agentRegistryRef } = getRefs();
  const registryId = typeof body?.agentRegistryId === 'string' ? body.agentRegistryId.trim() : '';
  const registeredAgent = registryId && agentRegistryRef ? agentRegistryRef.getAgent(registryId) : null;
  const workspaceRepo = typeof registeredAgent?.workspace?.repositoryPath === 'string' ? registeredAgent.workspace.repositoryPath.trim() : '';
  const agentProjectPath = typeof registeredAgent?.projectPath === 'string' ? registeredAgent.projectPath.trim() : '';
  if (workspaceRepo && fs.existsSync(workspaceRepo)) return workspaceRepo;
  if (requestedPath && fs.existsSync(requestedPath)) return requestedPath;
  if (agentProjectPath && fs.existsSync(agentProjectPath)) return agentProjectPath;
  return workspaceRepo || requestedPath || agentProjectPath || '';
}

async function handleCreateTask(req: RequestLike, res: ResponseLike): Promise<void> {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  try {
    const body = JSON.parse(await collectBody(req));
    body.repositoryPath = resolveTaskRepositoryPath(body);
    const task = orchestrator.submitTask(body);
    res.writeHead(201, jsonHeader);
    res.end(JSON.stringify(task));
  } catch (e: any) {
    res.writeHead(400, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleListTasks(_req: RequestLike, res: ResponseLike, url: URL): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  const status = url.searchParams.get('status');
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(status ? orchestrator.getTasksByStatus(status) : orchestrator.getAllTasks()));
}

function handleTaskAction(_req: RequestLike, res: ResponseLike, taskId: string, action: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  try {
    let task;
    switch (action) {
      case 'cancel': task = orchestrator.cancelTask(taskId); break;
      case 'retry': task = orchestrator.retryTask(taskId); break;
      case 'pause': task = orchestrator.pauseTask(taskId); break;
      case 'resume': task = orchestrator.resumeTask(taskId); break;
      default:
        res.writeHead(404, jsonHeader);
        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
        return;
    }
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify(task));
  } catch (e: any) {
    res.writeHead(400, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleGetTask(_req: RequestLike, res: ResponseLike, taskId: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  const task = orchestrator.getTask(taskId);
  if (!task) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(task));
}

function handleDeleteTask(_req: RequestLike, res: ResponseLike, taskId: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  try {
    orchestrator.deleteTask(taskId);
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(400, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleTaskReport(_req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
  const { orchestrator, workspaceManager } = getRefs();
  if (!orchestrator) { res.writeHead(503, jsonHeader); res.end(JSON.stringify({ error: 'Orchestrator not available' })); return; }
  const task = orchestrator.getTask(taskId);
  if (!task) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ error: 'Task not found' })); return; }

  let output = task.lastOutput || '';
  if (task.outputPath) {
    try { output = fs.readFileSync(task.outputPath, 'utf-8'); } catch {}
  }

  let diff = '';
  let diffSummary = '';
  if (task.workspacePath && workspaceManager) {
    try {
      const baseBranch = task.baseBranch || 'HEAD~1';
      diffSummary = workspaceManager.runGit(task.workspacePath, ['diff', '--stat', baseBranch]).trim();
      diff = workspaceManager.runGit(task.workspacePath, ['diff', baseBranch]).trim();
    } catch {
      try {
        const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
        const repoRoot = workspaceManager.resolveRepositoryRoot(task.repositoryPath);
        diffSummary = workspaceManager.runGit(repoRoot, ['diff', '--stat', `${branchName}~1..${branchName}`]).trim();
        diff = workspaceManager.runGit(repoRoot, ['diff', `${branchName}~1..${branchName}`]).trim();
      } catch {}
    }
  }

  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({
    taskId: task.id,
    title: task.title,
    status: task.status,
    output,
    diffSummary,
    diff,
    agentRegistryId: task.agentRegistryId,
    workspacePath: task.workspacePath,
    branchName: task.branchName,
  }));
}

async function withTaskWorkspaceAction(taskId: string, action: 'merge' | 'reject', res: ResponseLike): Promise<void> {
  const { orchestrator, workspaceManager, agentRegistryRef, terminalManager } = getRefs();
  if (!orchestrator || !workspaceManager) { res.writeHead(503, jsonHeader); res.end(JSON.stringify({ error: 'Not available' })); return; }
  const task = orchestrator.getTask(taskId);
  if (!task) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ error: 'Task not found' })); return; }

  try {
    const registryId = task.agentRegistryId;
    if (registryId && terminalManager?.hasTerminal?.(registryId)) {
      terminalManager.destroyTerminal(registryId);
    }
    if (registryId && agentRegistryRef) {
      agentRegistryRef.unlinkSession(registryId);
    }
    if (process.platform === 'win32') await new Promise((resolve) => setTimeout(resolve, 3000));

    const agent = registryId && agentRegistryRef ? agentRegistryRef.getAgent(registryId) : null;
    if (agent?.workspace) {
      if (action === 'merge') {
        workspaceManager.mergeWorkspace(agent.workspace);
      } else {
        workspaceManager.removeWorkspace(agent.workspace, { deleteBranch: true });
      }
      agentRegistryRef.updateAgent(registryId, { workspace: null, projectPath: agent.workspace.repositoryPath });
    }

    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleTaskMerge(_req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
  return withTaskWorkspaceAction(taskId, 'merge', res);
}

async function handleTaskReject(_req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
  return withTaskWorkspaceAction(taskId, 'reject', res);
}

export function handleTaskApiRoute(req: RequestLike, res: ResponseLike, url: URL): boolean {
  if (!url.pathname.startsWith('/api/tasks/') || url.pathname === '/api/tasks/') return false;
  const parts = url.pathname.replace('/api/tasks/', '').split('/').filter(Boolean);
  const taskId = parts[0];
  const action = parts[1];

  if (req.method === 'GET' && action === 'report') { handleTaskReport(req, res, taskId); return true; }
  if (req.method === 'POST' && action === 'merge') { handleTaskMerge(req, res, taskId); return true; }
  if (req.method === 'POST' && action === 'reject') { handleTaskReject(req, res, taskId); return true; }
  if (req.method === 'GET' && !action) { handleGetTask(req, res, taskId); return true; }
  if (req.method === 'POST' && action) { handleTaskAction(req, res, taskId, action); return true; }
  if (req.method === 'DELETE' && !action) { handleDeleteTask(req, res, taskId); return true; }
  return false;
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
