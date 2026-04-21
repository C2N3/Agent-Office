/**
 * Agent Card — updateAgentState, createAgentCard
 */

import { stateConfig, agentStates, agentAvatars, AVATAR_FILES, avatarFromAgentId } from './config.js';
import { playAnimation } from './animationManager.js';
import { mountAgentCardShell, unmountAgentCardShell } from './agentCard/lifecycle.js';
import { toRelativeAssetPath } from '../shared/assetPaths.js';

export { createMiniAvatar } from './agentCard/satellites.js';
export { unmountAgentCardShell as unmountAgentCard };

function renderThinkingDots(bubble) {
  const wrapper = document.createElement('span');
  wrapper.className = 'thinking-dots';
  wrapper.appendChild(document.createElement('span')).textContent = '.';
  wrapper.appendChild(document.createElement('span')).textContent = '.';
  wrapper.appendChild(document.createElement('span')).textContent = '.';
  bubble.replaceChildren(wrapper);
}

function resolveAgentAvatar(agent) {
  let assignedAvatar = agentAvatars.get(agent.id);
  if (assignedAvatar) return assignedAvatar;

  if (agent.avatarIndex !== undefined && agent.avatarIndex !== null && AVATAR_FILES[agent.avatarIndex]) {
    assignedAvatar = AVATAR_FILES[agent.avatarIndex];
  } else {
    assignedAvatar = avatarFromAgentId(agent.id);
  }

  agentAvatars.set(agent.id, assignedAvatar);
  return assignedAvatar;
}

export function updateAgentState(agentId, container, agentOrState) {
  const isAgentObj = typeof agentOrState === 'object';
  const state = isAgentObj ? agentOrState.state : agentOrState;
  const isAggregated = isAgentObj && agentOrState.isAggregated;

  const baseConfig = stateConfig[state] || stateConfig['Waiting'];
  const config = { ...baseConfig };

  if (isAggregated) {
    config.label = "Managing...";
  }

  const currentTool = isAgentObj ? agentOrState.currentTool : null;
  if (currentTool && state === 'Working') {
    config.label = currentTool;
  }

  const bubble = container.querySelector('.agent-bubble');
  const character = container.querySelector('.agent-character');

  // Update ARIA label
  const agentDisplayName = container.querySelector('.agent-name')?.textContent || 'Agent';
  container.setAttribute('aria-label', `${agentDisplayName} - ${config.label}`);

  // Update container class + data-state for CSS selector targeting
  container.className = `agent-card ${config.class}`;
  container.setAttribute('data-state', state ? state.toLowerCase() : 'waiting');
  if (isAggregated) container.classList.add('is-aggregated');

  if (isAgentObj) {
    if (agentOrState.isSubagent) container.classList.add('is-subagent');
    else container.classList.remove('is-subagent');

    if (agentOrState.isTeammate) container.classList.add('is-teammate');
    else container.classList.remove('is-teammate');
  }

  // Play animation
  playAnimation(agentId, character, config.anim);

  // Update avatar if changed
  if (isAgentObj && agentOrState.avatarIndex != null && character) {
    const newAvatarFile = AVATAR_FILES[agentOrState.avatarIndex];
    if (newAvatarFile) {
      const currentCached = agentAvatars.get(agentId);
      if (currentCached !== newAvatarFile) {
        agentAvatars.set(agentId, newAvatarFile);
        character.style.backgroundImage = `url('${toRelativeAssetPath(`characters/${newAvatarFile}`)}')`;
      }
    }
  }

  // Get agent state
  let agentState = agentStates.get(agentId);
  if (!agentState) {
    agentState = {
      animName: null,
      frameIdx: 0,
      interval: null,
      startTime: null,
      timerInterval: null,
      lastFormattedTime: ''
    };
    agentStates.set(agentId, agentState);
  }

  // Timer element (pre-created in createAgentCard)
  const timerEl = container.querySelector('.agent-timer');

  // Timer logic
  if (config.anim === 'working') {
    if (!agentState.startTime) {
      agentState.startTime = Date.now();
    }
    if (!agentState.timerInterval) {
      agentState.timerInterval = setInterval(() => {
        const elapsed = Date.now() - agentState.startTime;
        agentState.lastFormattedTime = window.electronAPI.formatTime(elapsed);
        if (timerEl) timerEl.textContent = agentState.lastFormattedTime;
      }, 1000);
    }

    const elapsed = Date.now() - agentState.startTime;
    agentState.lastFormattedTime = window.electronAPI.formatTime(elapsed);
    if (bubble) bubble.textContent = config.label;
    if (timerEl) {
      timerEl.textContent = agentState.lastFormattedTime;
      timerEl.style.visibility = 'visible';
    }

  } else if (config.anim === 'complete') {
    if (agentState.timerInterval) {
      clearInterval(agentState.timerInterval);
      agentState.timerInterval = null;
    }
    if (bubble) bubble.textContent = config.label;
    if (timerEl) {
      timerEl.textContent = agentState.lastFormattedTime || '00:00';
      timerEl.style.visibility = 'visible';
    }

  } else {
    if (agentState.timerInterval) {
      clearInterval(agentState.timerInterval);
      agentState.timerInterval = null;
    }
    agentState.startTime = null;
    agentState.lastFormattedTime = '';
    if (timerEl) timerEl.style.visibility = 'hidden';
    if (bubble) {
      // Thinking state: show animated dots
      if (state === 'Thinking' && !isAggregated) {
        renderThinkingDots(bubble);
      } else {
        bubble.textContent = config.label;
      }
    }
  }

  agentStates.set(agentId, agentState);
}

export function createAgentCard(agent) {
  const card = document.createElement('div');
  card.className = 'agent-card';
  card.dataset.agentId = agent.id;
  card.tabIndex = 0;

  card.setAttribute('role', 'article');
  card.setAttribute('aria-label', `${agent.displayName || 'Agent'} - ${agent.state || 'Waiting'}`);

  if (agent.isSubagent) {
    card.classList.add('is-subagent');
    card.setAttribute('aria-label', `Subagent ${agent.displayName || 'Agent'} - ${agent.state || 'Waiting'}`);
  }

  // Assign avatar per agent — server-assigned avatarIndex first, fallback: hash
  const assignedAvatar = resolveAgentAvatar(agent);

  // Card type class (for CSS color distinction only)
  const typeClass = agent.isSubagent ? 'type-sub' : (agent.isTeammate ? 'type-team' : 'type-main');
  card.classList.add(typeClass);

  mountAgentCardShell(card, agent, assignedAvatar);

  return card;
}
