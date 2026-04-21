/**
 * Agent Grid — add/update/remove Agent, updateGridLayout, resize
 */

import { ANIM_SEQUENCES, lastAgents } from './config.js';
import { updateAgentState, createAgentCard, unmountAgentCard } from './agentCard.js';
import { drawFrameOn, requestDynamicResize } from './agentGridResize.js';
import { findAgentCardElement, findMiniAvatarElement, getAgentGridElements } from './agentGrid/elements.js';
import { appendAgentGridCard, removeAgentGridCard } from './agentGrid/cardList.js';
import { updateGridLayoutElements } from './agentGrid/layout.js';
import { toRelativeAssetPath } from '../shared/assetPaths.js';
import {
  addSatelliteAvatar,
  cleanupAgentState,
  findParentCard,
  isSatelliteCandidate,
  migrateSatellites,
  removeSatelliteAvatar,
  updateSatelliteAvatar,
} from './agentGrid/satellites.js';

export function addAgent(agent) {
  if (!lastAgents.some(a => a.id === agent.id)) {
    lastAgents.push(agent);
  }

  // Check for existing DOM (satellite or card)
  if (findAgentCardElement(agent.id)) {
    return;
  }
  // Also check if already exists as mini-avatar inside a satellite tray
  if (findMiniAvatarElement(agent.id)) {
    return;
  }

  // Route as satellite if parent card exists
  if (isSatelliteCandidate(agent)) {
    const parentCard = findParentCard(agent);
    if (parentCard) {
      addSatelliteAvatar(parentCard, agent);
      // No grid reflow needed — satellite is inside parent card
      return;
    }
    // Fallback: parent not yet arrived, create standalone card
  }

  const card = createAgentCard(agent);
  const grid = appendAgentGridCard(card);
  if (!grid) return;

  updateAgentState(agent.id, card, agent);

  // If this is a parent, check if children arrived earlier and migrate them
  migrateSatellites(grid, card, agent.id);

  updateGridLayout();
  requestDynamicResize();
}

export function updateAgent(agent) {
  // Capture previous data BEFORE updating lastAgents
  const prevData = lastAgents?.find(a => a.id === agent.id);

  const idx = lastAgents.findIndex(a => a.id === agent.id);
  if (idx > -1) {
    lastAgents[idx] = agent;
  } else {
    lastAgents.push(agent);
  }

  // Try updating as satellite first
  if (isSatelliteCandidate(agent)) {
    const parentCard = findParentCard(agent);
    if (parentCard && updateSatelliteAvatar(parentCard, agent)) {
      return; // Updated as satellite — no grid reflow
    }
  }

  const card = findAgentCardElement(agent.id);
  if (!card) return;

  // Detect agent type change (e.g., Main created via auto-create then switched to Sub via SubagentStart)
  const wasSubagent = card.classList.contains('is-subagent');
  const wasTeammate = card.classList.contains('is-teammate');
  const typeChanged = (!!agent.isSubagent !== wasSubagent) || (!!agent.isTeammate !== wasTeammate);

  const relationshipChanged = prevData && (
    prevData.parentId !== agent.parentId ||
    prevData.teamName !== agent.teamName
  );

  // Type changed to satellite candidate: migrate card -> satellite
  if ((typeChanged || relationshipChanged) && isSatelliteCandidate(agent)) {
    const parentCard = findParentCard(agent);
    if (parentCard) {
      // Remove standalone card and add as satellite
      cleanupAgentState(agent.id);
      removeAgentGridCard(card, unmountAgentCard);

      addSatelliteAvatar(parentCard, agent);
      updateGridLayout();
      requestDynamicResize();
      return;
    }
  }

  updateAgentState(agent.id, card, agent);

  // Update name badge if displayName/nickname changed
  const nameBadge = card.querySelector('.agent-name');
  if (nameBadge) {
    const hasNickname = !!agent.nickname;
    const hasSlugName = agent.slug && agent.displayName && agent.displayName !== 'Agent';
    const newName = hasNickname ? agent.nickname : (hasSlugName ? agent.displayName : '');
    if (nameBadge.textContent !== newName) {
      nameBadge.textContent = newName;
      nameBadge.style.display = (hasNickname || hasSlugName) ? '' : 'none';
    }
  }

  if (typeChanged || relationshipChanged) {
    updateGridLayout();
    requestDynamicResize();
  }
}

export function removeAgent(data) {
  // Try removing as satellite first
  const agentData = lastAgents?.find(a => a.id === data.id);
  if (agentData && isSatelliteCandidate(agentData)) {
    const parentCard = findParentCard(agentData);
    if (parentCard && removeSatelliteAvatar(parentCard, data.id)) {
      // Clean up state
      cleanupAgentState(data.id, true);
      // No grid reflow — satellite removed inside parent
      return;
    }
  }

  const card = findAgentCardElement(data.id);
  if (!card) return;

  // Clean up satellite children inside this card (if this is a parent being removed)
  const tray = card.querySelector('.satellite-tray');
  if (tray) {
    const minis = tray.querySelectorAll('.mini-avatar');
    minis.forEach(mini => {
      const childId = mini.dataset.agentId;
      cleanupAgentState(childId);
    });
  }

  // Clean up animation memory
  cleanupAgentState(data.id, true);

  // Remove DOM element after exit animation
  card.classList.add('removing');
  setTimeout(() => {
    removeAgentGridCard(card, unmountAgentCard);
    updateGridLayout();
    requestDynamicResize();
  }, 250);
}

export function cleanupAgents(data) {
  updateGridLayout();
}

// --- Idle avatar for empty state (0 agents) ---
export function startIdleAnimation() {
  const elements = getAgentGridElements();
  const idleCharacter = elements?.idleCharacter;
  const idleBubble = elements?.idleBubble;
  if (!idleCharacter) return;
  const seq = ANIM_SEQUENCES.waiting;
  drawFrameOn(idleCharacter, seq.frames[0]);
  if (idleBubble) idleBubble.textContent = 'Waiting...';
}

export function showIdleAvatar(avatarFile) {
  const elements = getAgentGridElements();
  const idleContainer = elements?.idleContainer;
  const idleCharacter = elements?.idleCharacter;
  if (!idleContainer) return;
  idleContainer.style.display = 'flex';
  if (idleCharacter && avatarFile) {
    idleCharacter.style.backgroundImage = `url('${toRelativeAssetPath(`characters/${avatarFile}`)}')`;
  }
  startIdleAnimation();
}

export function updateGridLayout() {
  const elements = getAgentGridElements();
  if (!elements) return;
  updateGridLayoutElements(elements.grid, elements.idleContainer);
}
