import { lastAgents } from '../config.js';
import { unmountAgentCard } from '../agentCard.js';
import { getAgentGridCardElements } from './cardList.js';
import {
  applyAgentGridLayout,
  showEmptyAgentGridLayout,
  type AgentGridCardPlacement,
} from './layoutHost.js';
import { findParentCard, isSatelliteCandidate } from './satellites.js';

type AgentGridData = {
  id?: string;
  isSubagent?: boolean;
  isTeammate?: boolean;
  projectPath?: string;
};

type AgentGridLayoutCard = {
  card: HTMLElement;
  data: AgentGridData;
};

function resolveLayoutCards(cards: HTMLElement[]): AgentGridLayoutCard[] {
  return cards.map(card => {
    const agentId = card.dataset.agentId;
    return {
      card,
      data: lastAgents?.find(ag => ag.id === agentId) || { id: agentId },
    };
  });
}

function filterGridCards(cardDataList: AgentGridLayoutCard[]): AgentGridLayoutCard[] {
  return cardDataList.filter(item => {
    if (isSatelliteCandidate(item.data)) {
      const parentCard = findParentCard(item.data);
      if (parentCard) return false;
    }
    return true;
  });
}

function sortLayoutCards(gridCards: AgentGridLayoutCard[]): AgentGridLayoutCard[] {
  const mains = gridCards.filter(item => !item.data.isSubagent && !item.data.isTeammate);
  const orphans = gridCards.filter(item => item.data.isSubagent || item.data.isTeammate);
  mains.sort((a, b) => (a.data.projectPath || '').localeCompare(b.data.projectPath || ''));

  return [...mains, ...orphans];
}

function assignCardPlacements(cards: HTMLElement[]): AgentGridCardPlacement[] {
  let col = 1;
  let currentRow = 1;

  return cards.map(card => {
    if (col > 10) {
      col = 1;
      currentRow++;
    }

    const placement = {
      card,
      column: col,
      row: currentRow,
    };

    col++;
    return placement;
  });
}

export function updateGridLayoutElements(agentGrid: HTMLElement, idleContainer: HTMLElement | null) {
  const cards = getAgentGridCardElements(agentGrid);
  if (cards.length === 0) {
    showEmptyAgentGridLayout({ grid: agentGrid, idleContainer });
    return;
  }

  const sorted = sortLayoutCards(filterGridCards(resolveLayoutCards(cards)));
  applyAgentGridLayout(
    { grid: agentGrid, idleContainer, beforeRemoveCard: unmountAgentCard },
    assignCardPlacements(sorted.map(item => item.card)),
  );
}
