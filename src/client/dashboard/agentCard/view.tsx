import React, { type CSSProperties, type ReactElement } from 'react';
import {
  type DashboardAgent,
  type DashboardAgentHistoryEntry,
  SHARED_AVATAR_FILES,
} from '../shared';
import {
  formatWorkspaceTypeLabel,
  getActivityIcon,
  getStateColor,
  humanizeToolName,
} from '../agentViewHelpers';
import { AgentNameEditor } from './nameEditor';
import { getAgentOwnershipBadge } from './ownership';

type AgentCardProps = {
  key?: string;
  agent: DashboardAgent;
  focused: boolean;
  history: DashboardAgentHistoryEntry[];
  onChangeAvatar: (agentId: string, registryId: string) => void;
  onDelete: (registryId: string) => void;
  onFocus: (agentId: string) => void;
  onOpenTask: (agent: DashboardAgent) => void;
  onRename: (agentId: string, nickname: string) => boolean | Promise<boolean>;
  onTerminate: (agentId: string) => void;
  onUnregister: (registryId: string) => void;
};

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

function renderTimeline(history: DashboardAgentHistoryEntry[]): ReactElement | null {
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

export function AgentCard({
  agent,
  focused,
  history,
  onChangeAvatar,
  onDelete,
  onFocus,
  onOpenTask,
  onRename,
  onTerminate,
  onUnregister,
}: AgentCardProps): ReactElement {
  const avatarFile = SHARED_AVATAR_FILES[agent.avatarIndex != null ? agent.avatarIndex : 0]
    || SHARED_AVATAR_FILES[0]
    || 'avatar_0.webp';
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
  const isLocalRegistered = !!agent.isRegistered && agent.metadata?.source !== 'central';
  const canAssignTask = !!agent.isRegistered && !!(agent.registryId || agent.id);
  const canRename = isLocalRegistered || agent.metadata?.canRename === true;
  const canTerminate = !['offline', 'done', 'completed'].includes(agent.status);
  const activityIcon = getActivityIcon(statusClass, agent.currentTool);
  const activityStateClass = isActive ? `mc-agent-activity active ${statusClass}` : `mc-agent-activity ${statusClass}`;
  const toolName = agent.currentTool ? humanizeToolName(agent.currentTool) : '';
  const displayName = agent.nickname || agent.name || 'Agent';
  const ownershipBadge = getAgentOwnershipBadge(agent);

  return (
    <div
      className={`mc-agent-card${focused ? ' is-focused' : ''}`}
      data-id={agent.id}
      data-status={agent.status}
      onClick={() => onFocus(agent.id)}
    >
      <div className="mc-agent-header">
        <div className="mc-agent-identity">
          <div className="mc-agent-title-row">
            <div className="mc-agent-avatar" style={{ backgroundImage: `url('/assets/characters/${avatarFile}')` }} />
            <div className="mc-agent-name">
              {canRename ? (
                <AgentNameEditor
                  agentId={agent.id}
                  displayName={displayName}
                  hasNickname={!!agent.nickname}
                  onRename={onRename}
                />
              ) : (
                <span className="agent-display-name" data-agent-id={agent.id}>{displayName}</span>
              )}
            </div>
          </div>
          <div className="mc-agent-badges">
            {agent.metadata?.isSubagent
              ? <span className="mc-type-badge">SUB</span>
              : agent.isRegistered
                ? <span className="mc-type-badge" style={{ background: 'var(--color-info-dim)', color: 'var(--color-info)' }}>REG</span>
                : <span className="mc-type-badge main">MAIN</span>}
            {workspaceBadge}
            {ownershipBadge
              ? <span className={`mc-type-badge ${ownershipBadge.className}`} title={ownershipBadge.title}>{ownershipBadge.label}</span>
              : null}
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
      <div className="mc-agent-actions">
        {canAssignTask ? (
          <button className="agent-assign-task-btn" type="button" onClick={(event) => { event.stopPropagation(); onOpenTask(agent); }} {...tooltipProps('Assign Task')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        ) : null}
        {isLocalRegistered && agent.registryId ? (
          <button className="agent-avatar-btn" type="button" onClick={(event) => { event.stopPropagation(); onChangeAvatar(agent.id, agent.registryId!); }} {...tooltipProps('Change avatar')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7" />
            </svg>
          </button>
        ) : null}
        {canTerminate ? (
          <button className="agent-terminate-btn" type="button" onClick={(event) => { event.stopPropagation(); onTerminate(agent.id); }} {...tooltipProps('Force terminate session')}>
            Stop
          </button>
        ) : null}
        {isLocalRegistered && agent.registryId ? (
          <>
            <button className="agent-unregister-btn" type="button" onClick={(event) => { event.stopPropagation(); onUnregister(agent.registryId!); }} {...tooltipProps('Unregister agent and move record to Archive')}>
              Unregister
            </button>
            <button className="agent-delete-btn agent-delete-inline" type="button" onClick={(event) => { event.stopPropagation(); onDelete(agent.registryId!); }} {...tooltipProps('Delete agent record permanently')}>
              Delete
            </button>
          </>
        ) : null}
      </div>
      <div className={activityStateClass}>
        <span className="mc-activity-indicator" dangerouslySetInnerHTML={{ __html: activityIcon }} />
        <span className="mc-activity-label">{activityLabel(statusClass, agent.currentTool)}</span>
        {agent.currentTool
          ? <span className="mc-activity-tool">{toolName}</span>
          : isActive
            ? <span className="mc-activity-dots"><i /><i /><i /></span>
            : null}
      </div>
      {renderTimeline(history)}
    </div>
  );
}
