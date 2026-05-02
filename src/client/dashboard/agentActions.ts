import { archiveState, getDashboardAPI, SHARED_AVATAR_FILES, state, type DashboardAgent } from './shared';
import { renderArchiveView } from './activityViews';
import { officeOnAgentUpdated, officeRenderer } from '../office/index';
import { syncCentralAgentDisplayName, syncCentralAgentRemoval } from './centralAgents/index';
import { notifyDashboardStore } from './state/store';
import { dashboardModalRegistry } from './modals/registry';

export function openCreateAgentModal(): void {
  dashboardModalRegistry.openCreateAgentModal?.();
}

export function openAgentTaskChat(agent: DashboardAgent): void {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.openTaskChatWindow) {
    alert('Task chat is unavailable in this environment.');
    return;
  }

  const avatarFile = SHARED_AVATAR_FILES[agent.avatarIndex != null ? agent.avatarIndex : 0]
    || SHARED_AVATAR_FILES[0]
    || 'Origin/avatar_0.webp';
  void dashboardAPI.openTaskChatWindow({
    agentRegistryId: agent.registryId || agent.id,
    agentName: agent.nickname || agent.name || 'Agent',
    avatarFile,
  });
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
    if (trimmed) {
      syncCentralAgentDisplayName(agent.registryId || agent.id, savedNickname).catch((error) => {
        console.warn('[Central Agents] rename sync failed', error);
      });
    }
  }

  return true;
}
