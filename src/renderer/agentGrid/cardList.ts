import { getAgentGridElements } from './elements';

type BeforeRemoveCard = (card: HTMLElement) => void;

export function getAgentGridCardElements(agentGrid?: HTMLElement | null): HTMLElement[] {
  const grid = agentGrid || getAgentGridElements()?.grid;
  if (!grid) return [];

  return Array.from(grid.querySelectorAll('.agent-card')) as HTMLElement[];
}

export function appendAgentGridCard(card: HTMLElement): HTMLElement | null {
  const grid = getAgentGridElements()?.grid;
  if (!grid) return null;

  grid.appendChild(card);
  return grid;
}

export function removeAgentGridCard(
  card: HTMLElement,
  beforeRemove?: BeforeRemoveCard,
) {
  beforeRemove?.(card);
  card.remove();
}

export function applyAgentGridCardOrder(
  agentGrid: HTMLElement,
  orderedCards: HTMLElement[],
  beforeRemove?: BeforeRemoveCard,
) {
  const orderedCardSet = new Set(orderedCards);

  orderedCards.forEach(card => {
    agentGrid.appendChild(card);
  });

  getAgentGridCardElements(agentGrid).forEach(card => {
    if (!orderedCardSet.has(card)) {
      removeAgentGridCard(card, beforeRemove);
    }
  });
}
