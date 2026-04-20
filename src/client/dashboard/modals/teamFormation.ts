
import { state, getDashboardAPI } from '../shared.js';
import { dashboardModalRegistry } from './registry.js';

export function setupTeamFormationModal() {
  const modal = document.getElementById('teamFormationModal');
  const closeBtn = document.getElementById('closeTeamFormationBtn');
  const cancelBtn = document.getElementById('cancelTeamFormationBtn');
  const startBtn = document.getElementById('startTeamBtn') as HTMLButtonElement | null;
  const memberListEl = document.getElementById('teamMemberList');
  const goalInput = document.getElementById('teamGoalInput') as HTMLTextAreaElement | null;
  const leaderNameEl = document.getElementById('teamLeaderName');
  const errorEl = document.getElementById('teamFormationError');
  if (!modal || !memberListEl || !goalInput || !startBtn) return;

  let leaderId = '';
  let leaderRepoPath = '';

  function closeModal() {
    modal.style.display = 'none';
    leaderId = '';
    leaderRepoPath = '';
    if (errorEl) errorEl.textContent = '';
  }

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  function openTeamFormation(agentId: string, registryId: string) {
    const agent = state.agents.get(agentId);
    if (!agent) return;

    leaderId = registryId;
    leaderRepoPath = agent.metadata?.workspace?.repositoryPath || agent.metadata?.projectPath || agent.project || '';

    if (leaderNameEl) leaderNameEl.textContent = agent.nickname || agent.name || 'Agent';
    if (goalInput) goalInput.value = '';
    if (errorEl) errorEl.textContent = '';

    // Build member list: same-repo registered agents (excluding leader)
    const candidates: { id: string; registryId: string; name: string; role: string }[] = [];
    for (const [id, a] of state.agents) {
      if (!a.isRegistered || !a.registryId) continue;
      if (a.registryId === registryId) continue; // skip leader
      const repoPath = a.metadata?.workspace?.repositoryPath || a.metadata?.projectPath || a.project || '';
      if (repoPath === leaderRepoPath) {
        candidates.push({
          id,
          registryId: a.registryId,
          name: a.nickname || a.name || 'Agent',
          role: a.role || '',
        });
      }
    }

    if (candidates.length === 0) {
      memberListEl.innerHTML = '<div class="team-no-members">같은 레포의 다른 에이전트가 없습니다.</div>';
      startBtn.disabled = true;
    } else {
      memberListEl.innerHTML = candidates.map((c) => `
        <label class="team-member-item">
          <input type="checkbox" value="${c.registryId}" checked>
          <span class="team-member-name">${c.name}</span>
          <span class="team-member-role">${c.role}</span>
        </label>
      `).join('');
      startBtn.disabled = false;
    }

    modal.style.display = '';
    requestAnimationFrame(() => goalInput?.focus());
  }

  startBtn.addEventListener('click', async () => {
    if (!leaderId) return;
    const goal = goalInput?.value.trim();
    if (!goal) {
      if (errorEl) errorEl.textContent = 'Goal is required.';
      return;
    }

    const checkboxes = memberListEl.querySelectorAll('input[type="checkbox"]:checked');
    const selectedMemberIds: string[] = Array.from(checkboxes).map((cb: any) => cb.value);
    if (selectedMemberIds.length === 0) {
      if (errorEl) errorEl.textContent = 'Select at least one team member.';
      return;
    }

    // Leader is included in memberAgentIds
    const allMemberIds = [leaderId, ...selectedMemberIds];

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    if (errorEl) errorEl.textContent = '';

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          leaderAgentId: leaderId,
          memberAgentIds: allMemberIds,
          repositoryPath: leaderRepoPath,
        }),
      });
      const data = await res.json();
      if (data.error) {
        if (errorEl) errorEl.textContent = data.error;
      } else {
        closeModal();
      }
    } catch (e: any) {
      if (errorEl) errorEl.textContent = `Failed: ${e.message}`;
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Team';
    }
  });

  dashboardModalRegistry.openTeamFormationModal = openTeamFormation;
}
