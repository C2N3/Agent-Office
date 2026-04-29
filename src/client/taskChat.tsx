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
import { TaskChatHeader, TaskChatInput, TaskChatWorkspaceBar } from './taskChat/chrome';
import {
  type AgentInfo,
  type ChatMessage,
  type MessageKind,
  type TaskOutputPayload,
  closeWindow,
  fetchAgentInfo,
  getBridge,
  makeMessageId,
  readParams,
  submitAgentTask,
} from './taskChat/model';
import { TaskChatMessages } from './taskChat/messages';
import './taskChat.css';
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
    const isCentralAgent = agentInfo?.metadata?.source === 'central';
    const eventSource = new EventSource(isCentralAgent ? '/api/server/events' : '/api/events');
    let retryTimer: number | null = null;

    const setActiveSet = (mutator: (set: Set<string>) => void) => {
      const next = new Set<string>(activeTaskIdsRef.current);
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
        const data = JSON.parse(event.data) as { data?: { taskId?: string; text?: string; body?: string } };
        const payload = data.data;
        const text = payload?.text || payload?.body || '';
        if (!payload?.taskId || !text) return;
        if (!seenTaskIdsRef.current.has(payload.taskId)) return;
        try {
          const parsed = JSON.parse(text) as TaskOutputPayload;
          const type = parsed.type || 'text';
          if (type === 'tool_use') {
            appendAssistant('assistant-tool', parsed.text, payload.taskId);
          } else if (type === 'error' || type === 'context_exhaustion') {
            appendAssistant('assistant-error', parsed.text, payload.taskId);
          } else {
            appendAssistant('assistant-text', parsed.text, payload.taskId);
          }
        } catch {
          appendAssistant('assistant-text', text, payload.taskId);
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

    const onAgentUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { data?: AgentInfo };
        const agent = data.data;
        if (!agent || (agent.id !== agentRegistryId && agent.registryId !== agentRegistryId)) return;
        if (isCentralAgent) {
          fetchAgentInfo(agentRegistryId).then(setAgentInfo).catch(() => {});
          return;
        }
        setAgentInfo(agent);
      } catch {}
    };

    eventSource.addEventListener('connected', () => setDisconnected(false));
    eventSource.addEventListener('task.running', onTaskRunning);
    eventSource.addEventListener('task.output', onTaskOutput);
    eventSource.addEventListener('worker.task.output', onTaskOutput);
    eventSource.addEventListener('task.succeeded', onTaskTerminal('completed'));
    eventSource.addEventListener('task.failed', onTaskTerminal('failed'));
    eventSource.addEventListener('task.cancelled', onTaskTerminal('cancelled'));
    eventSource.addEventListener('worker.task.completed', onTaskTerminal('completed'));
    eventSource.addEventListener('worker.task.failed', onTaskTerminal('failed'));
    eventSource.addEventListener('agent.created', onAgentUpdate);
    eventSource.addEventListener('agent.updated', onAgentUpdate);
    eventSource.onerror = () => {
      setDisconnected(true);
      eventSource.close();
      retryTimer = window.setTimeout(() => window.location.reload(), 4000);
    };

    return () => {
      if (retryTimer != null) window.clearTimeout(retryTimer);
      eventSource.close();
    };
  }, [agentInfo?.metadata?.source, agentRegistryId, saveMessage]);

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
      const { error, taskId } = await submitAgentTask({ agentInfo, agentName, agentRegistryId, prompt });
      if (error) {
        setErrorMessage(error);
        saveMessage({
          id: makeMessageId(),
          kind: 'assistant-error',
          text: error,
          timestamp: Date.now(),
        });
      } else if (taskId) {
        seenTaskIdsRef.current.add(taskId);
        activeTaskIdsRef.current = new Set(activeTaskIdsRef.current).add(taskId);
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
      ? `Apply branch "${branch}" - merge to base and clean up the workspace?`
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
  const hasWorktree = !!workspace && (workspace.type === 'git-worktree' || !!workspace.worktreePath);
  const showWorkspaceBar = hasWorktree && !!(workspace?.branch || workspace?.worktreePath);
  const workspaceLocked = hasActiveTasks || !!workspaceBusy;

  const resolvedAvatar = avatarFile ? `/assets/characters/${avatarFile}` : '';
  const now = Date.now();

  return (
    <div className="tc-shell">
      <TaskChatHeader
        agentName={agentName}
        clearDisabled={hasActiveTasks || messages.length === 0}
        disconnected={disconnected}
        hasActiveTasks={hasActiveTasks}
        resolvedAvatar={resolvedAvatar}
        onClear={() => { void handleClear(); }}
        onClose={() => closeWindow(agentRegistryId)}
      />
      {showWorkspaceBar && workspace ? (
        <TaskChatWorkspaceBar
          workspace={workspace}
          workspaceBusy={workspaceBusy}
          workspaceLocked={workspaceLocked}
          onWorkspaceAction={(action) => { void handleWorkspaceAction(action); }}
        />
      ) : null}
      <div ref={bodyRef} className="tc-body">
        <TaskChatMessages messages={messages} now={now} />
      </div>
      <TaskChatInput
        draft={draft}
        errorMessage={errorMessage}
        hasActiveTasks={hasActiveTasks}
        submitting={submitting}
        textAreaRef={textAreaRef}
        onDraftChange={setDraft}
        onKeyDown={handleKeyDown}
        onSubmit={handleSend}
      />
    </div>
  );
}

const container = document.getElementById('taskChatRoot');
if (container) {
  createRoot(container).render(<TaskChatApp />);
}
