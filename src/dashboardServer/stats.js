const path = require('path');

function calculateStats(agentManager) {
  if (!agentManager) {
    return { total: 0, active: 0, completed: 0, byState: {} };
  }

  const agents = agentManager.getAllAgents();
  const stats = {
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
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCost = 0;
  for (const agent of agents) {
    const usage = agent.tokenUsage;
    if (usage) {
      totalInputTokens += usage.inputTokens || 0;
      totalOutputTokens += usage.outputTokens || 0;
      totalEstimatedCost += usage.estimatedCost || 0;
    }
  }
  stats.tokens = {
    input: totalInputTokens,
    output: totalOutputTokens,
    total: totalInputTokens + totalOutputTokens,
    estimatedCost: Math.round(totalEstimatedCost * 10000) / 10000,
  };

  return stats;
}

module.exports = {
  calculateStats,
};
