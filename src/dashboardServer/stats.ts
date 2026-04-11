import path from 'path';

export interface DashboardAgent {
  state?: string;
  projectPath?: string | null;
  isSubagent?: boolean;
  isTeammate?: boolean;
}

export interface AgentManagerLike {
  getAllAgents(): DashboardAgent[];
}

export function calculateStats(agentManager: AgentManagerLike | null) {
  if (!agentManager) {
    return { total: 0, active: 0, completed: 0, byState: {} };
  }

  const agents = agentManager.getAllAgents();
  const stats: any = {
    total: agents.length,
    active: 0,
    completed: 0,
    working: 0,
    thinking: 0,
    waiting: 0,
    help: 0,
    error: 0,
    done: 0,
    offline: 0,
    byProject: {},
    byType: {
      main: 0,
      subagent: 0,
      teammate: 0,
    },
    tokens: {
      input: 0,
      output: 0,
      total: 0,
      estimatedCost: 0,
    },
  };

  for (const agent of agents) {
    const state = String(agent.state || '').toLowerCase();
    if (stats[state] !== undefined) {
      stats[state]++;
    }

    if (agent.state === 'Working' || agent.state === 'Thinking') {
      stats.active++;
    } else if (agent.state === 'Done') {
      stats.completed++;
    } else if (agent.state === 'Help') {
      stats.active++;
    }

    const project = agent.projectPath ? path.basename(agent.projectPath) : 'Default';
    if (!stats.byProject[project]) {
      stats.byProject[project] = { total: 0, active: 0, completed: 0 };
    }
    stats.byProject[project].total++;
    if (agent.state === 'Working' || agent.state === 'Thinking' || agent.state === 'Help') {
      stats.byProject[project].active++;
    }
    if (agent.state === 'Done') {
      stats.byProject[project].completed++;
    }

    if (agent.isSubagent) {
      stats.byType.subagent++;
    } else if (agent.isTeammate) {
      stats.byType.teammate++;
    } else {
      stats.byType.main++;
    }

    const tokenUsage: any = (agent as any).tokenUsage || null;
    if (tokenUsage) {
      stats.tokens.input += tokenUsage.inputTokens || 0;
      stats.tokens.output += tokenUsage.outputTokens || 0;
      stats.tokens.estimatedCost += tokenUsage.estimatedCost || 0;
    }
  }

  stats.tokens.total = stats.tokens.input + stats.tokens.output;

  return stats;
}
