import { agentAvatars, AVATAR_FILES, avatarFromAgentId } from '../config.js';
import { toRelativeAssetPath } from '../../shared/assetPaths.js';

export function createMiniAvatar(agent) {
  const mini = document.createElement('div');
  mini.className = 'mini-avatar';
  mini.dataset.agentId = agent.id;
  mini.dataset.state = (agent.state || 'waiting').toLowerCase();

  // Assign avatar sprite (50% scale background)
  let assignedAvatar = agentAvatars.get(agent.id);
  if (!assignedAvatar) {
    if (agent.avatarIndex !== undefined && agent.avatarIndex !== null && AVATAR_FILES[agent.avatarIndex]) {
      assignedAvatar = AVATAR_FILES[agent.avatarIndex];
    } else {
      assignedAvatar = avatarFromAgentId(agent.id);
    }
    agentAvatars.set(agent.id, assignedAvatar);
  }
  if (assignedAvatar) {
    mini.style.backgroundImage = `url('${toRelativeAssetPath(`characters/${assignedAvatar}`)}')`;
  }

  // Tooltip
  const label = agent.displayName || agent.agentType || 'Sub';
  const stateLabel = agent.state || 'Waiting';
  mini.title = `${label} — ${stateLabel}`;

  // Click -> focus terminal
  mini.onclick = async (e) => {
    e.stopPropagation();
    if (window.electronAPI && window.electronAPI.focusTerminal) {
      await window.electronAPI.focusTerminal(agent.id);
    }
  };

  return mini;
}
