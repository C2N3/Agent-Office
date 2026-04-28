import React, {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import type { AgentWorkspace } from './model';

export function TaskChatHeader({
  agentName,
  clearDisabled,
  disconnected,
  hasActiveTasks,
  onClear,
  onClose,
  resolvedAvatar,
}: {
  agentName: string;
  clearDisabled: boolean;
  disconnected: boolean;
  hasActiveTasks: boolean;
  onClear: () => void;
  onClose: () => void;
  resolvedAvatar: string;
}): ReactElement {
  return (
    <header className="tc-header">
      {resolvedAvatar ? <div className="tc-avatar" style={{ backgroundImage: `url('${resolvedAvatar}')` }} /> : null}
      <div className="tc-header-main">
        <div className="tc-title">{agentName}</div>
        <div className="tc-subtitle">{hasActiveTasks ? 'Task running...' : disconnected ? 'Disconnected - reconnecting' : 'Ready'}</div>
      </div>
      <button className="tc-icon-btn" disabled={clearDisabled} title="Clear history" type="button" onClick={onClear}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h10" />
          <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
          <path d="M4.5 4l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" />
        </svg>
      </button>
      <button className="tc-icon-btn" title="Close" type="button" onClick={onClose}>x</button>
    </header>
  );
}

export function TaskChatWorkspaceBar({
  onWorkspaceAction,
  workspace,
  workspaceBusy,
  workspaceLocked,
}: {
  onWorkspaceAction: (action: 'merge' | 'remove') => void;
  workspace: AgentWorkspace;
  workspaceBusy: 'merge' | 'remove' | null;
  workspaceLocked: boolean;
}): ReactElement {
  return (
    <div className="tc-workspace-bar">
      <div className="tc-workspace-meta">
        <svg className="tc-workspace-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="M6 8v4c0 2 2 4 4 4h2" />
          <path d="M18 8v4c0 2-2 4-4 4h-2" />
        </svg>
        <span className="tc-workspace-branch">{workspace.branch || '(no branch)'}</span>
        {workspace.repositoryName ? <span className="tc-workspace-repo">{workspace.repositoryName}</span> : null}
      </div>
      <div className="tc-workspace-actions">
        <button className="tc-workspace-btn apply" disabled={workspaceLocked} title="Merge branch and clean up workspace" type="button" onClick={() => onWorkspaceAction('merge')}>
          {workspaceBusy === 'merge' ? '...' : 'Apply'}
        </button>
        <button className="tc-workspace-btn remove" disabled={workspaceLocked} title="Remove workspace and delete branch without merge" type="button" onClick={() => onWorkspaceAction('remove')}>
          {workspaceBusy === 'remove' ? '...' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

export function TaskChatInput({
  draft,
  errorMessage,
  hasActiveTasks,
  onDraftChange,
  onKeyDown,
  onSubmit,
  submitting,
  textAreaRef,
}: {
  draft: string;
  errorMessage: string | null;
  hasActiveTasks: boolean;
  onDraftChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event?: FormEvent) => void;
  submitting: boolean;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
}): ReactElement {
  return (
    <form className="tc-input" onSubmit={onSubmit}>
      {errorMessage ? <div className="tc-input-error">{errorMessage}</div> : null}
      <textarea
        ref={textAreaRef}
        className="tc-input-textarea"
        disabled={hasActiveTasks || submitting}
        placeholder={hasActiveTasks ? 'Task running - wait for it to finish.' : 'Type a task for this agent... (Enter to send, Shift+Enter for newline)'}
        rows={2}
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <button className="tc-send" disabled={!draft.trim() || hasActiveTasks || submitting} title="Send (Enter)" type="submit">
        {submitting ? '...' : 'Send'}
      </button>
    </form>
  );
}
