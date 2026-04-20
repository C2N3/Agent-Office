/**
 * UI Components — keyboard shortcuts and context menu bridge
 */

import { closeOverlayContextMenu, openOverlayContextMenu } from './overlayShellController.js';

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + D: Open Mission Control Dashboard
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      const dashboardBtn = document.getElementById('web-dashboard-btn');
      if (dashboardBtn && !dashboardBtn.disabled) {
        dashboardBtn.click();
      }
    }

    // Tab: Navigate between agents
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const agents = Array.from(document.querySelectorAll('.agent-card'));
      if (agents.length === 0) return;

      const currentIndex = agents.findIndex(card => card === document.activeElement);

      if (e.shiftKey) {
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? agents.length - 1 : currentIndex - 1;
        agents[prevIndex].focus();
      } else if (currentIndex === -1) {
        e.preventDefault();
        agents[0].focus();
      }
    }

    // Escape: Close any overlays/modals
    if (e.key === 'Escape') {
      closeOverlayContextMenu();
    }

    // Enter: Focus terminal for active agent
    if (e.key === 'Enter') {
      const focusedAgent = document.querySelector('.agent-card:focus') ||
                           document.querySelector('.agent-card[tabindex="0"]:focus');
      if (focusedAgent) {
        const agentId = focusedAgent.dataset.agentId;
        if (agentId && window.electronAPI && window.electronAPI.focusTerminal) {
          window.electronAPI.focusTerminal(agentId);
        }
      }
    }

    // Arrow keys: Navigate between agents
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const agents = Array.from(document.querySelectorAll('.agent-card'));
      if (agents.length === 0) return;

      const currentIndex = agents.findIndex(card => card === document.activeElement);
      if (currentIndex === -1) return;

      e.preventDefault();

      let nextIndex;
      switch (e.key) {
        case 'ArrowLeft':
          nextIndex = Math.max(0, currentIndex - 1);
          break;
        case 'ArrowRight':
          nextIndex = Math.min(agents.length - 1, currentIndex + 1);
          break;
        case 'ArrowUp':
          nextIndex = Math.max(0, currentIndex - 10);
          break;
        case 'ArrowDown':
          nextIndex = Math.min(agents.length - 1, currentIndex + 10);
          break;
      }

      agents[nextIndex].focus();
    }
  });

}

export function setupContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement | null;
    const agentCard = target?.closest('.agent-card');
    if (!agentCard) return;

    e.preventDefault();

    const agentId = agentCard.dataset.agentId;
    if (!agentId) return;

    openOverlayContextMenu({
      agentId,
      x: e.clientX,
      y: e.clientY,
    });
  });

}
