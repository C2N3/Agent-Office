
import { stateConfig, lastAgents, agentStates, agentAvatars } from '../config.js';
import { animationManager, playAnimation } from '../animationManager.js';
import { createMiniAvatar } from '../agentCard.js';
import { requestDynamicResize } from '../agentGridResize.js';

const MINI_AVATAR_SCALE = 0.5;

export function isSatelliteCandidate(agent) {
  return !!(agent && (agent.isSubagent || (agent.isTeammate && agent.parentId)) && agent.parentId);
}

export function findParentCard(agent) {
  if (!agent || !agent.parentId) return null;
  return document.querySelector(`[data-agent-id="${agent.parentId}"]`);
}

export function cleanupAgentState(agentId, clearAvatar = false) {
  animationManager.stop(agentId);
  const state = agentStates.get(agentId);
  if (state) {
    if (state.interval) clearInterval(state.interval);
    if (state.timerInterval) clearInterval(state.timerInterval);
  }
  agentStates.delete(agentId);
  if (clearAvatar) agentAvatars.delete(agentId);
}

export function addSatelliteAvatar(parentCard, agent) {
  const tray = parentCard.querySelector('.satellite-tray');
  if (!tray) return;
  if (tray.querySelector(`[data-agent-id="${agent.id}"]`)) return;

  const mini = createMiniAvatar(agent);
  tray.appendChild(mini);

  const config = stateConfig[agent.state] || stateConfig['Waiting'];
  playAnimation(agent.id, mini, config.anim, MINI_AVATAR_SCALE);
  requestDynamicResize();
}

export function updateSatelliteAvatar(parentCard, agent) {
  const tray = parentCard.querySelector('.satellite-tray');
  if (!tray) return false;

  const mini = tray.querySelector(`[data-agent-id="${agent.id}"]`);
  if (!mini) return false;

  const state = (agent.state || 'Waiting').toLowerCase();
  mini.dataset.state = state;
  const label = agent.displayName || agent.agentType || 'Sub';
  mini.title = `${label} — ${agent.state || 'Waiting'}`;

  const config = stateConfig[agent.state] || stateConfig['Waiting'];
  playAnimation(agent.id, mini, config.anim, MINI_AVATAR_SCALE);
  return true;
}

export function removeSatelliteAvatar(parentCard, agentId) {
  const tray = parentCard.querySelector('.satellite-tray');
  if (!tray) return false;

  const mini = tray.querySelector(`[data-agent-id="${agentId}"]`);
  if (!mini) return false;

  animationManager.stop(agentId);
  mini.classList.add('removing');
  setTimeout(() => {
    mini.remove();
    requestDynamicResize();
  }, 200);

  return true;
}

export function migrateSatellites(agentGrid, parentCard, parentId) {
  const cards = Array.from(agentGrid.querySelectorAll('.agent-card')) as HTMLElement[];
  let migrated = false;

  cards.forEach(card => {
    const childId = card.dataset.agentId;
    if (childId === parentId) return;

    const agentData = lastAgents?.find(a => a.id === childId);
    if (!agentData || agentData.parentId !== parentId) return;
    if (!isSatelliteCandidate(agentData)) return;

    cleanupAgentState(childId);
    card.remove();
    addSatelliteAvatar(parentCard, agentData);
    migrated = true;
  });

  return migrated;
}
