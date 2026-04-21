import React, { type ReactElement } from 'react';
import type {
  DashboardConversationMessage,
  DashboardSessionHistoryEntry,
} from '../shared.js';

export type ConversationContext = {
  agentName: string;
  registryId: string;
};

export type ChatSelection = {
  resumeSessionId: string;
  sessionId: string;
};

function formatDate(value: number | string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

function formatTime(value: number | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
}

function splitLines(content: string | undefined): ReactElement {
  const lines = String(content || '').split('\n');
  return (
    <>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </React.Fragment>
      ))}
    </>
  );
}

function resolveSessionIds(entry: DashboardSessionHistoryEntry): ChatSelection {
  const sessionId = entry.sessionId || entry.resumeSessionId || entry.runtimeSessionId || '';
  const resumeSessionId = entry.resumeSessionId || entry.sessionId || entry.runtimeSessionId || '';
  return { resumeSessionId, sessionId };
}

export function SessionList({
  context,
  error,
  history,
  loading,
  onOpenConversation,
}: {
  context: ConversationContext;
  error: string;
  history: DashboardSessionHistoryEntry[];
  loading: boolean;
  onOpenConversation: (registryId: string, sessionId: string, resumeSessionId: string) => void;
}): ReactElement {
  if (loading) return <div className="conv-loading">Loading...</div>;
  if (error) return <div className="conv-empty">{error}</div>;

  return (
    <div className="conv-session-list">
      {history.map((entry, index) => {
        const ids = resolveSessionIds(entry);
        const labelSessionId = ids.resumeSessionId || ids.sessionId;
        const hasTranscript = !!entry.transcriptPath;
        const msgCount = entry.summary?.messageCount ?? '?';
        return (
          <button
            className={`conv-session-item ${hasTranscript ? '' : 'no-transcript'}`}
            key={`${ids.sessionId}-${index}`}
            onClick={() => onOpenConversation(context.registryId, ids.sessionId, ids.resumeSessionId)}
            type="button"
          >
            <div className="conv-session-main">
              <span className="conv-session-id-label">{labelSessionId.slice(0, 12)}...</span>
              <span className="conv-session-msgs">{msgCount} messages{hasTranscript ? '' : ' · transcript unavailable'}</span>
            </div>
            <div className="conv-session-dates">
              <span>{formatDate(entry.startedAt, '-')}</span>
              <span className="conv-session-arrow">-&gt;</span>
              <span>{formatDate(entry.endedAt, 'Active')}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ChatPanel({
  loading,
  messages,
  refEl,
  selection,
  status,
  onBack,
  onResume,
}: {
  loading: boolean;
  messages: DashboardConversationMessage[];
  refEl: React.RefObject<HTMLDivElement | null>;
  selection: ChatSelection;
  status: string;
  onBack: () => void;
  onResume: () => void;
}): ReactElement {
  return (
    <div className="conv-chat-panel">
      <div className="conv-chat-header">
        <button className="conv-back-btn" onClick={onBack} type="button">&larr; Back</button>
        <span className="conv-chat-session-id">{(selection.resumeSessionId || selection.sessionId).slice(0, 16)}...</span>
        <button className="conv-resume-btn" onClick={onResume} type="button">Resume</button>
      </div>
      <div className="conv-chat-messages" ref={refEl}>
        {loading ? <div className="conv-loading">Loading conversation...</div> : null}
        {!loading && status ? <div className="conv-empty">{status}</div> : null}
        {!loading && !status ? messages.map((message, index) => (
          <ConversationMessage message={message} key={index} />
        )) : null}
      </div>
    </div>
  );
}

function ConversationMessage({ message }: { message: DashboardConversationMessage }): ReactElement | null {
  if (message.role === 'system') {
    return <div className="conv-msg conv-msg-system"><span className="conv-msg-badge">SYSTEM</span> {splitLines(message.content)}</div>;
  }

  if (message.role === 'user') {
    return (
      <div className="conv-msg conv-msg-user">
        <span className="conv-msg-badge">USER</span>
        <div className="conv-msg-content">{splitLines(message.content)}</div>
        {message.timestamp ? <span className="conv-msg-time">{formatTime(message.timestamp)}</span> : null}
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="conv-msg conv-msg-assistant">
        <span className="conv-msg-badge">ASSISTANT</span>
        {message.toolUses?.length ? (
          <div className="conv-msg-tools">
            {message.toolUses.map((tool, index) => (
              <span className="conv-tool-tag" key={`${tool.name || 'tool'}-${index}`}>{tool.name}</span>
            ))}
          </div>
        ) : null}
        <div className="conv-msg-content">{splitLines(message.content)}</div>
        <div className="conv-msg-meta">
          {message.model ? <span className="conv-msg-model">{message.model}</span> : null}
          {message.timestamp ? <span className="conv-msg-time">{formatTime(message.timestamp)}</span> : null}
        </div>
      </div>
    );
  }

  return null;
}
