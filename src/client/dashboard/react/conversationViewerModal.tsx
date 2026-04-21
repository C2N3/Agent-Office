import React, {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  getDashboardAPI,
  type DashboardConversationMessage,
  type DashboardConversationResponse,
  type DashboardSessionHistoryEntry,
} from '../shared.js';
import { dashboardModalRegistry } from '../modals/registry.js';
import { resumeRegisteredSession } from '../terminal/index.js';
import {
  ChatPanel,
  SessionList,
  type ChatSelection,
  type ConversationContext,
} from './conversationViewerPanels.js';

export function ConversationViewerModal(): ReactElement | null {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const historyRequestIdRef = useRef(0);
  const chatRequestIdRef = useRef(0);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [history, setHistory] = useState<DashboardSessionHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);
  const [messages, setMessages] = useState<DashboardConversationMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const closeConversationViewer = useCallback(() => {
    historyRequestIdRef.current += 1;
    chatRequestIdRef.current += 1;
    setContext(null);
    setHistory([]);
    setHistoryError('');
    setHistoryLoading(false);
    setChatSelection(null);
    setMessages([]);
    setChatError('');
    setChatLoading(false);
  }, []);

  const openConversation = useCallback((registryId: string, sessionId: string, resumeSessionId: string) => {
    const requestId = chatRequestIdRef.current + 1;
    chatRequestIdRef.current = requestId;
    setChatSelection({ resumeSessionId: resumeSessionId || sessionId, sessionId });
    setMessages([]);
    setChatError('');
    setChatLoading(true);

    void (async () => {
      try {
        let data: DashboardConversationResponse | undefined;
        const dashboardAPI = getDashboardAPI();
        if (dashboardAPI?.getConversation) {
          data = await dashboardAPI.getConversation(registryId, sessionId, {});
        } else {
          const response = await fetch(`/api/agents/${registryId}/conversation/${sessionId}`);
          data = await response.json() as DashboardConversationResponse;
        }

        if (chatRequestIdRef.current !== requestId) return;
        if (data?.error) {
          setChatError(data.error);
          return;
        }

        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
        if (!nextMessages.length) {
          setChatError('No messages in this session.');
          return;
        }
        setMessages(nextMessages);
      } catch (error) {
        if (chatRequestIdRef.current === requestId) {
          setChatError('Failed to load conversation.');
          console.error('[Conversation]', error);
        }
      } finally {
        if (chatRequestIdRef.current === requestId) {
          setChatLoading(false);
        }
      }
    })();
  }, []);

  const openSessionHistory = useCallback((registryId: string, agentName = 'Agent') => {
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;
    chatRequestIdRef.current += 1;
    setContext({ agentName, registryId });
    setHistory([]);
    setHistoryError('');
    setHistoryLoading(true);
    setChatSelection(null);
    setMessages([]);
    setChatError('');
    setChatLoading(false);
    requestAnimationFrame(() => overlayRef.current?.focus());

    void (async () => {
      try {
        let nextHistory: DashboardSessionHistoryEntry[] | undefined;
        const dashboardAPI = getDashboardAPI();
        if (dashboardAPI?.getSessionHistory) {
          nextHistory = await dashboardAPI.getSessionHistory(registryId);
        } else {
          const response = await fetch(`/api/agents/${registryId}/history`);
          nextHistory = await response.json() as DashboardSessionHistoryEntry[];
        }

        if (historyRequestIdRef.current !== requestId) return;
        const sortedHistory = Array.isArray(nextHistory)
          ? [...nextHistory].sort((left, right) => (Number(right.startedAt) || 0) - (Number(left.startedAt) || 0))
          : [];
        setHistory(sortedHistory);
        if (!sortedHistory.length) {
          setHistoryError('No session history yet.');
        }
      } catch (error) {
        if (historyRequestIdRef.current === requestId) {
          setHistoryError('Failed to load history.');
          console.error('[History]', error);
        }
      } finally {
        if (historyRequestIdRef.current === requestId) {
          setHistoryLoading(false);
        }
      }
    })();
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openSessionHistory = openSessionHistory;
    globalThis.openSessionHistory = openSessionHistory;
    return () => {
      if (dashboardModalRegistry.openSessionHistory === openSessionHistory) {
        delete dashboardModalRegistry.openSessionHistory;
      }
      if (globalThis.openSessionHistory === openSessionHistory) {
        globalThis.openSessionHistory = undefined;
      }
    };
  }, [openSessionHistory]);

  useLayoutEffect(() => {
    if (!chatSelection || chatLoading) return;
    const messagesEl = chatMessagesRef.current;
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }, [chatLoading, chatSelection, messages]);

  const resumeSelectedSession = useCallback(async () => {
    if (!context || !chatSelection) return;
    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.resumeSession) {
      alert('Resume is only available in the Electron app');
      return;
    }

    const result = await resumeRegisteredSession(
      context.registryId,
      chatSelection.resumeSessionId || chatSelection.sessionId,
      context.agentName,
    );
    closeConversationViewer();
    if (!result?.success) {
      alert(`Failed to resume: ${result?.error || 'unknown'}`);
    }
  }, [chatSelection, closeConversationViewer, context]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeConversationViewer();
  }, [closeConversationViewer]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') closeConversationViewer();
  }, [closeConversationViewer]);

  if (!context) return null;

  return (
    <div
      className="conv-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      ref={overlayRef}
      role="presentation"
      tabIndex={-1}
    >
      <div aria-modal="true" className="conv-modal" role="dialog">
        <div className="conv-modal-header">
          <div className="conv-modal-title">{context.agentName} - Session History</div>
          <button className="conv-modal-close" onClick={closeConversationViewer} type="button">&times;</button>
        </div>
        <div className="conv-modal-body">
          {chatSelection ? (
            <ChatPanel
              loading={chatLoading}
              messages={messages}
              refEl={chatMessagesRef}
              selection={chatSelection}
              status={chatError}
              onBack={() => {
                chatRequestIdRef.current += 1;
                setChatSelection(null);
                setMessages([]);
                setChatError('');
                setChatLoading(false);
              }}
              onResume={() => { void resumeSelectedSession(); }}
            />
          ) : (
            <SessionList
              context={context}
              error={historyError}
              history={history}
              loading={historyLoading}
              onOpenConversation={openConversation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
