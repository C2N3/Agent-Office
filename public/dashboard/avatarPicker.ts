// @ts-nocheck

import {
  SHARED_AVATAR_FILES,
  getDashboardAPI,
  state,
} from './shared.js';
import { officeCharacters } from '../office/index.js';

export function setupAvatarPicker(updateAgentUI) {
  const modal = document.getElementById('avatarPickerModal');
  const grid = document.getElementById('avatarPickerGrid');
  const cancelBtn = document.getElementById('cancelAvatarBtn');
  if (!modal || !grid) return;

  const displayWidth = 53;
  const displayHeight = 70;
  const columns = 8;
  let currentRegistryId = null;
  let currentAgentId = null;

  SHARED_AVATAR_FILES.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'avatar-picker-item';
    item.dataset.index = index;
    item.style.backgroundImage = `url('./public/characters/${file}')`;
    item.style.backgroundSize = `${displayWidth * columns}px auto`;
    item.style.backgroundPosition = '0px 0px';
    item.style.width = `${displayWidth}px`;
    item.style.height = `${displayHeight}px`;
    item.style.imageRendering = 'auto';
    item.title = `Avatar ${index}`;

    item.addEventListener('click', async () => {
      if (!currentRegistryId) return;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.updateRegisteredAgent) {
        await dashboardAPI.updateRegisteredAgent(currentRegistryId, { avatarIndex: index });
      }

      if (currentAgentId) {
        const character = officeCharacters.characters.get(currentAgentId);
        if (character) {
          character.avatarFile = file;
          character.skinIndex = index;
        }
      }

      if (currentAgentId) {
        const agent = state.agents.get(currentAgentId);
        if (agent) {
          agent.avatarIndex = index;
          updateAgentUI(agent);
        }
      }
      modal.style.display = 'none';
    });

    grid.appendChild(item);
  });

  cancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.style.display = 'none';
  });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.agent-avatar-btn');
    if (!btn) return;
    event.stopPropagation();
    currentRegistryId = btn.dataset.avatarId;
    currentAgentId = btn.dataset.agentId;

    const agent = state.agents.get(currentAgentId);
    const currentIndex = agent ? (agent.avatarIndex != null ? agent.avatarIndex : 0) : 0;
    grid.querySelectorAll('.avatar-picker-item').forEach((item) => {
      item.classList.toggle('selected', parseInt(item.dataset.index, 10) === currentIndex);
    });

    modal.style.display = '';
  });
}
