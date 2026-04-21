import React, {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { normalizeProvider } from '../providerCatalog.js';
import { dashboardModalRegistry } from '../modals/registry.js';
import { DiffFileList, parseDiffToFiles, type DiffFile } from './reportDiff.js';
import { MarkdownBlock } from './reportMarkdown.js';
import {
  clearAgentReportBubble,
  createFollowUpTaskPayload,
  EMPTY_TASK_REPORT_CONTEXT,
  type ActionState,
  type TaskReportContext,
  type TaskReportData,
} from './taskReportData.js';

export function TaskReportModal(): ReactElement | null {
  const requestIdRef = useRef(0);
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [context, setContext] = useState<TaskReportContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [actionState, setActionState] = useState<ActionState>(null);

  const closeTaskReport = useCallback(() => {
    requestIdRef.current += 1;
    setContext(null);
    setLoading(false);
    setOutput('');
    setDiffFiles([]);
    setFollowUpPrompt('');
    setFollowUpError('');
    setActionState(null);
  }, []);

  const openTaskReportModal = useCallback(async (taskId: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setContext({ ...EMPTY_TASK_REPORT_CONTEXT, taskId });
    setLoading(true);
    setOutput('');
    setDiffFiles([]);
    setFollowUpPrompt('');
    setFollowUpError('');
    setActionState(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/report`);
      const data = await response.json() as TaskReportData;
      if (requestIdRef.current !== requestId) return;

      setContext({
        agentRegistryId: data.agentRegistryId || '',
        executionEnvironment: data.executionEnvironment || 'auto',
        model: data.model || null,
        provider: normalizeProvider(data.provider),
        repositoryPath: data.repositoryPath || '',
        taskId,
        title: data.title || 'Task Report',
      });
      setOutput((data.output || '').trim());
      setDiffFiles(parseDiffToFiles(data.diff || ''));
    } catch {
      if (requestIdRef.current === requestId) {
        setOutput('Failed to load report.');
        setDiffFiles([]);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openTaskReportModal = openTaskReportModal;
    return () => {
      if (dashboardModalRegistry.openTaskReportModal === openTaskReportModal) {
        delete dashboardModalRegistry.openTaskReportModal;
      }
    };
  }, [openTaskReportModal]);

  const mergeTaskReport = useCallback(async () => {
    if (!context?.taskId) return;

    setActionState('merge');
    try {
      const response = await fetch(`/api/tasks/${context.taskId}/merge`, { method: 'POST' });
      const data = await response.json() as { error?: string; success?: boolean };
      if (data.success) {
        clearAgentReportBubble(context.agentRegistryId);
        closeTaskReport();
      } else {
        alert(data.error || 'Merge failed');
      }
    } catch {
      alert('Merge request failed');
    } finally {
      setActionState(null);
    }
  }, [closeTaskReport, context]);

  const rejectTaskReport = useCallback(async () => {
    if (!context?.taskId) return;
    if (!confirm('Reject this task and discard all changes?')) return;

    setActionState('reject');
    try {
      const response = await fetch(`/api/tasks/${context.taskId}/reject`, { method: 'POST' });
      const data = await response.json() as { error?: string; success?: boolean };
      if (data.success) {
        clearAgentReportBubble(context.agentRegistryId);
        closeTaskReport();
      } else {
        alert(data.error || 'Reject failed');
      }
    } catch {
      alert('Reject request failed');
    } finally {
      setActionState(null);
    }
  }, [closeTaskReport, context]);

  const sendFollowUpTask = useCallback(async () => {
    if (!context?.taskId) return;

    const prompt = followUpPrompt.trim();
    setFollowUpError('');
    if (!prompt) {
      setFollowUpError('Follow-up prompt is required.');
      followUpInputRef.current?.focus();
      return;
    }

    setActionState('followUp');
    try {
      const response = await fetch('/api/tasks', {
        body: JSON.stringify(createFollowUpTaskPayload(context, prompt)),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await response.json() as { error?: string };
      if (data?.error) {
        setFollowUpError(data.error);
        return;
      }

      clearAgentReportBubble(context.agentRegistryId);
      closeTaskReport();
    } catch {
      setFollowUpError('Follow-up request failed.');
    } finally {
      setActionState(null);
    }
  }, [closeTaskReport, context, followUpPrompt]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeTaskReport();
  }, [closeTaskReport]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') closeTaskReport();
  }, [closeTaskReport]);

  if (!context) return null;

  const outputContent = loading
    ? 'Loading...'
    : output || '(이 태스크에 대한 에이전트 응답을 찾을 수 없습니다.)';

  return (
    <div
      aria-labelledby="taskReportTitle"
      aria-modal="true"
      className="modal-overlay"
      id="taskReportModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content task-report-modal">
        <div className="modal-header">
          <span id="taskReportTitle">{context.title}</span>
          <button className="conv-modal-close" onClick={closeTaskReport} type="button">&times;</button>
        </div>
        <div className="task-report-body">
          <div className="task-report-section">
            <h4>Output</h4>
            <MarkdownBlock markdown={outputContent} />
          </div>
          <div className="task-report-section">
            <h4>Changes</h4>
            <DiffFileList files={loading ? [] : diffFiles} />
          </div>
        </div>
        <div className="task-report-section task-report-followup-section">
          <h4>Follow-up Task</h4>
          <div className="task-report-followup-help">
            Queue a new task on this workspace. The new task inherits this worktree&apos;s changes as its starting point.
          </div>
          <textarea
            className="modal-input modal-textarea"
            id="taskReportFollowUpPrompt"
            onChange={(event) => {
              setFollowUpPrompt(event.target.value);
              setFollowUpError('');
            }}
            placeholder="What should the agent do next?"
            ref={followUpInputRef}
            rows={3}
            value={followUpPrompt}
          />
          <div className="modal-error" id="taskReportFollowUpError">{followUpError}</div>
        </div>
        <div className="modal-actions task-report-actions">
          <button
            className="btn-secondary"
            disabled={actionState != null || loading}
            onClick={() => { void sendFollowUpTask(); }}
            type="button"
          >
            {actionState === 'followUp' ? 'Sending...' : 'Send Follow-up'}
          </button>
          <button
            className="btn-primary"
            disabled={actionState != null || loading}
            onClick={() => { void mergeTaskReport(); }}
            type="button"
          >
            {actionState === 'merge' ? 'Merging...' : 'Merge'}
          </button>
          <button
            className="btn-secondary btn-danger"
            disabled={actionState != null || loading}
            onClick={() => { void rejectTaskReport(); }}
            type="button"
          >
            {actionState === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
