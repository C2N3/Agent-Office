import { type DashboardAgent, state } from './shared';
import { floorManager } from '../office/floorManager';

export function isRegisteredOnlyFilterEnabled() {
  return !!state.filters.registeredOnly;
}

export function shouldDisplayAgent(agent: DashboardAgent) {
  ensureAgentAssignedToCurrentFloor(agent.id);
  if (isRegisteredOnlyFilterEnabled() && !agent.isRegistered) return false;
  if (!floorManager.isAgentOnCurrentFloor(agent.id)) return false;
  return true;
}

export function ensureAgentAssignedToCurrentFloor(agentId: string) {
  if (!agentId || floorManager.getAgentFloor(agentId)) return;
  const currentFloor = floorManager.getCurrentFloor();
  if (!currentFloor) return;
  floorManager.assignAgent(agentId, currentFloor.id);
}

export function getVisibleAgents() {
  return [...state.agents.values()].filter(shouldDisplayAgent);
}

export function getClearableUnregisteredAgents() {
  return [...state.agents.values()].filter((agent: DashboardAgent) => {
    return !agent.isRegistered && (agent.status === 'offline' || agent.status === 'completed');
  });
}
