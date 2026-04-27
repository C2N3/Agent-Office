/**
 * Dashboard Data Adapter
 * Converts Agent-Office agent format to Dashboard format
 */

import type { DashboardAgent } from './shared/contracts/index.js';

const path = require('path');
const { sanitizeProjectPath } = require('./utils');

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
};

type PixelAgent = {
  id?: string | null;
  sessionId?: string | null;
  runtimeSessionId?: string | null;
  resumeSessionId?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  isRegistered?: boolean;
  registryId?: string | null;
  role?: string | null;
  enabled?: boolean;
  projectPath?: string | null;
  workspace?: DashboardAgent['metadata'] extends infer M
    ? M extends { workspace?: infer W | null }
      ? W
      : unknown
    : unknown;
  state?: string | null;
  model?: string | null;
  tokenUsage?: TokenUsage | null;
  currentTool?: string | null;
  lastMessage?: string | null;
  avatarIndex?: number | null;
  isSubagent?: boolean;
  isTeammate?: boolean;
  parentId?: string | null;
  permissionMode?: string | null;
  teammateName?: string | null;
  teamName?: string | null;
  endReason?: string | null;
  provider?: string | null;
  reportTaskId?: string | null;
  reportTeamId?: string | null;
  teamId?: string | null;
  firstSeen?: number | null;
};

/**
 * State mapping from Agent-Office to Dashboard
 */
const STATE_MAP = {
  'Working': 'working',
  'Thinking': 'thinking',
  'Done': 'completed',
  'Waiting': 'waiting',
  'Help': 'help',
  'Error': 'error',
  'Offline': 'offline'
} as const;

/**
 * Default state for unmapped values
 */
const DEFAULT_STATE = 'idle';

/**
 * Map Agent-Office state to Dashboard state
 * @param {string} pixelState - Agent-Office state
 * @returns {string} Dashboard state
 */
function mapPixelStateToDashboardState(pixelState?: string | null): DashboardAgent['status'] {
  if (!pixelState) return DEFAULT_STATE;
  return STATE_MAP[pixelState as keyof typeof STATE_MAP] || DEFAULT_STATE;
}

/**
 * Extract project name from full path
 * @param {string} projectPath - Full project path
 * @returns {string} Project name or 'Default'
 */
function extractProjectName(projectPath?: string | null): string {
  const sanitizedProjectPath = sanitizeProjectPath(projectPath);
  if (!sanitizedProjectPath) return 'Default';
  const normalized = sanitizedProjectPath.replace(/\\/g, '/');
  return path.basename(normalized);
}

/**
 * Determine agent type based on properties
 * @param {Object} agent - Agent-Office agent object
 * @returns {string} Agent type: 'main', 'subagent', or 'teammate'
 */
function determineAgentType(agent: PixelAgent): NonNullable<DashboardAgent['type']> {
  if (agent.isSubagent) return 'subagent';
  if (agent.isTeammate) return 'teammate';
  return 'main';
}

/**
 * Calculate elapsed time for an agent
 * @param {Object} agent - Agent-Office agent object
 * @returns {number} Elapsed time in milliseconds
 */
function calculateElapsedTime(agent: PixelAgent): number {
  if (!agent.firstSeen) return 0;
  return Date.now() - agent.firstSeen;
}

/**
 * Check if agent is currently active
 * @param {string} state - Agent state
 * @returns {boolean} True if agent is working or thinking
 */
function isAgentActive(state?: string | null): boolean {
  return state === 'Working' || state === 'Thinking';
}

function normalizeTokenUsage(tokenUsage?: TokenUsage | null): Required<TokenUsage> {
  return {
    inputTokens: tokenUsage?.inputTokens ?? 0,
    outputTokens: tokenUsage?.outputTokens ?? 0,
    estimatedCost: tokenUsage?.estimatedCost ?? 0,
  };
}

/**
 * Adapt a single Agent-Office agent to Dashboard format
 * @param {Object} pixelAgent - Agent-Office agent object
 * @returns {Object} Dashboard formatted agent
 */
function adaptAgentToDashboard(pixelAgent: PixelAgent): DashboardAgent & { tokenUsage: Required<TokenUsage> } {
  return {
    id: pixelAgent.id || pixelAgent.sessionId || 'unknown',
    sessionId: pixelAgent.sessionId,
    runtimeSessionId: pixelAgent.runtimeSessionId || pixelAgent.sessionId || null,
    resumeSessionId: pixelAgent.resumeSessionId || pixelAgent.sessionId || null,
    name: pixelAgent.displayName || 'Agent',
    nickname: pixelAgent.nickname || null,
    isRegistered: pixelAgent.isRegistered || false,
    registryId: pixelAgent.registryId || null,
    role: pixelAgent.role || null,
    enabled: pixelAgent.enabled !== false,
    project: extractProjectName(pixelAgent.projectPath),
    status: mapPixelStateToDashboardState(pixelAgent.state),
    type: determineAgentType(pixelAgent),
    model: pixelAgent.model || null,
    provider: pixelAgent.provider || null,
    tokenUsage: normalizeTokenUsage(pixelAgent.tokenUsage),
    currentTool: pixelAgent.currentTool || null,
    reportTaskId: pixelAgent.reportTaskId || null,
    reportTeamId: pixelAgent.reportTeamId || null,
    teamId: pixelAgent.teamId || null,
    lastMessage: pixelAgent.lastMessage || null,
    avatarIndex: pixelAgent.avatarIndex !== undefined ? pixelAgent.avatarIndex : null,
    metadata: {
      isSubagent: pixelAgent.isSubagent || false,
      isTeammate: pixelAgent.isTeammate || false,
      projectPath: sanitizeProjectPath(pixelAgent.projectPath),
      workspace: pixelAgent.workspace || null,
      parentId: pixelAgent.parentId || null,
      permissionMode: pixelAgent.permissionMode || null,
      teammateName: pixelAgent.teammateName || null,
      teamName: pixelAgent.teamName || null,
      endReason: pixelAgent.endReason || null,
      provider: pixelAgent.provider || null,
      runtimeSessionId: pixelAgent.runtimeSessionId || pixelAgent.sessionId || null,
      resumeSessionId: pixelAgent.resumeSessionId || pixelAgent.sessionId || null,
      source: 'agent-office'
    },
    timing: {
      elapsed: calculateElapsedTime(pixelAgent),
      active: isAgentActive(pixelAgent.state)
    }
  };
}

export {
  adaptAgentToDashboard,
  mapPixelStateToDashboardState,
  extractProjectName,
  STATE_MAP,
  DEFAULT_STATE,
};

module.exports = {
  adaptAgentToDashboard,
  mapPixelStateToDashboardState,
  extractProjectName,
  STATE_MAP,
  DEFAULT_STATE
};
