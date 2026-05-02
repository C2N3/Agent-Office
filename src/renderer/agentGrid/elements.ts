export type AgentGridElements = {
  grid: HTMLElement;
  idleContainer: HTMLElement | null;
  idleCharacter: HTMLElement | null;
  idleBubble: HTMLElement | null;
};

let registeredElements: AgentGridElements | null = null;

export function registerAgentGridElements(elements: AgentGridElements | null) {
  registeredElements = elements;
}

function resolveDomElements(): AgentGridElements | null {
  if (typeof document === 'undefined') return null;

  const grid = document.getElementById('agent-grid');
  if (!grid) return null;

  return {
    grid,
    idleContainer: grid.querySelector('#container'),
    idleCharacter: grid.querySelector('#character'),
    idleBubble: grid.querySelector('#speech-bubble'),
  };
}

export function getAgentGridElements(): AgentGridElements | null {
  if (registeredElements) {
    if (registeredElements.grid.isConnected) {
      return registeredElements;
    }
    registeredElements = null;
  }

  return resolveDomElements();
}

function getGridChildrenByClass(className: string): HTMLElement[] {
  const elements = getAgentGridElements();
  if (!elements) return [];

  return Array.from(elements.grid.querySelectorAll(`.${className}`)) as HTMLElement[];
}

export function findAgentCardElement(agentId: string): HTMLElement | null {
  return getGridChildrenByClass('agent-card')
    .find(card => card.dataset.agentId === agentId) || null;
}

export function findMiniAvatarElement(agentId: string): HTMLElement | null {
  return getGridChildrenByClass('mini-avatar')
    .find(avatar => avatar.dataset.agentId === agentId) || null;
}
