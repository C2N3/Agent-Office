import React, {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import './taskChat.css';

type MessageKind = 'user' | 'assistant-text' | 'assistant-tool' | 'assistant-error' | 'status';

type ChatMessage = {
  id: string;
  kind: MessageKind;
  text: string;
  timestamp: number;
  taskId?: string | null;
};

type TaskChatBridge = {
  close?: (agentRegistryId: string) => void;
  loadHistory?: (agentRegistryId: string) => Promise<ChatMessage[]>;
  appendMessage?: (
    agentRegistryId: string,
    message: Omit<ChatMessage, 'id'> & { id?: string },
  ) => Promise<{ success?: boolean; message?: ChatMessage }>;
  clearHistory?: (agentRegistryId: string) => Promise<{ success?: boolean }>;
  mergeWorkspace?: (registryId: string) => Promise<{ success?: boolean; error?: string | null }>;
  removeWorkspace?: (registryId: string) => Promise<{ success?: boolean; error?: string | null }>;
};

type AgentWorkspace = {
  type?: string | null;
  branch?: string | null;
  repositoryName?: string | null;
  repositoryPath?: string | null;
  worktreePath?: string | null;
};

type AgentInfo = {
  id: string;
  registryId?: string | null;
  provider?: string | null;
  project?: string | null;
  metadata?: { projectPath?: string | null; workspace?: AgentWorkspace | null } | null;
};

type TaskOutputPayload = {
  text: string;
  type?: string;
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    agentRegistryId: params.get('agentRegistryId') || '',
    agentName: params.get('agentName') || 'Agent',
    avatarFile: params.get('avatarFile') || '',
  };
}

function getBridge(): TaskChatBridge | null {
  return (window as Window & { taskChatAPI?: TaskChatBridge }).taskChatAPI || null;
}

function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (isSameDay(timestamp, now)) {
    return `${hh}:${mm}`;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()} ${hh}:${mm}`;
}

function resolveRepositoryPath(agent: AgentInfo | null): string {
  if (!agent) return '';
  const workspace = agent.metadata?.workspace || null;
  return (
    workspace?.repositoryPath
    || agent.metadata?.projectPath
    || agent.project
    || workspace?.worktreePath
    || ''
  );
}

async function fetchAgentInfo(agentRegistryId: string): Promise<AgentInfo | null> {
  try {
    const response = await fetch('/api/agents');
    if (!response.ok) return null;
    const agents = (await response.json()) as AgentInfo[];
    if (!Array.isArray(agents)) return null;
    return agents.find((agent) => agent?.id === agentRegistryId) || null;
  } catch {
    return null;
  }
}

function closeWindow(agentRegistryId: string) {
  const bridge = getBridge();
  if (bridge?.close) bridge.close(agentRegistryId);
  else window.close();
}

function TaskChatApp(): ReactElement {
  const { agentRegistryId, agentName, avatarFile } = useMemo(readParams, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTaskIds, setActiveTaskIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState<'merge' | 'remove' | null>(null);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTaskIdsRef = useRef<Set<string>>(new Set());
  const seenTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.title = agentName;
  }, [agentName]);

  const saveMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    const bridge = getBridge();
    if (bridge?.appendMessage && agentRegistryId) {
      void bridge.appendMessage(agentRegistryId, message);
    }
  }, [agentRegistryId]);

  useEffect(() => {
    if (!agentRegistryId) return;
    let cancelled = false;
    const bridge = getBridge();
    async function run() {
      if (bridge?.loadHistory) {
        try {
          const loaded = await bridge.loadHistory(agentRegistryId);
          if (!cancelled && Array.isArray(loaded)) setMessages(loaded);
        } catch {}
      }
      const info = await fetchAgentInfo(agentRegistryId);
      if (!cancelled) setAgentInfo(info);
    }
    void run();
    return () => { cancelled = true; };
  }, [agentRegistryId]);

  useEffect(() => {
    if (!agentRegistryId) return;
    const eventSource = new EventSource('/api/events');
    let retryTimer: number | null = null;

    const setActiveSet = (mutator: (set: Set<string>) => void) => {
      const next = new Set(activeTaskIdsRef.current);
      mutator(next);
      activeTaskIdsRef.current = next;
      setActiveTaskIds(next);
    };

    const appendAssistant = (kind: MessageKind, text: string, taskId: string | null) => {
      saveMessage({ id: makeMessageId(), kind, text, timestamp: Date.now(), taskId });
    };

    const onTaskRunning = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { data?: { id?: string; agentRegistryId?: string } };
        const task = data.data;
        if (!task?.id || task.agentRegistryId !== agentRegistryId) return;
        seenTaskIdsRef.current.add(task.id);
        setActiveSet((set) => set.add(task.id));
      } catch {}
    };

    const onTaskOutput = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { data?: { taskId?: string; text?: string } };
        const payload = data.data;
        if (!payload?.taskId || !payload.text) return;
        if (!seenTaskIdsRef.current.has(payload.taskId)) return;
        try {
          const parsed = JSON.parse(payload.text) as TaskOutputPayload;
          const type = parsed.type || 'text';
          if (type === 'tool_use') {
            appendAssistant('assistant-tool', parsed.text, payload.taskId);
          } else if (type === 'error' || type === 'context_exhaustion') {
            appendAssistant('assistant-error', parsed.text, payload.taskId);
          } else {
            appendAssistant('assistant-text', parsed.text, payload.taskId);
          }
        } catch {
          appendAssistant('assistant-text', payload.text, payload.taskId);
        }
      } catch {}
    };

    const onTaskTerminal = (statusKind: 'completed' | 'failed' | 'cancelled') => (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { data?: { id?: string; agentRegistryId?: string; errorMessage?: string | null } };
        const task = data.data;
        if (!task?.id) return;
        if (!seenTaskIdsRef.current.has(task.id) && task.agentRegistryId !== agentRegistryId) return;
        setActiveSet((set) => { set.delete(task.id); });
        const label = statusKind === 'completed' ? 'Task completed' : statusKind === 'failed' ? `Task failed${task.errorMessage ? `: ${task.errorMessage}` : ''}` : 'Task cancelled';
        saveMessage({ id: makeMessageId(), kind: 'status', text: label, timestamp: Date.now(), taskId: task.id });
      } catch {}
    };

    eventSource.addEventListener('connected', () => setDisconnected(false));
    eventSource.addEventListener('task.running', onTaskRunning);
    eventSource.addEventListener('task.output', onTaskOutput);
    eventSource.addEventListener('task.succeeded', onTaskTerminal('completed'));
    eventSource.addEventListener('task.failed', onTaskTerminal('failed'));
    eventSource.addEventListener('task.cancelled', onTaskTerminal('cancelled'));
    eventSource.onerror = () => {
      setDisconnected(true);
      eventSource.close();
      retryTimer = window.setTimeout(() => window.location.reload(), 4000);
    };

    return () => {
      if (retryTimer != null) window.clearTimeout(retryTimer);
      eventSource.close();
    };
  }, [agentRegistryId, saveMessage]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [messages, activeTaskIds]);

  const hasActiveTasks = activeTaskIds.size > 0;

  const handleSend = useCallback(async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || !agentRegistryId || hasActiveTasks || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    const userMessage: ChatMessage = {
      id: makeMessageId(),
      kind: 'user',
      text: prompt,
      timestamp: Date.now(),
    };
    saveMessage(userMessage);
    setDraft('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${agentName}: ${prompt.slice(0, 50)}`,
          prompt,
          provider: agentInfo?.provider || 'claude',
          executionEnvironment: 'native',
          model: null,
          maxTurns: 30,
          repositoryPath: resolveRepositoryPath(agentInfo),
          priority: 'normal',
          autoMergeOnSuccess: false,
          agentRegistryId,
        }),
      });
      const result = (await response.json()) as { error?: string; id?: string };
      if (result?.error) {
        setErrorMessage(result.error);
        saveMessage({
          id: makeMessageId(),
          kind: 'assistant-error',
          text: result.error,
          timestamp: Date.now(),
        });
      } else if (result?.id) {
        seenTaskIdsRef.current.add(result.id);
        activeTaskIdsRef.current = new Set(activeTaskIdsRef.current).add(result.id);
        setActiveTaskIds(activeTaskIdsRef.current);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      saveMessage({
        id: makeMessageId(),
        kind: 'assistant-error',
        text: `Failed to submit: ${message}`,
        timestamp: Date.now(),
      });
    } finally {
      setSubmitting(false);
      textAreaRef.current?.focus();
    }
  }, [agentInfo, agentName, agentRegistryId, draft, hasActiveTasks, saveMessage, submitting]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleClear = useCallback(async () => {
    if (hasActiveTasks) return;
    const proceed = window.confirm('Clear all chat history for this agent?');
    if (!proceed) return;
    const bridge = getBridge();
    if (bridge?.clearHistory && agentRegistryId) {
      await bridge.clearHistory(agentRegistryId);
    }
    setMessages([]);
    seenTaskIdsRef.current = new Set();
  }, [agentRegistryId, hasActiveTasks]);

  const refreshAgentInfo = useCallback(async () => {
    if (!agentRegistryId) return;
    const info = await fetchAgentInfo(agentRegistryId);
    setAgentInfo(info);
  }, [agentRegistryId]);

  const handleWorkspaceAction = useCallback(async (action: 'merge' | 'remove') => {
    if (!agentRegistryId || hasActiveTasks || workspaceBusy) return;
    const branch = agentInfo?.metadata?.workspace?.branch || '';
    const message = action === 'merge'
      ? `Apply branch "${branch}" — merge to base and clean up the workspace?`
      : `Remove workspace branch "${branch}" without merging?`;
    if (!window.confirm(message)) return;

    const bridge = getBridge();
    const fn = action === 'merge' ? bridge?.mergeWorkspace : bridge?.removeWorkspace;
    if (!fn) {
      setErrorMessage('Workspace controls are unavailable in this environment.');
      return;
    }

    setWorkspaceBusy(action);
    setErrorMessage(null);
    try {
      const result = await fn(agentRegistryId);
      if (!result?.success) {
        const errText = result?.error || `Workspace ${action} failed.`;
        setErrorMessage(errText);
        saveMessage({ id: makeMessageId(), kind: 'assistant-error', text: errText, timestamp: Date.now() });
        return;
      }
      const statusText = action === 'merge'
        ? `Workspace merged${branch ? ` (${branch})` : ''}`
        : `Workspace removed${branch ? ` (${branch})` : ''}`;
      saveMessage({ id: makeMessageId(), kind: 'status', text: statusText, timestamp: Date.now() });
      await refreshAgentInfo();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setErrorMessage(text);
      saveMessage({ id: makeMessageId(), kind: 'assistant-error', text: `Workspace ${action} failed: ${text}`, timestamp: Date.now() });
    } finally {
      setWorkspaceBusy(null);
    }
  }, [agentInfo, agentRegistryId, hasActiveTasks, refreshAgentInfo, saveMessage, workspaceBusy]);

  const workspace = agentInfo?.metadata?.workspace || null;
  const showWorkspaceBar = !!workspace && workspace.type === 'git-worktree' && !!workspace.branch;
  const workspaceLocked = hasActiveTasks || !!workspaceBusy;

  const resolvedAvatar = avatarFile ? `/assets/characters/${avatarFile}` : '';
  const now = Date.now();

  return (
    <div className="tc-shell">
      <header className="tc-header">
        {resolvedAvatar ? <div className="tc-avatar" style={{ backgroundImage: `url('${resolvedAvatar}')` }} /> : null}
        <div className="tc-header-main">
          <div className="tc-title">{agentName}</div>
          <div className="tc-subtitle">{hasActiveTasks ? 'Task running…' : disconnected ? 'Disconnected — reconnecting' : 'Ready'}</div>
        </div>
        <button className="tc-icon-btn" disabled={hasActiveTasks || messages.length === 0} title="Clear history" type="button" onClick={handleClear}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10" />
            <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
            <path d="M4.5 4l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" />
          </svg>
        </button>
        <button className="tc-icon-btn" title="Close" type="button" onClick={() => closeWindow(agentRegistryId)}>×</button>
      </header>
      {showWorkspaceBar && workspace ? (
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
            <span className="tc-workspace-branch">{workspace.branch}</span>
            {workspace.repositoryName ? <span className="tc-workspace-repo">{workspace.repositoryName}</span> : null}
          </div>
          <div className="tc-workspace-actions">
            <button
              className="tc-workspace-btn apply"
              disabled={workspaceLocked}
              title="Merge branch and clean up workspace"
              type="button"
              onClick={() => { void handleWorkspaceAction('merge'); }}
            >
              {workspaceBusy === 'merge' ? '…' : 'Apply'}
            </button>
            <button
              className="tc-workspace-btn remove"
              disabled={workspaceLocked}
              title="Remove workspace and delete branch without merge"
              type="button"
              onClick={() => { void handleWorkspaceAction('remove'); }}
            >
              {workspaceBusy === 'remove' ? '…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : null}
      <div ref={bodyRef} className="tc-body">
        {messages.length === 0 ? (
          <div className="tc-empty">Send a message to start a task.</div>
        ) : (
          messages.map((message) => {
            const time = formatTime(message.timestamp, now);
            if (message.kind === 'user') {
              return (
                <div key={message.id} className="tc-row tc-row-user">
                  <div className="tc-bubble tc-bubble-user">{message.text}</div>
                  <div className="tc-time">{time}</div>
                </div>
              );
            }
            if (message.kind === 'assistant-tool') {
              return (
                <div key={message.id} className="tc-row tc-row-assistant">
                  <div className="tc-tool">
                    <span className="tc-tool-icon">&gt;</span>
                    <span>{message.text}</span>
                  </div>
                  <div className="tc-time">{time}</div>
                </div>
              );
            }
            if (message.kind === 'assistant-error') {
              return (
                <div key={message.id} className="tc-row tc-row-assistant">
                  <div className="tc-error">{message.text}</div>
                  <div className="tc-time">{time}</div>
                </div>
              );
            }
            if (message.kind === 'status') {
              return (
                <div key={message.id} className="tc-row tc-row-status">
                  <div className="tc-status">{message.text}</div>
                  <div className="tc-time">{time}</div>
                </div>
              );
            }
            return (
              <div key={message.id} className="tc-row tc-row-assistant">
                <div className="tc-bubble tc-bubble-assistant">{message.text}</div>
                <div className="tc-time">{time}</div>
              </div>
            );
          })
        )}
      </div>
      <form className="tc-input" onSubmit={handleSend}>
        {errorMessage ? <div className="tc-input-error">{errorMessage}</div> : null}
        <textarea
          ref={textAreaRef}
          className="tc-input-textarea"
          disabled={hasActiveTasks || submitting}
          placeholder={hasActiveTasks ? 'Task running — wait for it to finish.' : 'Type a task for this agent… (Enter to send, Shift+Enter for newline)'}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="tc-send"
          disabled={!draft.trim() || hasActiveTasks || submitting}
          title="Send (Enter)"
          type="submit"
        >
          {submitting ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const container = document.getElementById('taskChatRoot');
if (container) {
  createRoot(container).render(<TaskChatApp />);
}
