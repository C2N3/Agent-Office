import { toRelativeAssetPath } from '../../shared/assetPaths';

export type AgentCardShellModel = {
  agentId: string;
  avatarUrl: string;
  focusAriaLabel: string;
  nameText: string;
  projectLabel: string;
  projectTitle: string;
  showName: boolean;
  typeClass: string;
};

export function getAgentCardTypeClass(agent) {
  if (agent.isSubagent) return 'type-sub';
  if (agent.isTeammate) return 'type-team';
  return 'type-main';
}

export function getAgentCardProjectLabel(projectPath) {
  if (!projectPath) return 'Agent';
  return projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Agent';
}

export function getAgentCardNameText(agent) {
  if (agent.nickname) return agent.nickname;
  if (agent.slug && agent.displayName && agent.displayName !== 'Agent') return agent.displayName;
  return '';
}

export function buildAgentCardShellModel(agent, assignedAvatar): AgentCardShellModel {
  const nameText = getAgentCardNameText(agent);

  return {
    agentId: agent.id,
    avatarUrl: assignedAvatar ? toRelativeAssetPath(`characters/${assignedAvatar}`) : '',
    focusAriaLabel: `Focus terminal for ${agent.displayName || 'Agent'}`,
    nameText,
    projectLabel: getAgentCardProjectLabel(agent.projectPath),
    projectTitle: agent.projectPath || '',
    showName: nameText.length > 0,
    typeClass: getAgentCardTypeClass(agent),
  };
}
