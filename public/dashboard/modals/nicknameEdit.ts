// @ts-nocheck

import { getDashboardAPI } from '../shared.js';

export function setupNicknameEdit() {
  const panel = document.getElementById('agentPanel');
  if (!panel) return;

  panel.addEventListener('dblclick', (event) => {
    const nameEl = event.target.closest('.agent-display-name');
    if (!nameEl || nameEl.querySelector('input')) return;

    const agentId = nameEl.dataset.agentId;
    const currentName = nameEl.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'nickname-input';
    input.style.cssText = 'background:#1a1d23;color:#e6edf3;border:1px solid #3b82f6;border-radius:4px;padding:1px 4px;font:inherit;width:100%;outline:none;';

    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    function save() {
      const value = input.value.trim();
      const dashboardAPI = getDashboardAPI();
      if (value && value !== currentName && dashboardAPI) {
        dashboardAPI.setNickname(agentId, value);
      } else if (!value && dashboardAPI) {
        dashboardAPI.removeNickname(agentId);
      }
      input.remove();
      nameEl.textContent = value || currentName;
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (keydownEvent) => {
      if (keydownEvent.key === 'Enter') {
        keydownEvent.preventDefault();
        input.blur();
      }
      if (keydownEvent.key === 'Escape') {
        keydownEvent.preventDefault();
        input.value = currentName;
        input.blur();
      }
    });
  });
}
