import React, {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { state, type DashboardAgent } from '../shared.js';
import { dashboardModalRegistry } from '../modals/registry.js';

type TeamMemberOption = {
  registryId: string;
  name: string;
  role: string;
};

type TeamFormationContext = {
  leaderId: string;
  leaderName: string;
  repositoryPath: string;
  candidates: TeamMemberOption[];
};

function resolveRepositoryPath(agent: DashboardAgent): string {
  return agent.metadata?.workspace?.repositoryPath
    || agent.metadata?.projectPath
    || agent.project
    || '';
}

function resolveAgentName(agent: DashboardAgent): string {
  return agent.nickname || agent.name || 'Agent';
}

function buildTeamCandidates(leaderRegistryId: string, repositoryPath: string): TeamMemberOption[] {
  const candidates: TeamMemberOption[] = [];

  for (const [, agent] of state.agents) {
    if (!agent.isRegistered || !agent.registryId) continue;
    if (agent.registryId === leaderRegistryId) continue;
    if (resolveRepositoryPath(agent) !== repositoryPath) continue;

    candidates.push({
      registryId: agent.registryId,
      name: resolveAgentName(agent),
      role: agent.role || '',
    });
  }

  return candidates;
}

export function TeamFormationModal(): ReactElement | null {
  const goalInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [context, setContext] = useState<TeamFormationContext | null>(null);
  const [goal, setGoal] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const closeTeamFormation = useCallback(() => {
    setContext(null);
    setGoal('');
    setSelectedMemberIds([]);
    setError('');
    setSubmitting(false);
  }, []);

  const openTeamFormationModal = useCallback((agentId: string, registryId: string) => {
    const agent = state.agents.get(agentId);
    if (!agent) return;

    const repositoryPath = resolveRepositoryPath(agent);
    const candidates = buildTeamCandidates(registryId, repositoryPath);

    setContext({
      leaderId: registryId,
      leaderName: resolveAgentName(agent),
      repositoryPath,
      candidates,
    });
    setGoal('');
    setSelectedMemberIds(candidates.map((candidate) => candidate.registryId));
    setError('');
    setSubmitting(false);
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openTeamFormationModal = openTeamFormationModal;
    return () => {
      if (dashboardModalRegistry.openTeamFormationModal === openTeamFormationModal) {
        delete dashboardModalRegistry.openTeamFormationModal;
      }
    };
  }, [openTeamFormationModal]);

  useLayoutEffect(() => {
    if (!context) return;

    const frameId = requestAnimationFrame(() => {
      goalInputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [context]);

  const toggleMemberSelection = useCallback((registryId: string) => {
    setSelectedMemberIds((currentIds) => (
      currentIds.includes(registryId)
        ? currentIds.filter((currentId) => currentId !== registryId)
        : [...currentIds, registryId]
    ));
    setError('');
  }, []);

  const handleStartTeam = useCallback(async () => {
    if (!context) return;

    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      setError('Goal is required.');
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError('Select at least one team member.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: trimmedGoal,
          leaderAgentId: context.leaderId,
          memberAgentIds: [context.leaderId, ...selectedMemberIds],
          repositoryPath: context.repositoryPath,
        }),
      });
      const data = await response.json() as { error?: string };

      if (data.error) {
        setError(data.error);
        return;
      }

      closeTeamFormation();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(`Failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }, [closeTeamFormation, context, goal, selectedMemberIds]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeTeamFormation();
    }
  }, [closeTeamFormation]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeTeamFormation();
    }
  }, [closeTeamFormation]);

  if (!context) return null;

  const hasCandidates = context.candidates.length > 0;

  return (
    <div
      aria-labelledby="teamFormationTitle"
      aria-modal="true"
      className="modal-overlay"
      id="teamFormationModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content create-agent-modal">
        <div className="modal-header">
          <span id="teamFormationTitle">Team Formation - Leader: {context.leaderName}</span>
          <button className="conv-modal-close" onClick={closeTeamFormation} type="button">&times;</button>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label className="modal-label">
            Team Goal
            <textarea
              className="modal-input modal-textarea"
              onChange={(event) => {
                setGoal(event.target.value);
                setError('');
              }}
              placeholder="What should the team accomplish?"
              ref={goalInputRef}
              rows={3}
              value={goal}
            />
          </label>
          <label className="modal-label">Select Members</label>
          <div className="team-member-list">
            {hasCandidates ? context.candidates.map((candidate) => (
              <label className="team-member-item" key={candidate.registryId}>
                <input
                  checked={selectedMemberIds.includes(candidate.registryId)}
                  onChange={() => toggleMemberSelection(candidate.registryId)}
                  type="checkbox"
                />
                <span className="team-member-name">{candidate.name}</span>
                <span className="team-member-role">{candidate.role}</span>
              </label>
            )) : (
              <div className="team-no-members">같은 레포의 다른 에이전트가 없습니다.</div>
            )}
          </div>
        </div>
        <div className="modal-error">{error}</div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={closeTeamFormation} type="button">Cancel</button>
          <button
            className="btn-primary"
            disabled={!hasCandidates || submitting}
            onClick={() => { void handleStartTeam(); }}
            type="button"
          >
            {submitting ? 'Starting...' : 'Start Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
