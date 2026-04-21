function getAgentCards(grid: HTMLElement): HTMLElement[] {
  return Array.from(grid.querySelectorAll('.agent-card')) as HTMLElement[];
}

function getFocusedAgentCard(grid: HTMLElement): HTMLElement | null {
  const activeElement = grid.ownerDocument.activeElement as HTMLElement | null;
  if (!activeElement || !grid.contains(activeElement)) return null;
  if (typeof activeElement.matches !== 'function') return null;
  return activeElement.matches('.agent-card') ? activeElement : null;
}

function focusTerminalForAgent(card: HTMLElement): void {
  const agentId = card.dataset.agentId;
  if (!agentId || !window.electronAPI?.focusTerminal) return;
  void window.electronAPI.focusTerminal(agentId);
}

export function installAgentGridKeyboardNavigation(grid: HTMLElement): () => void {
  const doc = grid.ownerDocument;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const agents = getAgentCards(grid);
      if (agents.length === 0) return;

      const currentIndex = agents.findIndex(card => card === doc.activeElement);
      if (event.shiftKey) {
        event.preventDefault();
        const prevIndex = currentIndex <= 0 ? agents.length - 1 : currentIndex - 1;
        agents[prevIndex].focus();
      } else if (currentIndex === -1) {
        event.preventDefault();
        agents[0].focus();
      }
    }

    if (event.key === 'Enter') {
      const focusedAgent = getFocusedAgentCard(grid);
      if (focusedAgent) focusTerminalForAgent(focusedAgent);
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const agents = getAgentCards(grid);
      if (agents.length === 0) return;

      const currentIndex = agents.findIndex(card => card === doc.activeElement);
      if (currentIndex === -1) return;

      event.preventDefault();

      let nextIndex = currentIndex;
      switch (event.key) {
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
  };

  doc.addEventListener('keydown', onKeyDown);
  return () => {
    doc.removeEventListener('keydown', onKeyDown);
  };
}
