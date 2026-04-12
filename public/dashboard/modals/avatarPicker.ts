// @ts-nocheck

import {
  SHARED_AVATAR_FILES,
  SHARED_AVATAR_DATA,
  getDashboardAPI,
  state,
} from '../shared.js';
import { officeCharacters } from '../../office/index.js';

export function setupAvatarPicker(updateAgentUI) {
  const modal = document.getElementById('avatarPickerModal');
  const grid = document.getElementById('avatarPickerGrid');
  const tabsContainer = document.getElementById('avatarPickerTabs');
  const cancelBtn = document.getElementById('cancelAvatarBtn');
  if (!modal || !grid || !tabsContainer) return;

  const displayWidth = 53;
  const displayHeight = 70;
  const columns = 8;
  let currentRegistryId = null;
  let currentAgentId = null;
  let activeTab = 'All';

  // Build tabs: All + each category
  const tabNames = ['All', ...SHARED_AVATAR_DATA.categories.map(c => c.name)];

  tabNames.forEach((name) => {
    const tab = document.createElement('button');
    tab.className = 'avatar-picker-tab' + (name === 'All' ? ' active' : '');
    tab.textContent = name;
    tab.dataset.tab = name;
    tab.type = 'button';
    tab.addEventListener('click', () => {
      activeTab = name;
      tabsContainer.querySelectorAll('.avatar-picker-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      filterGrid();
    });
    tabsContainer.appendChild(tab);
  });

  // Build category lookup: file -> category name
  const fileCategoryMap = new Map<string, string>();
  for (const cat of SHARED_AVATAR_DATA.categories) {
    for (const file of cat.files) {
      fileCategoryMap.set(file, cat.name);
    }
  }

  // Build grid items
  SHARED_AVATAR_FILES.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'avatar-picker-item';
    item.dataset.index = index;
    item.dataset.category = fileCategoryMap.get(file) || '';
    item.style.backgroundImage = `url('./public/characters/${file}')`;
    item.style.backgroundSize = `${displayWidth * columns}px auto`;
    item.style.backgroundPosition = '0px 0px';
    item.style.width = `${displayWidth}px`;
    item.style.height = `${displayHeight}px`;
    item.style.imageRendering = 'auto';
    item.title = file.split('/').pop()?.replace(/\.\w+$/, '') || `Avatar ${index}`;

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

  function filterGrid() {
    grid.querySelectorAll('.avatar-picker-item').forEach((item: HTMLElement) => {
      if (activeTab === 'All') {
        item.style.display = '';
      } else {
        item.style.display = item.dataset.category === activeTab ? '' : 'none';
      }
    });
  }

  cancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.style.display = 'none';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display !== 'none') modal.style.display = 'none';
  }, { capture: true });

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

    // Reset to All tab
    activeTab = 'All';
    tabsContainer.querySelectorAll('.avatar-picker-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'All'));
    filterGrid();

    modal.style.display = '';
    requestAnimationFrame(() => modal.focus());
  });
}
