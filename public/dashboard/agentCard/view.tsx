import React, { type CSSProperties, type ReactElement } from 'react';
import {
  type DashboardAgent,
  SHARED_AVATAR_FILES,
  state,
} from '../shared.js';
import {
  formatWorkspaceTypeLabel,
  getActivityIcon,
  getStateColor,
  humanizeToolName,
} from '../agentViewHelpers.js';

function activityLabel(statusClass: string, currentTool?: string | null): string {
  if (currentTool) return statusClass === 'thinking' ? 'Thinking' : 'Running';
  if (statusClass === 'thinking') return 'Thinking';
  if (statusClass === 'working') return 'Working';
  if (statusClass === 'error') return 'Error';
  if (statusClass === 'done' || statusClass === 'completed') return 'Done';
  if (statusClass === 'offline') return 'Offline';
  return 'Idle';
}

function tooltipProps(label: string): Record<string, string> {
  return {
    'aria-label': label,
    'data-tooltip': label,
  };
}

function actionButtons(agent: DashboardAgent, workspaceBranch: string, isManagedWorktree: boolean): ReactElement[] {
  const canTerminate = !['offline', 'done', 'completed'].includes(agent.status);
  const isLocalRegistered = !!agent.isRegistered && agent.metadata?.source !== 'central';
  const actions: ReactElement[] = [];

  if (isLocalRegistered && agent.registryId) {
    actions.push(
      <button
        key="history"
        className="agent-history-btn"
        data-agent-name={agent.nickname || agent.name || 'Agent'}
        data-history-id={agent.registryId}
        type="button"
        {...tooltipProps('Session History')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </button>,
    );
    actions.push(
      <button
        key="assign"
        className="agent-assign-task-btn"
        data-agent-id={agent.id}
        type="button"
        {...tooltipProps('Assign Task')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>,
    );
    actions.push(
      <button
        key="team"
        className="agent-form-team-btn"
        data-agent-id={agent.id}
        data-registry-id={agent.registryId}
        type="button"
        {...tooltipProps('Form Team')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>,
    );
  }

  if (isLocalRegistered && agent.registryId && workspaceBranch && isManagedWorktree) {
    actions.push(
      <button
        key="merge"
        className="agent-workspace-btn merge"
        data-branch={workspaceBranch}
        data-workspace-merge-id={agent.registryId}
        type="button"
        {...tooltipProps('Merge branch and clean up workspace')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="M6 8v4c0 2 2 4 4 4h2" />
          <path d="M18 8v4c0 2-2 4-4 4h-2" />
        </svg>
      </button>,
    );
    actions.push(
      <button
        key="remove-workspace"
        className="agent-workspace-btn remove"
        data-branch={workspaceBranch}
        data-workspace-remove-id={agent.registryId}
        type="button"
        {...tooltipProps('Remove workspace and delete branch without merge')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>,
    );
  }

  if (isLocalRegistered && agent.registryId) {
    actions.push(
      <button
        key="avatar"
        className="agent-avatar-btn"
        data-agent-id={agent.id}
        data-avatar-id={agent.registryId}
        type="button"
        {...tooltipProps('Change avatar')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7" />
        </svg>
      </button>,
    );
  }

  if (canTerminate) {
    actions.push(
      <button
        key="terminate"
        className="agent-terminate-btn"
        data-terminate-id={agent.id}
        type="button"
        {...tooltipProps('Force terminate session')}
      >
        Stop
      </button>,
    );
  }

  if (isLocalRegistered && agent.registryId) {
    actions.push(
      <button
        key="unregister"
        className="agent-unregister-btn"
        data-archive-id={agent.registryId}
        type="button"
        {...tooltipProps('Unregister agent and move record to Archive')}
      >
        Unregister
      </button>,
    );
    actions.push(
      <button
        key="delete"
        className="agent-delete-btn agent-delete-inline"
        data-delete-id={agent.registryId}
        type="button"
        {...tooltipProps('Delete agent record permanently')}
      >
        Delete
      </button>,
    );
  }

  return actions;
}

function timeline(agentId: string): ReactElement | null {
  const history = state.agentHistory.get(agentId) || [];
  if (history.length === 0) return null;

  const now = Date.now();
  return (
    <div className="mc-timeline">
      {history.map((entry, index) => {
        const end = index + 1 < history.length ? history[index + 1].ts : now;
        const duration = Math.max(end - entry.ts, 1);
        const style: CSSProperties = {
          background: getStateColor(entry.state),
          flexGrow: duration,
        };
        return <div key={`${entry.ts}-${index}`} className="mc-timeline-seg" style={style} title={entry.state} />;
      })}
    </div>
  );
}

export function AgentCard({ agent, focused }: { agent: DashboardAgent; focused: boolean }): ReactElement {
  const statusClass = ['working', 'thinking', 'error', 'done', 'completed', 'offline'].includes(agent.status)
    ? agent.status
    : 'waiting';
  const statusText = agent.status.toUpperCase();
  const isActive = ['working', 'thinking'].includes(statusClass);
  const workspaceMeta = agent.metadata?.workspace || null;
  const workspaceBranch = workspaceMeta?.branch || '';
  const workspaceRepo = workspaceMeta?.repositoryName || '';
  const workspaceType = formatWorkspaceTypeLabel(workspaceMeta?.type);
  const workspaceTitle = `${workspaceRepo || agent.project || 'workspace'} - ${workspaceBranch}`;
  const workspaceBadge = workspaceMeta
    ? <span className="mc-type-badge workspace" title={workspaceType}>{workspaceType}</span>
    : null;
  const avatarFile = SHARED_AVATAR_FILES[agent.avatarIndex != null ? agent.avatarIndex : 0]
    || SHARED_AVATAR_FILES[0]
    || 'avatar_0.webp';
  const actions = actionButtons(agent, workspaceBranch, workspaceMeta?.type === 'git-worktree');
  const activityIcon = getActivityIcon(statusClass, agent.currentTool);
  const activityStateClass = isActive ? `mc-agent-activity active ${statusClass}` : `mc-agent-activity ${statusClass}`;
  const toolName = agent.currentTool ? humanizeToolName(agent.currentTool) : '';

  return (
    <div className={`mc-agent-card${focused ? ' is-focused' : ''}`} data-id={agent.id} data-status={agent.status}>
      <div className="mc-agent-header">
        <div className="mc-agent-identity">
          <div className="mc-agent-title-row">
            <div className="mc-agent-avatar" style={{ backgroundImage: `url('./public/characters/${avatarFile}')` }} />
            <div className="mc-agent-name">
              <span className="agent-display-name" data-agent-id={agent.id} title="Double-click to rename">
                {agent.nickname || agent.name || 'Agent'}
              </span>
            </div>
          </div>
          <div className="mc-agent-badges">
            {agent.metadata?.isSubagent
              ? <span className="mc-type-badge">SUB</span>
              : agent.isRegistered
                ? <span className="mc-type-badge" style={{ background: 'var(--color-info-dim)', color: 'var(--color-info)' }}>REG</span>
                : <span className="mc-type-badge main">MAIN</span>}
            {workspaceBadge}
          </div>
        </div>
        <div className={`mc-agent-status ${statusClass}`}>{statusText}</div>
      </div>
      {agent.role ? <div className="mc-agent-role">{agent.role}</div> : null}
      {workspaceBranch ? (
        <div className="mc-agent-workspace" title={workspaceTitle}>
          <span className="mc-agent-workspace-repo">{workspaceRepo || agent.project || 'workspace'}</span>
          <span className="mc-agent-workspace-branch">{workspaceBranch}</span>
        </div>
      ) : null}
      {actions.length > 0 ? <div className="mc-agent-actions">{actions}</div> : null}
      <div className={activityStateClass}>
        <span
          className="mc-activity-indicator"
          dangerouslySetInnerHTML={{ __html: activityIcon }}
        />
        <span className="mc-activity-label">{activityLabel(statusClass, agent.currentTool)}</span>
        {agent.currentTool
          ? <span className="mc-activity-tool">{toolName}</span>
          : isActive
            ? <span className="mc-activity-dots"><i /><i /><i /></span>
            : null}
      </div>
      {timeline(agent.id)}
    </div>
  );
}
