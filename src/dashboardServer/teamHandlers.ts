import fs from 'fs';
import { getRefs } from './context.js';

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

export async function handleCreateTeam(req: RequestLike, res: ResponseLike): Promise<void> {
  const { teamCoordinator } = getRefs() as any;
  if (!teamCoordinator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Team coordinator not available' }));
    return;
  }
  try {
    const body = JSON.parse(await collectBody(req));
    const team = teamCoordinator.createTeam(body);
    res.writeHead(201, jsonHeader);
    res.end(JSON.stringify(team));
  } catch (e: any) {
    res.writeHead(400, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

export function handleListTeams(req: RequestLike, res: ResponseLike): void {
  const { teamCoordinator } = getRefs() as any;
  if (!teamCoordinator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Team coordinator not available' }));
    return;
  }
  const teams = teamCoordinator.teamStore.getAllTeams();
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(teams));
}

export function handleGetTeam(req: RequestLike, res: ResponseLike, teamId: string): void {
  const { teamCoordinator } = getRefs() as any;
  if (!teamCoordinator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Team coordinator not available' }));
    return;
  }
  const team = teamCoordinator.teamStore.getTeam(teamId);
  if (!team) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Team not found' }));
    return;
  }
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(team));
}

export async function handleTeamReport(req: RequestLike, res: ResponseLike, teamId: string): Promise<void> {
  const { teamCoordinator, orchestrator, workspaceManager, agentRegistryRef } = getRefs() as any;
  if (!teamCoordinator || !orchestrator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Not available' }));
    return;
  }

  const team = teamCoordinator.teamStore.getTeam(teamId);
  if (!team) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Team not found' }));
    return;
  }

  // Collect per-member reports
  const members = team.subtaskIds.map((taskId: string) => {
    const task = orchestrator.getTask(taskId);
    if (!task) return null;
    const agent = agentRegistryRef?.getAgent(task.agentRegistryId);
    let output = task.lastOutput || '';
    if (task.outputPath) {
      try { output = fs.readFileSync(task.outputPath, 'utf-8'); } catch {}
    }
    return {
      agentId: task.agentRegistryId,
      agentName: agent?.name || 'Agent',
      taskId: task.id,
      title: task.title,
      status: task.status,
      output,
    };
  }).filter(Boolean);

  // Get integration branch diff
  let diff = '';
  let diffSummary = '';
  if (team.integrationBranch && workspaceManager) {
    try {
      const repoRoot = workspaceManager.resolveRepositoryRoot(team.repositoryPath);
      const mergeBase = workspaceManager.runGit(repoRoot, ['merge-base', team.baseBranch, team.integrationBranch]).trim();
      diffSummary = workspaceManager.runGit(repoRoot, ['diff', '--stat', mergeBase, team.integrationBranch]).trim();
      diff = workspaceManager.runGit(repoRoot, ['diff', mergeBase, team.integrationBranch]).trim();
    } catch {}
  }

  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({
    teamId: team.id,
    teamName: team.name,
    goal: team.goal,
    status: team.status,
    members,
    integrationBranch: team.integrationBranch,
    diffSummary,
    diff,
  }));
}

export async function handleTeamMerge(req: RequestLike, res: ResponseLike, teamId: string): Promise<void> {
  const { teamCoordinator, workspaceManager, terminalManager } = getRefs() as any;
  if (!teamCoordinator || !workspaceManager) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Not available' }));
    return;
  }

  const team = teamCoordinator.teamStore.getTeam(teamId);
  if (!team) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Team not found' }));
    return;
  }

  try {
    const repoRoot = workspaceManager.resolveRepositoryRoot(team.repositoryPath);

    // Merge integration branch into base branch
    workspaceManager.runGit(repoRoot, ['checkout', team.baseBranch]);
    workspaceManager.runGit(repoRoot, ['merge', '--no-edit', team.integrationBranch]);

    // Cleanup: delete integration branch and subtask branches
    try { workspaceManager.runGit(repoRoot, ['branch', '-D', team.integrationBranch]); } catch {}
    for (const taskId of team.subtaskIds) {
      const task = teamCoordinator.orchestrator.getTask(taskId);
      if (task) {
        const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
        try { workspaceManager.runGit(repoRoot, ['branch', '-D', branchName]); } catch {}
      }
    }

    teamCoordinator.teamStore.updateTeam(teamId, { status: 'completed' });

    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    try { workspaceManager.runGit(workspaceManager.resolveRepositoryRoot(team.repositoryPath), ['merge', '--abort']); } catch {}
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

export async function handleTeamReject(req: RequestLike, res: ResponseLike, teamId: string): Promise<void> {
  const { teamCoordinator, workspaceManager } = getRefs() as any;
  if (!teamCoordinator || !workspaceManager) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Not available' }));
    return;
  }

  const team = teamCoordinator.teamStore.getTeam(teamId);
  if (!team) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Team not found' }));
    return;
  }

  try {
    const repoRoot = workspaceManager.resolveRepositoryRoot(team.repositoryPath);

    // Delete integration branch and subtask branches
    try { workspaceManager.runGit(repoRoot, ['checkout', team.baseBranch]); } catch {}
    try { workspaceManager.runGit(repoRoot, ['branch', '-D', team.integrationBranch]); } catch {}
    for (const taskId of team.subtaskIds) {
      const task = teamCoordinator.orchestrator.getTask(taskId);
      if (task) {
        const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
        try { workspaceManager.runGit(repoRoot, ['branch', '-D', branchName]); } catch {}
      }
    }

    teamCoordinator.teamStore.updateTeam(teamId, { status: 'cancelled', completedAt: Date.now() });

    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}

export async function handleTeamCancel(req: RequestLike, res: ResponseLike, teamId: string): Promise<void> {
  const { teamCoordinator } = getRefs() as any;
  if (!teamCoordinator) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Team coordinator not available' }));
    return;
  }
  try {
    const team = teamCoordinator.cancelTeam(teamId);
    res.writeHead(200, jsonHeader);
    res.end(JSON.stringify(team));
  } catch (e: any) {
    res.writeHead(400, jsonHeader);
    res.end(JSON.stringify({ error: e.message }));
  }
}
