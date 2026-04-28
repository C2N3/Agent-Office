import { applyAgentGridCardOrder } from './cardList';

type BeforeRemoveCard = (card: HTMLElement) => void;

export type AgentGridLayoutHost = {
  grid: HTMLElement;
  idleContainer: HTMLElement | null;
  beforeRemoveCard?: BeforeRemoveCard;
};

export type AgentGridCardPlacement = {
  card: HTMLElement;
  column: number;
  row: number;
};

function removePartyBackgrounds(grid: HTMLElement) {
  (Array.from(grid.querySelectorAll('.agent-party-bg')) as HTMLElement[])
    .forEach(el => el.remove());
}

export function showEmptyAgentGridLayout(host: AgentGridLayoutHost) {
  const { grid, idleContainer } = host;

  grid.classList.remove('has-multiple');
  removePartyBackgrounds(grid);

  if (!idleContainer) return;

  if (!idleContainer.parentNode) {
    grid.appendChild(idleContainer);
  }
  idleContainer.style.display = 'flex';
}

export function applyAgentGridLayout(
  host: AgentGridLayoutHost,
  placements: AgentGridCardPlacement[],
) {
  const { grid, idleContainer, beforeRemoveCard } = host;

  if (idleContainer) {
    idleContainer.style.display = 'none';
  }
  grid.classList.add('has-multiple');
  removePartyBackgrounds(grid);

  placements.forEach(({ card, column, row }) => {
    card.classList.remove('group-start');
    card.style.gridColumn = String(column);
    card.style.gridRow = String(row);
  });

  applyAgentGridCardOrder(
    grid,
    placements.map(({ card }) => card),
    beforeRemoveCard,
  );
}
