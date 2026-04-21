import React, { type ReactElement } from 'react';
import {
  DEFAULT_PROVIDER_ID,
  getProviderDefinitions,
} from '../providerCatalog.js';
import styles from '../styles/modals.module.scss';
import { AssignTaskModal } from './assignTaskModal/index.js';
import { AvatarPickerModal } from './avatarPickerModal.js';
import { ConversationViewerModal } from './conversationViewerModal.js';
import { TaskReportModal } from './taskReportModal.js';
import { TeamFormationModal } from './teamFormationModal.js';
import { TeamReportModal } from './teamReportModal.js';

function ProviderButtons(): ReactElement {
  return (
    <>
      {getProviderDefinitions().map((provider) => (
        <button
          key={provider.id}
          className={`provider-btn${provider.id === DEFAULT_PROVIDER_ID ? ' active' : ''} ${styles.providerButton}`}
          data-provider={provider.id}
          type="button"
        >
          {provider.label}
        </button>
      ))}
    </>
  );
}

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
            <label className="modal-label">Workspace Path<div className="modal-path-field"><input type="text" id="agentWorkspacePathInput" className="modal-input" placeholder="e.g. D:\probjects\stock-monitor" /><button type="button" className="btn-secondary modal-browse-btn" id="agentWorkspacePathBrowseBtn">Browse</button></div></label>
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
            <label className="modal-label">
              Provider
              <div className={`provider-select ${styles.providerSelect}`} id="providerSelect">
                <ProviderButtons />
              </div>
            </label>
            <div className="modal-error" id="createAgentError" />
            <div className="modal-actions"><button type="button" className="btn-secondary" id="cancelCreateBtn">Cancel</button><button type="submit" className="btn-primary">Create</button></div>
          </form>
        </div>
      </div>

      <AssignTaskModal />
      <AvatarPickerModal />
      <TeamFormationModal />
      <TaskReportModal />
      <TeamReportModal />
      <ConversationViewerModal />
    </>
  );
}
