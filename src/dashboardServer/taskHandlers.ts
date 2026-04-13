import fs from 'fs';
import { URL } from 'url';
import { getRefs } from './context.js';
const { cleanTerminalOutput } = require('../main/orchestrator/cleanOutput.js') as {
  cleanTerminalOutput: (input: string) => string;
};
const { buildTaskConversationReport } = require('../main/orchestrator/taskReport.js') as {
  buildTaskConversationReport: (task: any, agentRegistry: any, agentManager: any) => string;
};

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
}

interface RequestLike {
  method?: string;
  url?: string;
  headers: { host?: string };
  on(event: 'data' | 'end', listener: (...args: any[]) => void): void;
}

const jsonHeader = { 'Content-Type': 'application/json' };

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

export async function handleCreateTask(req: RequestLike, res: ResponseLike): Promise<void> {
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

export function handleListTasks(_req: RequestLike, res: ResponseLike, url: URL): void {
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
  const { orchestrator, workspaceManager, agentRegistryRef, agentManager } = getRefs();
  if (!orchestrator) { res.writeHead(503, jsonHeader); res.end(JSON.stringify({ error: 'Orchestrator not available' })); return; }
  const task = orchestrator.getTask(taskId);
  if (!task) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ error: 'Task not found' })); return; }

  let output = '';
  try {
    output = buildTaskConversationReport(task, agentRegistryRef, agentManager) || '';
  } catch {}

  if (!output) {
    let raw = task.lastOutput || '';
    if (task.outputPath) {
      try { raw = fs.readFileSync(task.outputPath, 'utf-8'); } catch {}
    }
    output = cleanTerminalOutput(raw);
  }

  let diff = '';
  let diffSummary = '';
  if (task.workspacePath && workspaceManager) {
    try {
      // Compare only the agent's own commits: diff from the branch point (merge-base)
      // to the current worktree HEAD, so unrelated master commits don't appear.
      const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
      const baseBranch = workspaceManager.resolveBaseBranch(task.workspacePath, task.baseBranch);
      const mergeBase = workspaceManager.runGit(task.workspacePath, ['merge-base', baseBranch, 'HEAD']).trim();
      diffSummary = workspaceManager.runGit(task.workspacePath, ['diff', '--stat', mergeBase]).trim();
      diff = workspaceManager.runGit(task.workspacePath, ['diff', mergeBase]).trim();
    } catch {
      try {
        // Fallback: compare staged + unstaged changes in worktree
        diffSummary = workspaceManager.runGit(task.workspacePath, ['diff', '--stat', 'HEAD']).trim();
        diff = workspaceManager.runGit(task.workspacePath, ['diff', 'HEAD']).trim();
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
    repositoryPath: task.repositoryPath,
    provider: task.currentProvider || task.provider || null,
    model: task.model || null,
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
