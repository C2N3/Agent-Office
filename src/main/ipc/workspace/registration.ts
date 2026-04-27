import { normalizePath } from '../../registry/index.js';
import type { DashboardPathRegistrationStrategy } from '../../../shared/contracts/index.js';

type RegistrationPreviewInput = {
  strategy?: DashboardPathRegistrationStrategy;
  workspacePath?: string;
  name?: string;
  provider?: string | null;
  branchName?: string;
};

function normalizeStrategy(value) {
  return value === 'worktree' || value === 'existing' ? value : 'auto';
}

function buildPreviewSummary(preview) {
  if (!preview?.isGitRepository) {
    return preview?.effectiveStrategy === 'worktree'
      ? 'This path is not a git repository. Managed worktree creation requires a git repository.'
      : 'Not a git repository; direct registration will be used';
  }

  if (preview.effectiveStrategy === 'worktree') {
    return preview.repositoryInUse
      ? 'Will create a managed git worktree because this repository is already in use'
      : 'Will create a managed git worktree';
  }

  return 'Will register this folder directly';
}

export function createWorkspaceRegistrationService({
  agentManager,
  agentRegistry,
  workspaceManager,
  attachRegisteredAgent,
}) {
  function upsertOfflineRegisteredAgent(agent, source) {
    agentManager.updateAgent({
      registryId: agent.id,
      displayName: agent.name,
      role: agent.role,
      projectPath: agent.projectPath,
      avatarIndex: agent.avatarIndex,
      provider: agent.provider,
      workspace: agent.workspace || null,
      isRegistered: true,
      state: 'Offline',
    }, source);
  }

  function createRegisteredAgentRecord({ name, role, projectPath, provider, workspace }, source) {
    const agent = agentRegistry.createAgent({
      name,
      role,
      projectPath,
      provider,
      workspace,
    });

    const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(agent) : null;
    if (!attachedSessionId) {
      upsertOfflineRegisteredAgent(agent, source);
    }

    return agent;
  }

  function findLiveAgentsByRepository(repositoryPath) {
    if (!agentManager?.getAllAgents || !repositoryPath) return [];
    const normalizedRepositoryPath = normalizePath(repositoryPath);
    if (!normalizedRepositoryPath) return [];

    return agentManager.getAllAgents().filter((agent) => {
      if (!agent || agent.state === 'Offline') return false;

      const basePath = agent.workspace?.repositoryPath || agent.projectPath;
      if (!basePath) return false;

      let candidateRepositoryPath = agent.workspace?.repositoryPath || null;
      if (!candidateRepositoryPath) {
        try {
          candidateRepositoryPath = workspaceManager.resolveRepositoryRoot(basePath);
        } catch {
          candidateRepositoryPath = basePath;
        }
      }

      return normalizePath(candidateRepositoryPath) === normalizedRepositoryPath;
    });
  }

  function resolveRegistrationPreview(data: RegistrationPreviewInput = {}) {
    const requestedStrategy = normalizeStrategy(data.strategy);
    const preview = workspaceManager.inspectWorkspacePath(data.workspacePath, {
      name: data.name,
      provider: data.provider,
      branchName: data.branchName,
    });

    const repositoryPath = preview.repositoryPath || null;
    const registryMatches = preview.isGitRepository
      ? agentRegistry.findActiveAgentsByRepository(repositoryPath, (targetPath) => workspaceManager.resolveRepositoryRoot(targetPath))
      : [];
    const liveMatches = preview.isGitRepository ? findLiveAgentsByRepository(repositoryPath) : [];
    const repositoryInUse = (registryMatches.length + liveMatches.length) > 0;
    const recommendedStrategy = preview.isGitRepository && repositoryInUse ? 'worktree' : 'existing';
    const effectiveStrategy = requestedStrategy === 'auto' ? recommendedStrategy : requestedStrategy;
    const reason = !preview.isGitRepository
      ? 'not-git-repository'
      : (repositoryInUse ? 'repository-in-use' : 'repository-available');

    return {
      ...preview,
      requestedStrategy,
      repositoryInUse,
      recommendedStrategy,
      effectiveStrategy,
      reason,
      summary: buildPreviewSummary({
        ...preview,
        repositoryInUse,
        effectiveStrategy,
      }),
    };
  }

  return {
    createRegisteredAgentRecord,
    resolveRegistrationPreview,
  };
}
