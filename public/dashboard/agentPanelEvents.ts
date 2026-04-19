import {
  archiveState,
  getDashboardAPI,
  state,
} from './shared.js';
import { renderArchiveView } from './activityViews.js';
import { officeRenderer } from '../office/index.js';
import { syncCentralAgentRemoval } from './centralAgents/index.js';

export function initAgentPanelEvents() {
  const agentPanel = document.getElementById('agentPanel');
  if (!agentPanel) return;

  agentPanel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const assignBtn = target.closest('.agent-assign-task-btn') as HTMLButtonElement | null;
    if (assignBtn?.dataset.agentId) {
      event.stopPropagation();
      const agent = state.agents.get(assignBtn.dataset.agentId);
      if (agent) {
        (globalThis as any).openAssignTaskModal?.(agent);
      }
      return;
    }

    const teamBtn = target.closest('.agent-form-team-btn') as HTMLButtonElement | null;
    if (teamBtn?.dataset.agentId && teamBtn?.dataset.registryId) {
      event.stopPropagation();
      (globalThis as any).openTeamFormationModal?.(teamBtn.dataset.agentId, teamBtn.dataset.registryId);
      return;
    }

    const historyBtn = target.closest('.agent-history-btn') as HTMLButtonElement | null;
    if (historyBtn?.dataset.historyId) {
      event.stopPropagation();
      globalThis.openSessionHistory?.(historyBtn.dataset.historyId, historyBtn.dataset.agentName || 'Agent');
      return;
    }

    const mergeBtn = target.closest('.agent-workspace-btn.merge') as HTMLButtonElement | null;
    if (mergeBtn?.dataset.workspaceMergeId) {
      event.stopPropagation();
      if (confirm(`Merge branch "${mergeBtn.dataset.branch || ''}" and archive this workspace agent?`)) {
        const dashboardAPI = getDashboardAPI();
        const mergeResult = dashboardAPI?.mergeWorkspaceAgent?.(mergeBtn.dataset.workspaceMergeId);
        mergeResult?.then((result) => {
          if (!result?.success) {
            alert(result?.error || 'Workspace merge failed.');
          } else {
            archiveState.items = null;
            if (state.currentView === 'archive') renderArchiveView(true);
          }
        });
      }
      return;
    }

    const removeWorkspaceBtn = target.closest('.agent-workspace-btn.remove') as HTMLButtonElement | null;
    if (removeWorkspaceBtn?.dataset.workspaceRemoveId) {
      event.stopPropagation();
      if (confirm(`Remove workspace branch "${removeWorkspaceBtn.dataset.branch || ''}" without merge and archive this agent?`)) {
        const dashboardAPI = getDashboardAPI();
        const removeResult = dashboardAPI?.removeWorkspaceAgent?.(removeWorkspaceBtn.dataset.workspaceRemoveId);
        removeResult?.then((result) => {
          if (!result?.success) {
            alert(result?.error || 'Workspace removal failed.');
          } else {
            archiveState.items = null;
            if (state.currentView === 'archive') renderArchiveView(true);
          }
        });
      }
      return;
    }

    const terminateBtn = target.closest('.agent-terminate-btn') as HTMLButtonElement | null;
    if (terminateBtn?.dataset.terminateId) {
      event.stopPropagation();
      if (confirm('Force terminate this agent session?')) {
        const agentId = terminateBtn.dataset.terminateId;
        const dashboardAPI = getDashboardAPI();
        const terminateResult = dashboardAPI?.terminateAgentSession
          ? dashboardAPI.terminateAgentSession(agentId)
          : fetch(`/api/agents/${encodeURIComponent(agentId)}/terminate`, { method: 'POST' }).then((res) => res.json());
        terminateResult?.then((result) => {
          if (!result?.success) {
            alert(result?.error || 'Session termination failed.');
          }
        });
      }
      return;
    }

    const unregisterBtn = target.closest('.agent-unregister-btn') as HTMLButtonElement | null;
    if (unregisterBtn?.dataset.archiveId) {
      event.stopPropagation();
      if (confirm('Unregister this agent and move its record to Archive?')) {
        const dashboardAPI = getDashboardAPI();
        const archiveResult = dashboardAPI?.archiveRegisteredAgent?.(unregisterBtn.dataset.archiveId);
        archiveResult?.then(() => {
          syncCentralAgentRemoval(unregisterBtn.dataset.archiveId).catch((error) => {
            console.warn('[Central Agents] archive sync failed', error);
          });
          archiveState.items = null;
          if (state.currentView === 'archive') renderArchiveView(true);
        });
      }
      return;
    }

    const deleteBtn = target.closest('.agent-delete-btn') as HTMLButtonElement | null;
    if (deleteBtn?.dataset.deleteId) {
      event.stopPropagation();
      if (confirm('Delete this agent record permanently? This cannot be undone.')) {
        const dashboardAPI = getDashboardAPI();
        const deleteResult = dashboardAPI?.deleteRegisteredAgent?.(deleteBtn.dataset.deleteId);
        deleteResult?.then(() => {
          syncCentralAgentRemoval(deleteBtn.dataset.deleteId).catch((error) => {
            console.warn('[Central Agents] delete sync failed', error);
          });
          archiveState.items = null;
          if (state.currentView === 'archive') renderArchiveView(true);
        });
      }
      return;
    }

    if (target.closest('.nickname-input') || target.closest('.agent-display-name')) return;

    const card = target.closest('.mc-agent-card') as HTMLDivElement | null;
    if (card?.dataset.id) {
      agentPanel.querySelectorAll('.mc-agent-card.is-focused').forEach((el) => {
        if (el !== card) el.classList.remove('is-focused');
      });
      card.classList.add('is-focused');
      officeRenderer.focusOnCharacter?.(card.dataset.id);
    }
  });
}
