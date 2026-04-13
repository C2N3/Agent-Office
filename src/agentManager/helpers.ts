const path = require('path');
const { formatSlugToDisplayName, sanitizeProjectPath } = require('../utils');
const AVATAR_FILES_DATA = require('../../public/shared/avatars.json');
const AVATAR_FILES = AVATAR_FILES_DATA.allFiles || AVATAR_FILES_DATA;
const AVATAR_COUNT = AVATAR_FILES.length;

type AgentLike = {
  id?: string;
  parentId?: string | null;
  state?: string;
};

function formatDisplayName(slug, projectPath) {
  if (slug) return formatSlugToDisplayName(slug);
  const sanitizedProjectPath = sanitizeProjectPath(projectPath);
  if (sanitizedProjectPath) return path.basename(sanitizedProjectPath);
  return 'Agent';
}

function assignAvatarIndex(agentId, usedAvatarIndices) {
  let hash = 0;
  const str = agentId || '';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hashIdx = Math.abs(hash) % AVATAR_COUNT;
  if (!usedAvatarIndices.has(hashIdx)) {
    usedAvatarIndices.add(hashIdx);
    return hashIdx;
  }
  for (let i = 0; i < AVATAR_COUNT; i++) {
    if (!usedAvatarIndices.has(i)) {
      usedAvatarIndices.add(i);
      return i;
    }
  }
  return hashIdx;
}

function releaseAvatarIndex(avatarIndex, usedAvatarIndices) {
  if (avatarIndex !== undefined && avatarIndex !== null) {
    usedAvatarIndices.delete(avatarIndex);
  }
}

function getAgentWithEffectiveState(agents: Map<string, AgentLike>, agentId) {
  const agent = agents.get(agentId);
  if (!agent) return null;
  if (agent.state === 'Help' || agent.state === 'Error') return agent;

  const children = Array.from(agents.values()).filter((a) => a.parentId === agentId);
  if (children.some((c) => c.state === 'Help' || c.state === 'Error')) {
    return { ...agent, state: 'Help', isAggregated: true };
  }
  if (agent.state === 'Working' || agent.state === 'Thinking') return agent;
  if (children.some((c) => c.state === 'Working' || c.state === 'Thinking')) {
    return { ...agent, state: 'Working', isAggregated: true };
  }
  return agent;
}

function getStats(agents) {
  const counts = { Done: 0, Thinking: 0, Working: 0, Waiting: 0, Help: 0, Error: 0 };
  for (const agent of agents) {
    if (Object.prototype.hasOwnProperty.call(counts, agent.state)) {
      counts[agent.state]++;
    }
  }
  return { total: agents.length, byState: counts };
}

module.exports = {
  assignAvatarIndex,
  formatDisplayName,
  getAgentWithEffectiveState,
  getStats,
  releaseAvatarIndex,
};
