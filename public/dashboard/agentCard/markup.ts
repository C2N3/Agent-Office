import {
  type DashboardAgent,
  SHARED_AVATAR_FILES,
  escapeText,
  state,
} from '../shared.js';
import {
  formatWorkspaceTypeLabel,
  getActivityIcon,
  getStateColor,
  humanizeToolName,
} from '../agentViewHelpers.js';

export function buildAgentCardHtml(agent: DashboardAgent): string {
  const statusClass = ['working', 'thinking', 'error', 'done', 'completed', 'offline'].includes(agent.status)
    ? agent.status
    : 'waiting';
  const statusText = agent.status.toUpperCase();
  const typeHtml = agent.metadata?.isSubagent
    ? '<span class="mc-type-badge">SUB</span>'
    : (agent.isRegistered
      ? '<span class="mc-type-badge" style="background:var(--color-info-dim);color:var(--color-info)">REG</span>'
      : '<span class="mc-type-badge main">MAIN</span>');
  const isActive = ['working', 'thinking'].includes(statusClass);
  const humanizedTool = agent.currentTool ? humanizeToolName(agent.currentTool) : '';
  const activityIcon = getActivityIcon(statusClass, agent.currentTool);
  const activityLabel = getActivityLabel(statusClass, agent.currentTool);
  const activityDetail = agent.currentTool
    ? `<span class="mc-activity-tool">${escapeText(humanizedTool)}</span>`
    : (isActive ? '<span class="mc-activity-dots"><i></i><i></i><i></i></span>' : '');
  const activityStateClass = isActive ? `active ${statusClass}` : statusClass;
  const workspaceMeta = agent.metadata?.workspace || null;
  const workspaceType = formatWorkspaceTypeLabel(workspaceMeta?.type);
  const workspaceBranch = workspaceMeta?.branch || '';
  const workspaceRepo = workspaceMeta?.repositoryName || '';
  const isManagedWorktree = workspaceMeta?.type === 'git-worktree';
  const workspaceBadge = workspaceMeta
    ? `<span class="mc-type-badge workspace" title="${escapeText(workspaceType)}">${escapeText(workspaceType)}</span>`
    : '';
  const workspaceSummary = workspaceBranch
    ? `<div class="mc-agent-workspace" title="${escapeText(`${workspaceRepo || agent.project || 'workspace'} - ${workspaceBranch}`)}"><span class="mc-agent-workspace-repo">${escapeText(workspaceRepo || agent.project || 'workspace')}</span><span class="mc-agent-workspace-branch">${escapeText(workspaceBranch)}</span></div>`
    : '';
  const actionButtons = buildAgentActions(agent, workspaceBranch, isManagedWorktree);
  const timelineHtml = buildTimelineHtml(agent.id);
  const avatarFile = SHARED_AVATAR_FILES[agent.avatarIndex != null ? agent.avatarIndex : 0]
    || SHARED_AVATAR_FILES[0]
    || 'avatar_0.webp';

  return `
    <div class="mc-agent-header">
      <div class="mc-agent-identity">
        <div class="mc-agent-title-row">
          <div class="mc-agent-avatar" style="background-image:url('./public/characters/${avatarFile}')"></div>
          <div class="mc-agent-name">
            <span class="agent-display-name" data-agent-id="${agent.id}" title="Double-click to rename">${agent.nickname || agent.name || 'Agent'}</span>
          </div>
        </div>
        <div class="mc-agent-badges">${typeHtml}${workspaceBadge}</div>
      </div>
      <div class="mc-agent-status ${statusClass}">${statusText}</div>
    </div>
    ${agent.role ? `<div class="mc-agent-role">${agent.role}</div>` : ''}
    ${workspaceSummary}
    ${actionButtons ? `<div class="mc-agent-actions">${actionButtons}</div>` : ''}
    <div class="mc-agent-activity ${activityStateClass}">
      <span class="mc-activity-indicator">${activityIcon}</span>
      <span class="mc-activity-label">${activityLabel}</span>
      ${activityDetail}
    </div>
    ${timelineHtml}
  `;
}

function getActivityLabel(statusClass: string, currentTool?: string | null): string {
  if (currentTool) return statusClass === 'thinking' ? 'Thinking' : 'Running';
  if (statusClass === 'thinking') return 'Thinking';
  if (statusClass === 'working') return 'Working';
  if (statusClass === 'error') return 'Error';
  if (statusClass === 'done' || statusClass === 'completed') return 'Done';
  if (statusClass === 'offline') return 'Offline';
  return 'Idle';
}

function buildAgentActions(agent: DashboardAgent, workspaceBranch: string, isManagedWorktree: boolean): string {
  return [
    agent.isRegistered && agent.registryId
      ? `<button class="agent-history-btn" data-history-id="${agent.registryId}" data-agent-name="${agent.nickname || agent.name || 'Agent'}" title="Session History"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></button>`
      : '',
    agent.isRegistered
      ? `<button class="agent-assign-task-btn" data-agent-id="${agent.id}" title="Assign Task"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`
      : '',
    agent.isRegistered && agent.registryId && workspaceBranch && isManagedWorktree
      ? `<button class="agent-workspace-btn merge" data-workspace-merge-id="${agent.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Merge branch and clean up workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8"/><path d="M6 8v4c0 2 2 4 4 4h2"/><path d="M18 8v4c0 2-2 4-4 4h-2"/></svg>
        </button>`
      : '',
    agent.isRegistered && agent.registryId && workspaceBranch && isManagedWorktree
      ? `<button class="agent-workspace-btn remove" data-workspace-remove-id="${agent.registryId}" data-branch="${escapeText(workspaceBranch)}" title="Remove workspace and delete branch without merge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-avatar-btn" data-avatar-id="${agent.registryId}" data-agent-id="${agent.id}" title="Change avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/></svg></button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-unregister-btn" data-archive-id="${agent.registryId}" title="Unregister agent and move record to Archive">Unregister</button>`
      : '',
    agent.isRegistered && agent.registryId
      ? `<button class="agent-delete-btn agent-delete-inline" data-delete-id="${agent.registryId}" title="Delete agent record permanently">Delete</button>`
      : '',
  ].filter(Boolean).join('');
}

function buildTimelineHtml(agentId: string): string {
  const history = state.agentHistory.get(agentId) || [];
  if (history.length === 0) return '';

  const now = Date.now();
  const segmentHtml = history.map((entry: any, index: number) => {
    const end = (index + 1 < history.length) ? history[index + 1].ts : now;
    const duration = Math.max(end - entry.ts, 1);
    return `<div class="mc-timeline-seg" style="flex-grow:${duration};background:${getStateColor(entry.state)}" title="${entry.state}"></div>`;
  }).join('');

  return `<div class="mc-timeline">${segmentHtml}</div>`;
}
