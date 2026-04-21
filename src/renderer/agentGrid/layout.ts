
import { lastAgents } from '../config.js';
import { unmountAgentCard } from '../agentCard.js';
import { applyAgentGridCardOrder, getAgentGridCardElements } from './cardList.js';
import { findParentCard, isSatelliteCandidate } from './satellites.js';

export function updateGridLayoutElements(agentGrid, idleContainer) {
  const cards = getAgentGridCardElements(agentGrid);
  if (cards.length === 0) {
    agentGrid.classList.remove('has-multiple');
    agentGrid.querySelectorAll('.agent-party-bg').forEach(el => el.remove());
    if (idleContainer) {
      if (!idleContainer.parentNode) {
        agentGrid.appendChild(idleContainer);
      }
      idleContainer.style.display = 'flex';
    }
    return;
  }

  if (idleContainer) idleContainer.style.display = 'none';
  agentGrid.classList.add('has-multiple');

  const cardDataList = cards.map(c => {
    return {
      card: c,
      data: lastAgents?.find(ag => ag.id === c.dataset.agentId) || { id: c.dataset.agentId }
    };
  });

  const gridCards = cardDataList.filter(item => {
    if (isSatelliteCandidate(item.data)) {
      const parentCard = findParentCard(item.data);
      if (parentCard) return false;
    }
    return true;
  });

  const mains = gridCards.filter(item => !item.data.isSubagent && !item.data.isTeammate);
  const orphans = gridCards.filter(item => item.data.isSubagent || item.data.isTeammate);
  mains.sort((a, b) => (a.data.projectPath || '').localeCompare(b.data.projectPath || ''));

  const sorted = [...mains, ...orphans];
  let col = 1;
  let currentRow = 1;

  (Array.from(agentGrid.querySelectorAll('.agent-party-bg')) as HTMLElement[]).forEach(el => el.remove());

  sorted.forEach(item => {
    if (col > 10) { col = 1; currentRow++; }

    item.card.classList.remove('group-start');
    item.card.style.gridColumn = String(col);
    item.card.style.gridRow = String(currentRow);

    col++;
  });

  applyAgentGridCardOrder(agentGrid, sorted.map(item => item.card), unmountAgentCard);
}
