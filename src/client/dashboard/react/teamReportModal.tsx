import React, {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { dashboardModalRegistry } from '../modals/registry.js';
import { MarkdownBlock } from './reportMarkdown.js';

type TeamReportMember = {
  agentName?: string | null;
  output?: string | null;
  status?: string | null;
  title?: string | null;
};

type TeamReportData = {
  diffSummary?: string | null;
  goal?: string | null;
  members?: TeamReportMember[];
  teamName?: string | null;
};

type TeamReportAction = 'merge' | 'reject' | null;

function clearTeamReportBubbles(teamId: string): void {
  const officeChars = (globalThis as any).officeCharacters;
  officeChars?.characters?.forEach?.((char: { bubble?: { isReport?: boolean; teamId?: string } | null }) => {
    if (char.bubble?.isReport && char.bubble?.teamId === teamId) {
      char.bubble = null;
    }
  });
}

export function TeamReportModal(): ReactElement | null {
  const requestIdRef = useRef(0);
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('Team Report');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<TeamReportData | null>(null);
  const [actionState, setActionState] = useState<TeamReportAction>(null);

  const closeTeamReport = useCallback(() => {
    requestIdRef.current += 1;
    setTeamId('');
    setTitle('Team Report');
    setLoading(false);
    setError('');
    setReport(null);
    setActionState(null);
  }, []);

  const openTeamReportModal = useCallback(async (nextTeamId: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setTeamId(nextTeamId);
    setTitle('Team Report');
    setLoading(true);
    setError('');
    setReport(null);
    setActionState(null);

    try {
      const response = await fetch(`/api/teams/${nextTeamId}/report`);
      const data = await response.json() as TeamReportData;
      if (requestIdRef.current !== requestId) return;

      setTitle(data.teamName || 'Team Report');
      setReport(data);
    } catch {
      if (requestIdRef.current === requestId) {
        setError('Failed to load team report.');
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openTeamReportModal = openTeamReportModal;
    return () => {
      if (dashboardModalRegistry.openTeamReportModal === openTeamReportModal) {
        delete dashboardModalRegistry.openTeamReportModal;
      }
    };
  }, [openTeamReportModal]);

  const mergeTeamReport = useCallback(async () => {
    if (!teamId) return;

    setActionState('merge');
    try {
      const response = await fetch(`/api/teams/${teamId}/merge`, { method: 'POST' });
      const data = await response.json() as { error?: string; success?: boolean };
      if (data.success) {
        clearTeamReportBubbles(teamId);
        closeTeamReport();
      } else {
        alert(data.error || 'Merge failed');
      }
    } catch {
      alert('Merge request failed');
    } finally {
      setActionState(null);
    }
  }, [closeTeamReport, teamId]);

  const rejectTeamReport = useCallback(async () => {
    if (!teamId) return;
    if (!confirm('Reject team results and discard all changes?')) return;

    setActionState('reject');
    try {
      const response = await fetch(`/api/teams/${teamId}/reject`, { method: 'POST' });
      const data = await response.json() as { error?: string; success?: boolean };
      if (data.success) {
        clearTeamReportBubbles(teamId);
        closeTeamReport();
      } else {
        alert(data.error || 'Reject failed');
      }
    } catch {
      alert('Reject request failed');
    } finally {
      setActionState(null);
    }
  }, [closeTeamReport, teamId]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeTeamReport();
  }, [closeTeamReport]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') closeTeamReport();
  }, [closeTeamReport]);

  if (!teamId) return null;

  return (
    <div
      aria-labelledby="teamReportTitle"
      aria-modal="true"
      className="modal-overlay"
      id="teamReportModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content task-report-modal">
        <div className="modal-header">
          <span id="teamReportTitle">{title}</span>
          <button className="conv-modal-close" onClick={closeTeamReport} type="button">&times;</button>
        </div>
        <div className="task-report-body">
          {loading ? <div className="diff-empty">Loading...</div> : null}
          {error ? <div className="modal-error">{error}</div> : null}
          {!loading && !error && report ? <TeamReportBody report={report} /> : null}
        </div>
        <div className="modal-actions task-report-actions">
          <button
            className="btn-primary"
            disabled={actionState != null || loading}
            onClick={() => { void mergeTeamReport(); }}
            type="button"
          >
            {actionState === 'merge' ? 'Merging...' : 'Merge All'}
          </button>
          <button
            className="btn-secondary btn-danger"
            disabled={actionState != null || loading}
            onClick={() => { void rejectTeamReport(); }}
            type="button"
          >
            {actionState === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamReportBody({ report }: { report: TeamReportData }): ReactElement {
  const members = report.members || [];

  return (
    <>
      <div className="task-report-section">
        <h4>Goal</h4>
        <div className="task-report-md" style={{ maxHeight: 100 }}>{report.goal || ''}</div>
      </div>
      <div className="task-report-section">
        <h4>Member Reports ({members.length})</h4>
        {members.length ? members.map((member, index) => (
          <details className="team-member-report" key={`${member.agentName || 'agent'}-${index}`}>
            <summary>
              <span className="team-member-report-name">{member.agentName || 'Agent'}</span>
              <span className="team-member-report-title">{member.title || ''}</span>
              <span className={member.status === 'succeeded' ? 'diff-stat-add' : 'diff-stat-del'}>
                {member.status || 'unknown'}
              </span>
            </summary>
            <MarkdownBlock markdown={member.output || '(no output)'} />
          </details>
        )) : <div className="diff-empty">No member reports</div>}
      </div>
      {report.diffSummary ? (
        <div className="task-report-section">
          <h4>Changes (Integration Branch)</h4>
          <pre className="task-report-pre">{report.diffSummary}</pre>
        </div>
      ) : null}
    </>
  );
}
