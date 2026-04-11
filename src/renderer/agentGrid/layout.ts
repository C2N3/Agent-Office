// @ts-nocheck

import { lastAgents } from '../config.js';
import { findParentCard, isSatelliteCandidate } from './satellites.js';

export function updateGridLayoutElements(agentGrid, idleContainer) {
  const cards = Array.from(agentGrid.querySelectorAll('.agent-card'));
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

  agentGrid.querySelectorAll('.agent-party-bg').forEach(el => el.remove());

  sorted.forEach(item => {
    if (col > 10) { col = 1; currentRow++; }

    item.card.classList.remove('group-start');
    item.card.style.gridColumn = col;
    item.card.style.gridRow = currentRow;

    if (item.card.parentNode !== agentGrid) {
      agentGrid.appendChild(item.card);
    }

    col++;
  });

  const sortedIds = new Set(sorted.map(s => s.card.dataset.agentId));
  Array.from(agentGrid.querySelectorAll('.agent-card')).forEach(card => {
    if (!sortedIds.has(card.dataset.agentId)) {
      card.remove();
    }
  });
}
