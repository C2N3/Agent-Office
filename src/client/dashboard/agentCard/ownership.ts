import type { DashboardAgent } from '../shared.js';

type OwnershipBadge = {
  className: string;
  label: string;
  title: string;
};

export function getAgentOwnershipBadge(agent: DashboardAgent): OwnershipBadge | null {
  if (agent.metadata?.source !== 'central') return null;
  const participantId = String(agent.metadata.centralCreatedByParticipantId || '').trim();
  const label = String(agent.metadata.centralOwnerLabel || '').trim()
    || (participantId ? `Guest ${participantId}` : 'Unknown');
  const ownership = String(agent.metadata.centralOwnership || 'unknown').trim() || 'unknown';
  return {
    className: `owner owner-${ownership}`,
    label,
    title: participantId ? `Owner participant: ${participantId}` : 'Owner participant unknown',
  };
}
