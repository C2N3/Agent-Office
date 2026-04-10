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
const { cleanTerminalOutput } = require('../main/orchestrator/cleanOutput.js') as {
  cleanTerminalOutput: (input: string) => string;
};
const { buildTaskConversationReport } = require('../main/orchestrator/taskReport.js') as {
  buildTaskConversationReport: (task: any, agentRegistry: any, agentManager: any) => string;
};
import { APP_ROOT, HTML_FILE, MIME_TYPES, OVERLAY_FILE, PIP_FILE, PROJECT_ROOT } from './constants.js';
import { calculateStats } from './stats.js';
import { getClients, getRefs } from './context.js';

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
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        console.error('[Dashboard Server] Error reading HTML:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname === '/pip') {
    fs.readFile(PIP_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname === '/overlay') {
    fs.readFile(OVERLAY_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname.startsWith('/lib/')) {
    const libMap: Record<string, string> = {
      '/lib/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
      '/lib/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
      '/lib/xterm-addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
      '/lib/xterm-addon-web-links.js': 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js',
    };
    const mapped = libMap[pathname];
    if (mapped) {
      const filePath = path.join(APP_ROOT, mapped);
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
  }

  if (pathname.startsWith('/public/')) {
    const decoded = decodeURIComponent(pathname);
    const resolved = path.resolve(PROJECT_ROOT, decoded.slice(1));
    const rel = path.relative(PROJECT_ROOT, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(resolved);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function handleAPIRequest(req: RequestLike, res: ResponseLike, url: URL): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const routeKey = `${req.method} ${url.pathname}`;
  const handler = apiRoutes[routeKey as keyof typeof apiRoutes];
  if (handler) {
    handler(req, res, url);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/office-layout/assets/')) {
    handleGetOfficeLayoutAsset(req, res, url);
    return;
  }

  // Task routes: /api/tasks/:id and /api/tasks/:id/:action
  if (url.pathname.startsWith('/api/tasks/') && url.pathname !== '/api/tasks/') {
    const parts = url.pathname.replace('/api/tasks/', '').split('/').filter(Boolean);
    const taskId = parts[0];
    const action = parts[1];

    if (req.method === 'GET' && action === 'report') {
      handleTaskReport(req, res, taskId);
      return;
    }
    if (req.method === 'POST' && action === 'merge') {
      handleTaskMerge(req, res, taskId);
      return;
    }
    if (req.method === 'POST' && action === 'reject') {
      handleTaskReject(req, res, taskId);
      return;
    }
    if (req.method === 'GET' && !action) {
      handleGetTask(req, res, taskId);
      return;
    }
    if (req.method === 'POST' && action) {
      handleTaskAction(req, res, taskId, action);
      return;
    }
    if (req.method === 'DELETE' && !action) {
      handleDeleteTask(req, res, taskId);
      return;
    }
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'GET') {
    const agentSubParts = url.pathname.replace('/api/agents/', '').split('/');
    if (agentSubParts.length === 2 && agentSubParts[1] === 'history') {
      handleGetSessionHistory(req, res, agentSubParts[0]);
      return;
    }
    if (agentSubParts.length === 3 && agentSubParts[1] === 'conversation') {
      handleGetConversation(req, res, agentSubParts[0], agentSubParts[2], url);
      return;
    }
    handleGetAgentById(req, res, url);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

function handleSSE(req: RequestLike, res: ResponseLike): void {
  const { sseClients } = getClients();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
}

function handleGetAgents(req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  if (!agentManager) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agents = agentManager.getAllAgents().map(adaptAgentToDashboard);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(agents));
}

function handleGetAgentById(req: RequestLike, res: ResponseLike, url: URL): void {
  const { agentManager, sessionScanner } = getRefs();
  if (!agentManager) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agentId = url.pathname.split('/').pop();
  const agent = agentManager.getAgent(agentId);
  if (!agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent not found' }));
    return;
  }
  const sessionStats = sessionScanner ? sessionScanner.getSessionStats(agentId) : null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...agent, sessionStats }));
}

function handleGetStats(req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  const stats = calculateStats(agentManager);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats));
}

function handleGetSessions(req: RequestLike, res: ResponseLike): void {
  const { sessionScanner } = getRefs();
  const allStats = sessionScanner ? sessionScanner.getAllStats() : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(allStats));
}

function handleGetArchivedAgents(req: RequestLike, res: ResponseLike): void {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }

  const archived = agentRegistryRef.getArchivedAgents();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(archived));
}

function handleGetHeatmap(req: RequestLike, res: ResponseLike, url: URL): void {
  const { heatmapScanner } = getRefs();
  if (!heatmapScanner) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Heatmap scanner not available' }));
    return;
  }
  const days = parseInt(url.searchParams.get('days') || '365', 10);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const range = heatmapScanner.getRange(startStr, endStr);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ days: range, lastScan: heatmapScanner.lastScan }));
}

function handleGetHealth(req: RequestLike, res: ResponseLike): void {
  const { agentManager } = getRefs();
  const { sseClients, wsClients } = getClients();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: Date.now(),
    agents: agentManager ? agentManager.getAgentCount() : 0,
    sseClients: sseClients.size,
    wsClients: wsClients.size,
  }));
}

function handleGetAvatars(req: RequestLike, res: ResponseLike): void {
  const charDir = path.join(PROJECT_ROOT, 'public', 'characters');
  try {
    const files = fs.readdirSync(charDir)
      .filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
      .sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('["avatar_0.webp"]');
  }
}

function handleGetOfficeLayout(req: RequestLike, res: ResponseLike): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(loadOfficeLayoutManifest()));
}

function handleGetOfficeLayoutAsset(req: RequestLike, res: ResponseLike, url: URL): void {
  const assetPrefix = '/api/office-layout/assets/';
  const assetPath = url.pathname.slice(assetPrefix.length);
  const resolved = resolveOfficeLayoutAssetPath(assetPath);

  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(resolved);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function handleGetSessionHistory(req: RequestLike, res: ResponseLike, registryId: string): void {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const history = agentRegistryRef.getSessionHistory(registryId);
  const enriched = history.map((entry: any) => {
    const summary = entry.transcriptPath
      ? getConversationSummary(entry.transcriptPath)
      : null;
    return { ...entry, summary };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(enriched));
}

function handleGetConversation(req: RequestLike, res: ResponseLike, registryId: string, sessionId: string, url: URL): void {
  const { agentRegistryRef, agentManager } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
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
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Transcript not found for this session' }));
    return;
  }

  const limit = parseInt(url.searchParams.get('limit') || '0', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const result = parseConversation(transcriptPath, { limit: limit || undefined, offset: offset || undefined });

  if (!result) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not parse transcript file' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// === Task API helpers ===

function collectBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function handleCreateTask(req: RequestLike, res: ResponseLike): Promise<void> {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  try {
    const body = JSON.parse(await collectBody(req));
    const task = orchestrator.submitTask(body);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(task));
  } catch (e: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleListTasks(req: RequestLike, res: ResponseLike, url: URL): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  const status = url.searchParams.get('status');
  const tasks = status ? orchestrator.getTasksByStatus(status) : orchestrator.getAllTasks();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(tasks));
}

function handleTaskAction(req: RequestLike, res: ResponseLike, taskId: string, action: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }

  try {
    let task;
    switch (action) {
      case 'cancel':  task = orchestrator.cancelTask(taskId); break;
      case 'retry':   task = orchestrator.retryTask(taskId); break;
      case 'pause':   task = orchestrator.pauseTask(taskId); break;
      case 'resume':  task = orchestrator.resumeTask(taskId); break;
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(task));
  } catch (e: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleGetTask(req: RequestLike, res: ResponseLike, taskId: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  const task = orchestrator.getTask(taskId);
  if (!task) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(task));
}

function handleDeleteTask(req: RequestLike, res: ResponseLike, taskId: string): void {
  const { orchestrator } = getRefs();
  if (!orchestrator) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Orchestrator not available' }));
    return;
  }
  try {
    orchestrator.deleteTask(taskId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// === Task Report / Merge / Reject ===

async function handleTaskReport(req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
  const { orchestrator, workspaceManager, agentRegistryRef, agentManager } = getRefs();
  if (!orchestrator) { res.writeHead(503, jsonHeader); res.end(JSON.stringify({ error: 'Orchestrator not available' })); return; }

  const task = orchestrator.getTask(taskId);
  if (!task) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ error: 'Task not found' })); return; }

  // Preferred: pull a clean conversation summary from the agent's JSONL transcript.
  // The PTY capture is mostly TUI redraw noise (alternate screen buffer), so it
  // rarely contains the actual assistant work. The transcript is the source of truth.
  let output = '';
  try {
    output = buildTaskConversationReport(task, agentRegistryRef, agentManager) || '';
  } catch { /* fall through to PTY fallback */ }

  if (!output) {
    // Fallback: cleaned PTY capture. Better than nothing if the transcript is missing.
    let raw = task.lastOutput || '';
    if (task.outputPath) {
      try { raw = fs.readFileSync(task.outputPath, 'utf-8'); } catch {}
    }
    output = cleanTerminalOutput(raw);
  }

  // Git diff from worktree
  let diff = '';
  let diffSummary = '';
  if (task.workspacePath && workspaceManager) {
    try {
      const baseBranch = task.baseBranch || 'HEAD~1';
      diffSummary = workspaceManager.runGit(task.workspacePath, ['diff', '--stat', baseBranch]).trim();
      diff = workspaceManager.runGit(task.workspacePath, ['diff', baseBranch]).trim();
    } catch (e: any) {
      // Worktree may already be cleaned up — try diffing the branch from main repo
      try {
        const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
        const repoRoot = workspaceManager.resolveRepositoryRoot(task.repositoryPath);
        diffSummary = workspaceManager.runGit(repoRoot, ['diff', '--stat', `${branchName}~1..${branchName}`]).trim();
        diff = workspaceManager.runGit(repoRoot, ['diff', `${branchName}~1..${branchName}`]).trim();
      } catch { /* diff unavailable */ }
    }
  }

  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({ taskId: task.id, title: task.title, status: task.status, output, diffSummary, diff, agentRegistryId: task.agentRegistryId, workspacePath: task.workspacePath, branchName: task.branchName }));
}

async function handleTaskMerge(req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
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

    if (process.platform === 'win32') await new Promise(r => setTimeout(r, 3000));

    const agent = registryId && agentRegistryRef ? agentRegistryRef.getAgent(registryId) : null;
    if (agent?.workspace) {
      workspaceManager.mergeWorkspace(agent.workspace);
      agentRegistryRef.updateAgent(registryId, { workspace: null, projectPath: agent.workspace.repositoryPath });
    }

    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleTaskReject(req: RequestLike, res: ResponseLike, taskId: string): Promise<void> {
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

    if (process.platform === 'win32') await new Promise(r => setTimeout(r, 3000));

    const agent = registryId && agentRegistryRef ? agentRegistryRef.getAgent(registryId) : null;
    if (agent?.workspace) {
      workspaceManager.removeWorkspace(agent.workspace, { deleteBranch: true });
      agentRegistryRef.updateAgent(registryId, { workspace: null, projectPath: agent.workspace.repositoryPath });
    }

    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

const jsonHeader = { 'Content-Type': 'application/json' };

const apiRoutes = {
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

export {
  apiRoutes,
  handleAPIRequest,
  handleRequest,
};
