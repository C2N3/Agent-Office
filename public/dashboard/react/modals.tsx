import React, { type ReactElement } from 'react';
import { renderProviderButtons } from '../providerCatalog.js';

export function DashboardModals(): ReactElement {
  return (
    <>
      <div className="modal-overlay" id="createAgentModal" style={{ display: 'none' }}>
        <div className="modal-content create-agent-modal">
          <div className="modal-header">Register New Agent</div>
          <form id="createAgentForm">
            <div className="create-agent-mode-card">
              <div className="create-agent-mode-copy">
                <div className="create-agent-mode-eyebrow">Unified Flow</div>
                <div className="create-agent-mode-title">Single Workspace Path</div>
                <div className="create-agent-mode-description">Enter one folder path and Agent-Office will either register it directly or create a managed git worktree when that repository is already in use.</div>
              </div>
            </div>
            <label className="modal-label">Name<input type="text" id="agentNameInput" className="modal-input" placeholder="e.g. Stock Monitor Agent" required /></label>
            <label className="modal-label">Role<input type="text" id="agentRoleInput" className="modal-input" placeholder="e.g. Service development, bug fixes" /></label>
            <label className="modal-label">Workspace Path<div className="modal-path-field"><input type="text" id="agentWorkspacePathInput" className="modal-input" placeholder="e.g. D:\projects\stock-monitor" /><button type="button" className="btn-secondary modal-browse-btn" id="agentWorkspacePathBrowseBtn">Browse</button></div></label>
            <div className="create-agent-preview" id="agentWorkspacePreviewStatus">Enter a workspace path to inspect how it will be registered.</div>
            <label className="modal-checkbox"><input type="checkbox" id="workspaceOpenTerminalInput" defaultChecked /><span>Open embedded terminal after create</span></label>
            <details className="create-agent-advanced" id="agentAdvancedOptions">
              <summary>Advanced Options</summary>
              <div className="create-agent-advanced-body">
                <label className="modal-label">Strategy<select id="agentStrategyInput" className="modal-input"><option value="auto">Auto</option><option value="existing">Register exact path</option><option value="worktree">Create managed worktree</option></select></label>
                <div id="worktreeAgentFields">
                  <div className="modal-input-row">
                    <label className="modal-label">Branch Name<input type="text" id="agentBranchInput" className="modal-input" placeholder="optional, auto-generated if blank" /></label>
                    <label className="modal-label">Start From<input type="text" id="agentStartPointInput" className="modal-input" placeholder="HEAD" /></label>
                  </div>
                  <div className="modal-input-row">
                    <label className="modal-label">Base Branch<input type="text" id="agentBaseBranchInput" className="modal-input" list="agentBaseBranchList" placeholder="auto-detected from repo" /><datalist id="agentBaseBranchList" /></label>
                    <label className="modal-label">Branch Mode<input type="text" id="agentBranchModeInput" className="modal-input" defaultValue="Auto" readOnly /></label>
                  </div>
                  <div className="modal-help" id="agentRepoInspectStatus">Worktree options are available when the effective strategy is managed git worktree.</div>
                  <label className="modal-label">Workspace Parent<div className="modal-path-field"><input type="text" id="agentWorkspaceParentInput" className="modal-input" placeholder="optional, defaults to the global worktree directory" /><button type="button" className="btn-secondary modal-browse-btn" id="agentWorkspaceParentBrowseBtn">Browse</button></div></label>
                  <label className="modal-label">Copy Paths<textarea id="agentCopyPathsInput" className="modal-input modal-textarea" rows={3} placeholder={'.env.local\nconfig/dev.json'} /><span className="modal-help">Copied from the source repo into the new worktree after checkout.</span></label>
                  <label className="modal-label">Symlink Paths<textarea id="agentSymlinkPathsInput" className="modal-input modal-textarea" rows={3} placeholder={'node_modules\n.turbo'} /><span className="modal-help">Creates links inside the worktree. Useful for heavy dependency folders.</span></label>
                  <label className="modal-label">Bootstrap Command<input type="text" id="agentBootstrapCommandInput" className="modal-input" placeholder="e.g. npm install && npm run dev" /><span className="modal-help">Optional command sent to the embedded terminal right after managed workspace creation.</span></label>
                </div>
              </div>
            </details>
            <label className="modal-label">Provider<div className="provider-select" id="providerSelect" dangerouslySetInnerHTML={{ __html: renderProviderButtons() }} /></label>
            <div className="modal-error" id="createAgentError" />
            <div className="modal-actions"><button type="button" className="btn-secondary" id="cancelCreateBtn">Cancel</button><button type="submit" className="btn-primary">Create</button></div>
          </form>
        </div>
      </div>

      <div className="modal-overlay" id="assignTaskModal" style={{ display: 'none' }}>
        <div className="modal-content create-agent-modal">
          <div className="modal-header">Assign Task — <span id="assignTaskAgentName" /></div>
          <form id="assignTaskForm">
            <label className="modal-label">Task Prompt<textarea id="taskPromptInput" className="modal-input modal-textarea" rows={4} placeholder="What should this agent do?" required /></label>
            <div className="modal-input-row">
              <label className="modal-label">Provider<select id="taskProviderInput" className="modal-input"><option value="claude">Claude</option><option value="codex">Codex</option><option value="gemini">Gemini</option></select></label>
              <label className="modal-label">Model<select id="taskModelInput" className="modal-input"><option value="">Default</option></select></label>
            </div>
            <div className="modal-input-row">
              <label className="modal-label">Max Turns<input type="number" id="taskMaxTurnsInput" className="modal-input" defaultValue="30" min="1" max="200" /></label>
              <label className="modal-label">Priority<select id="taskPriorityInput" className="modal-input"><option value="low">Low</option><option value="normal" defaultValue="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            </div>
            <label className="modal-checkbox"><input type="checkbox" id="taskAutoMergeInput" /><span>Auto-merge branch on success</span></label>
            <div className="modal-error" id="assignTaskError" />
            <div className="modal-actions"><button type="button" className="btn-secondary" id="cancelAssignTaskBtn">Cancel</button><button type="submit" className="btn-primary">Assign Task</button></div>
          </form>
        </div>
      </div>

      <div className="modal-overlay" id="avatarPickerModal" style={{ display: 'none' }} tabIndex={-1}>
        <div className="modal-content avatar-picker-modal">
          <div className="modal-header">Change Avatar</div>
          <div className="avatar-picker-tabs" id="avatarPickerTabs" />
          <div className="avatar-picker-grid" id="avatarPickerGrid" />
          <div className="modal-actions"><button type="button" className="btn-secondary" id="cancelAvatarBtn">Cancel</button></div>
        </div>
      </div>

      <div className="office-popover" id="officePopover" />

      <div className="modal-overlay" id="taskReportModal" style={{ display: 'none' }}>
        <div className="modal-content task-report-modal">
          <div className="modal-header"><span id="taskReportTitle">Task Report</span><button className="conv-modal-close" id="closeTaskReportBtn">&times;</button></div>
          <div className="task-report-body">
            <div className="task-report-section"><h4>Output</h4><div className="task-report-md" id="taskReportOutput">Loading...</div></div>
            <div className="task-report-section"><h4>Changes</h4><div id="taskReportChanges" /></div>
          </div>
          <div className="task-report-section task-report-followup-section">
            <h4>Follow-up Task</h4>
            <div className="task-report-followup-help">Queue a new task on this workspace. The new task inherits this worktree&apos;s changes as its starting point.</div>
            <textarea id="taskReportFollowUpPrompt" className="modal-input modal-textarea" rows={3} placeholder="What should the agent do next?" />
            <div className="modal-error" id="taskReportFollowUpError" />
          </div>
          <div className="modal-actions task-report-actions"><button className="btn-secondary" id="taskReportFollowUpBtn">Send Follow-up</button><button className="btn-primary" id="taskReportMergeBtn">Merge</button><button className="btn-secondary btn-danger" id="taskReportRejectBtn">Reject</button></div>
        </div>
      </div>

      <div className="modal-overlay" id="teamFormationModal" style={{ display: 'none' }}>
        <div className="modal-content create-agent-modal">
          <div className="modal-header">Team Formation — Leader: <span id="teamLeaderName" /><button className="conv-modal-close" id="closeTeamFormationBtn">&times;</button></div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="modal-label">Team Goal<textarea id="teamGoalInput" className="modal-input modal-textarea" rows={3} placeholder="What should the team accomplish?" /></label>
            <label className="modal-label">Select Members</label>
            <div className="team-member-list" id="teamMemberList" />
          </div>
          <div className="modal-error" id="teamFormationError" />
          <div className="modal-actions"><button type="button" className="btn-secondary" id="cancelTeamFormationBtn">Cancel</button><button type="button" className="btn-primary" id="startTeamBtn">Start Team</button></div>
        </div>
      </div>

      <div className="modal-overlay" id="teamReportModal" style={{ display: 'none' }}>
        <div className="modal-content task-report-modal">
          <div className="modal-header"><span id="teamReportTitle">Team Report</span><button className="conv-modal-close" id="closeTeamReportBtn">&times;</button></div>
          <div className="task-report-body" id="teamReportBody" />
          <div className="modal-actions task-report-actions"><button className="btn-primary" id="teamReportMergeBtn">Merge All</button><button className="btn-secondary btn-danger" id="teamReportRejectBtn">Reject</button></div>
        </div>
      </div>
    </>
  );
}
