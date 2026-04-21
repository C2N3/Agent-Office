import { archiveState, getDashboardAPI, state } from './shared.js';
import { renderArchiveView } from './activityViews.js';
import { officeOnAgentUpdated, officeRenderer } from '../office/index.js';
import { syncCentralAgentRemoval } from './centralAgents/index.js';
import { notifyDashboardStore } from './state/store.js';
import { dashboardModalRegistry } from './modals/registry.js';

export function openAgentHistory(historyId: string, agentName: string): void {
  dashboardModalRegistry.openSessionHistory?.(historyId, agentName || 'Agent');
}

export function assignTaskToAgent(agentId: string): void {
  const agent = state.agents.get(agentId);
  if (agent) {
    dashboardModalRegistry.openAssignTaskModal?.(agent);
  }
}

export function formTeamForAgent(agentId: string, registryId: string): void {
  dashboardModalRegistry.openTeamFormationModal?.(agentId, registryId);
}

export async function mergeWorkspaceAgent(registryId: string, branch: string): Promise<void> {
  if (!confirm(`Merge branch "${branch || ''}" and archive this workspace agent?`)) return;
  const dashboardAPI = getDashboardAPI();
  const result = await dashboardAPI?.mergeWorkspaceAgent?.(registryId);
  if (!result?.success) {
    alert(result?.error || 'Workspace merge failed.');
    return;
  }
  archiveState.items = null;
  if (state.currentView === 'archive') {
    await renderArchiveView(true);
  }
}

export async function removeWorkspaceAgent(registryId: string, branch: string): Promise<void> {
  if (!confirm(`Remove workspace branch "${branch || ''}" without merge and archive this agent?`)) return;
  const dashboardAPI = getDashboardAPI();
  const result = await dashboardAPI?.removeWorkspaceAgent?.(registryId);
  if (!result?.success) {
    alert(result?.error || 'Workspace removal failed.');
    return;
  }
  archiveState.items = null;
  if (state.currentView === 'archive') {
    await renderArchiveView(true);
  }
}

export async function terminateAgent(agentId: string): Promise<void> {
  if (!confirm('Force terminate this agent session?')) return;
  const dashboardAPI = getDashboardAPI();
  const terminateResult = dashboardAPI?.terminateAgentSession
    ? dashboardAPI.terminateAgentSession(agentId)
    : fetch(`/api/agents/${encodeURIComponent(agentId)}/terminate`, { method: 'POST' }).then((res) => res.json());
  const result = await terminateResult;
  if (!result?.success) {
    alert(result?.error || 'Session termination failed.');
  }
}

export async function unregisterAgent(registryId: string): Promise<void> {
  if (!confirm('Unregister this agent and move its record to Archive?')) return;
  const dashboardAPI = getDashboardAPI();
  await dashboardAPI?.archiveRegisteredAgent?.(registryId);
  syncCentralAgentRemoval(registryId).catch((error) => {
    console.warn('[Central Agents] archive sync failed', error);
  });
  archiveState.items = null;
  if (state.currentView === 'archive') {
    await renderArchiveView(true);
  }
}

export async function deleteAgentRecord(registryId: string): Promise<void> {
  if (!confirm('Delete this agent record permanently? This cannot be undone.')) return;
  const dashboardAPI = getDashboardAPI();
  await dashboardAPI?.deleteRegisteredAgent?.(registryId);
  syncCentralAgentRemoval(registryId).catch((error) => {
    console.warn('[Central Agents] delete sync failed', error);
  });
  archiveState.items = null;
  if (state.currentView === 'archive') {
    await renderArchiveView(true);
  }
}

export function focusAgentCard(agentId: string | null): void {
  state.focusedAgentId = agentId;
  if (agentId) {
    officeRenderer.focusOnCharacter?.(agentId);
  }
  notifyDashboardStore();
}

export function changeAgentAvatar(agentId: string, registryId: string): void {
  dashboardModalRegistry.openAvatarPickerModal?.(agentId, registryId);
}

export async function renameAgentNickname(agentId: string, nickname: string): Promise<boolean> {
  const trimmed = nickname.trim();
  const dashboardAPI = getDashboardAPI();
  const updateRequest = trimmed
    ? dashboardAPI?.setNickname?.(agentId, trimmed)
    : dashboardAPI?.removeNickname?.(agentId);

  if (!updateRequest) {
    alert('Nickname updates are unavailable in this environment.');
    return false;
  }

  let result;
  try {
    result = await updateRequest;
  } catch (error) {
    console.error('[Nickname Edit]', error);
    alert(error instanceof Error ? error.message : 'Nickname update failed.');
    return false;
  }
  if (result?.success === false) {
    alert(result.error || 'Nickname update failed.');
    return false;
  }

  const agent = state.agents.get(agentId);
  if (agent) {
    const savedNickname = trimmed && result && 'nickname' in result && result.nickname
      ? result.nickname
      : trimmed;
    const nextAgent = {
      ...agent,
      nickname: trimmed ? savedNickname : null,
    };
    state.agents.set(agentId, nextAgent);
    officeOnAgentUpdated(nextAgent);
    notifyDashboardStore();
  }

  return true;
}
