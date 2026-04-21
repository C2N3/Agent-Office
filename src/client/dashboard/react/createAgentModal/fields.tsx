import React, {
  type FormEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import {
  getProviderDefinitions,
} from '../../providerCatalog.js';
import type { DashboardPathRegistrationStrategy } from '../../shared.js';
import styles from '../../styles/modals.module.scss';
import type { CreateAgentFormState } from './state.js';

type CreateAgentFormFieldsProps = {
  baseBranchOptions: string[];
  error: string;
  formState: CreateAgentFormState;
  inspectStatus: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  previewStatus: string;
  submitting: boolean;
  worktreeEnabled: boolean;
  onBaseBranchChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onBranchFocus: () => void;
  onBrowseWorkspaceParent: () => void;
  onBrowseWorkspacePath: () => void;
  onCancel: () => void;
  onChange: (updates: Partial<CreateAgentFormState>) => void;
  onProviderChange: (provider: string) => void;
  onStartPointChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSymlinkPathsChange: (value: string) => void;
};

export function CreateAgentFormFields({
  baseBranchOptions,
  error,
  formState,
  inspectStatus,
  nameInputRef,
  previewStatus,
  submitting,
  worktreeEnabled,
  onBaseBranchChange,
  onBranchChange,
  onBranchFocus,
  onBrowseWorkspaceParent,
  onBrowseWorkspacePath,
  onCancel,
  onChange,
  onProviderChange,
  onStartPointChange,
  onSubmit,
  onSymlinkPathsChange,
}: CreateAgentFormFieldsProps): ReactElement {
  const worktreeClassName = ` ${worktreeEnabled ? '' : 'is-disabled'}`.trim();

  return (
    <form onSubmit={onSubmit}>
      <div className="create-agent-mode-card">
        <div className="create-agent-mode-copy">
          <div className="create-agent-mode-eyebrow">Unified Flow</div>
          <div className="create-agent-mode-title">Single Workspace Path</div>
          <div className="create-agent-mode-description">Enter one folder path and Agent-Office will either register it directly or create a managed git worktree when that repository is already in use.</div>
        </div>
      </div>
      <label className="modal-label">
        Name
        <input
          className="modal-input"
          onChange={(event) => onChange({ name: event.currentTarget.value })}
          placeholder="e.g. Stock Monitor Agent"
          ref={nameInputRef}
          required
          type="text"
          value={formState.name}
        />
      </label>
      <label className="modal-label">
        Role
        <input
          className="modal-input"
          onChange={(event) => onChange({ role: event.currentTarget.value })}
          placeholder="e.g. Service development, bug fixes"
          type="text"
          value={formState.role}
        />
      </label>
      <label className="modal-label">
        Workspace Path
        <div className="modal-path-field">
          <input
            className="modal-input"
            onChange={(event) => onChange({ workspacePath: event.currentTarget.value })}
            placeholder="e.g. D:\\projects\\stock-monitor"
            type="text"
            value={formState.workspacePath}
          />
          <button className="btn-secondary modal-browse-btn" onClick={onBrowseWorkspacePath} type="button">Browse</button>
        </div>
      </label>
      <div className="create-agent-preview">{previewStatus}</div>
      <details className="create-agent-advanced">
        <summary>Advanced Options</summary>
        <div className="create-agent-advanced-body">
          <label className="modal-label">
            Strategy
            <select
              className="modal-input"
              onChange={(event) => onChange({ strategy: event.currentTarget.value as DashboardPathRegistrationStrategy })}
              value={formState.strategy}
            >
              <option value="auto">Auto</option>
              <option value="existing">Register exact path</option>
              <option value="worktree">Create managed worktree</option>
            </select>
          </label>
          <div className={worktreeClassName} id="worktreeAgentFields">
            <div className="modal-input-row">
              <label className="modal-label">
                Branch Name
                <input
                  className="modal-input"
                  disabled={!worktreeEnabled}
                  onChange={(event) => onBranchChange(event.currentTarget.value)}
                  onFocus={onBranchFocus}
                  placeholder="optional, auto-generated if blank"
                  type="text"
                  value={formState.branchName}
                />
              </label>
              <label className="modal-label">
                Start From
                <input
                  className="modal-input"
                  disabled={!worktreeEnabled}
                  onChange={(event) => onStartPointChange(event.currentTarget.value)}
                  placeholder="HEAD"
                  type="text"
                  value={formState.startPoint}
                />
              </label>
            </div>
            <div className="modal-input-row">
              <label className="modal-label">
                Base Branch
                <input
                  className="modal-input"
                  disabled={!worktreeEnabled}
                  list="agentBaseBranchList"
                  onChange={(event) => onBaseBranchChange(event.currentTarget.value)}
                  placeholder="auto-detected from repo"
                  type="text"
                  value={formState.baseBranch}
                />
                <datalist id="agentBaseBranchList">
                  {baseBranchOptions.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
              </label>
              <label className="modal-label">
                Branch Mode
                <input
                  className="modal-input"
                  disabled={!worktreeEnabled}
                  readOnly
                  type="text"
                  value={formState.branchMode === 'auto' ? 'Auto' : 'Custom'}
                />
              </label>
            </div>
            <div className="modal-help">{inspectStatus}</div>
            <label className="modal-label">
              Workspace Parent
              <div className="modal-path-field">
                <input
                  className="modal-input"
                  disabled={!worktreeEnabled}
                  onChange={(event) => onChange({ workspaceParent: event.currentTarget.value })}
                  placeholder="optional, defaults to the global worktree directory"
                  type="text"
                  value={formState.workspaceParent}
                />
                <button
                  className="btn-secondary modal-browse-btn"
                  disabled={!worktreeEnabled}
                  onClick={onBrowseWorkspaceParent}
                  type="button"
                >
                  Browse
                </button>
              </div>
            </label>
            <label className="modal-label">
              Copy Paths
              <textarea
                className="modal-input modal-textarea"
                disabled={!worktreeEnabled}
                onChange={(event) => onChange({ copyPaths: event.currentTarget.value })}
                placeholder={'.env.local\nconfig/dev.json'}
                rows={3}
                value={formState.copyPaths}
              />
              <span className="modal-help">Copied from the source repo into the new worktree after checkout.</span>
            </label>
            <label className="modal-label">
              Symlink Paths
              <textarea
                className="modal-input modal-textarea"
                disabled={!worktreeEnabled}
                onChange={(event) => onSymlinkPathsChange(event.currentTarget.value)}
                placeholder={'node_modules\n.turbo'}
                rows={3}
                value={formState.symlinkPaths}
              />
              <span className="modal-help">Creates links inside the worktree. Useful for heavy dependency folders.</span>
            </label>
            <label className="modal-label">
              Bootstrap Command
              <input
                className="modal-input"
                disabled={!worktreeEnabled}
                onChange={(event) => onChange({ bootstrapCommand: event.currentTarget.value })}
                placeholder="e.g. npm install && npm run dev"
                type="text"
                value={formState.bootstrapCommand}
              />
              <span className="modal-help">Optional command sent to the embedded terminal right after managed workspace creation.</span>
            </label>
          </div>
        </div>
      </details>
      <label className="modal-label">
        Provider
        <div className={`provider-select ${styles.providerSelect}`}>
          {getProviderDefinitions().map((provider) => (
            <button
              className={`provider-btn${formState.provider === provider.id ? ' active' : ''} ${styles.providerButton}`}
              key={provider.id}
              onClick={() => onProviderChange(provider.id)}
              type="button"
            >
              {provider.label}
            </button>
          ))}
        </div>
      </label>
      <div className="modal-error">{error}</div>
      <div className="modal-actions">
        <button className="btn-secondary" disabled={submitting} onClick={onCancel} type="button">Cancel</button>
        <button className="btn-primary" disabled={submitting} type="submit">{submitting ? 'Creating...' : 'Create'}</button>
      </div>
    </form>
  );
}
