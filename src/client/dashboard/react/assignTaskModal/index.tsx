import React, {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getProviderDefinitions,
  getProviderModels,
  normalizeProvider,
} from '../../providerCatalog.js';
import type { DashboardAgent } from '../../shared.js';
import { dashboardModalRegistry } from '../../modals/registry.js';
import styles from '../../styles/modals.module.scss';
import {
  DEFAULT_FORM_STATE,
  buildDefaultFormState,
  createAssignTaskPayload,
  resolveAgentLabel,
  resolveTaskRepositoryPath,
  type AssignTaskFormState,
  type TaskPriority,
} from './payload.js';

export {
  createAssignTaskPayload,
  resolveAgentLabel,
  resolveTaskRepositoryPath,
} from './payload.js';
export type { AssignTaskPayload } from './payload.js';

type AssignTaskContext = {
  agent: DashboardAgent;
  agentLabel: string;
  repositoryPath: string;
};

function isWindowsRuntime(): boolean {
  return (globalThis as any).dashboardAPI?.platform === 'win32';
}

export function AssignTaskModal(): ReactElement | null {
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [context, setContext] = useState<AssignTaskContext | null>(null);
  const [formState, setFormState] = useState<AssignTaskFormState>(DEFAULT_FORM_STATE);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const providerModels = useMemo(
    () => getProviderModels(formState.provider),
    [formState.provider],
  );

  const closeAssignTask = useCallback(() => {
    setContext(null);
    setFormState(DEFAULT_FORM_STATE);
    setError('');
    setSubmitting(false);
  }, []);

  const openAssignTaskModal = useCallback((agent: DashboardAgent) => {
    setContext({
      agent,
      agentLabel: resolveAgentLabel(agent),
      repositoryPath: resolveTaskRepositoryPath(agent),
    });
    setFormState(buildDefaultFormState(agent));
    setError('');
    setSubmitting(false);
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openAssignTaskModal = openAssignTaskModal;
    return () => {
      if (dashboardModalRegistry.openAssignTaskModal === openAssignTaskModal) {
        delete dashboardModalRegistry.openAssignTaskModal;
      }
    };
  }, [openAssignTaskModal]);

  useLayoutEffect(() => {
    if (!context) return;

    const frameId = requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [context]);

  const updateFormState = useCallback((updates: Partial<AssignTaskFormState>) => {
    setFormState((current) => ({ ...current, ...updates }));
    setError('');
  }, []);

  const handleProviderChange = useCallback((provider: string) => {
    updateFormState({
      provider: normalizeProvider(provider),
      model: '',
    });
  }, [updateFormState]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!context || submitting) return;

    if (!formState.prompt.trim()) {
      setError('Task prompt is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createAssignTaskPayload(
          context.agent,
          formState,
          context.repositoryPath,
        )),
      });
      const result = await response.json() as { error?: string };

      if (result.error) {
        setError(result.error);
        return;
      }

      closeAssignTask();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(`Failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }, [closeAssignTask, context, formState, submitting]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeAssignTask();
    }
  }, [closeAssignTask]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeAssignTask();
    }
  }, [closeAssignTask]);

  if (!context) return null;

  return (
    <div
      aria-labelledby="assignTaskTitle"
      aria-modal="true"
      className="modal-overlay"
      id="assignTaskModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content create-agent-modal">
        <div className="modal-header" id="assignTaskTitle">Assign Task - {context.agentLabel}</div>
        <form onSubmit={(event) => { void handleSubmit(event); }}>
          <label className="modal-label">
            Task Prompt
            <textarea
              className="modal-input modal-textarea"
              onChange={(event) => updateFormState({ prompt: event.target.value })}
              placeholder="What should this agent do?"
              ref={promptInputRef}
              required
              rows={4}
              value={formState.prompt}
            />
          </label>
          <div className="modal-input-row">
            <label className="modal-label">
              Provider
              <div className={`modal-radio-group ${styles.radioGroup}`}>
                {getProviderDefinitions().map((provider) => (
                  <label key={provider.id} className={`modal-radio-option ${styles.radioOption}`}>
                    <input
                      checked={formState.provider === provider.id}
                      name="taskProvider"
                      onChange={() => handleProviderChange(provider.id)}
                      type="radio"
                      value={provider.id}
                    />
                    <span className={styles.radioLabel}>{provider.label}</span>
                  </label>
                ))}
              </div>
            </label>
            <label className="modal-label">
              Model
              <select
                className="modal-input"
                onChange={(event) => updateFormState({ model: event.target.value })}
                value={formState.model}
              >
                {providerModels.map((model) => (
                  <option key={model.value || 'default'} value={model.value}>{model.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-input-row">
            <label className="modal-label">
              Max Turns
              <input
                className="modal-input"
                max="200"
                min="1"
                onChange={(event) => updateFormState({ maxTurns: event.target.value })}
                type="number"
                value={formState.maxTurns}
              />
            </label>
            <label className="modal-label">
              Priority
              <select
                className="modal-input"
                onChange={(event) => updateFormState({ priority: event.target.value as TaskPriority })}
                value={formState.priority}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          {isWindowsRuntime() ? (
            <div className="modal-label">
              Execution Environment
              <div className={`modal-radio-group modal-radio-group-wide ${styles.radioGroup}`}>
                <label className={`modal-radio-option ${styles.radioOption}`}>
                  <input
                    checked={formState.executionEnvironment === 'native'}
                    name="taskExecutionEnvironment"
                    onChange={() => updateFormState({ executionEnvironment: 'native' })}
                    type="radio"
                    value="native"
                  />
                  <span className={styles.radioLabel}>Current App</span>
                </label>
                <label className={`modal-radio-option ${styles.radioOption}`}>
                  <input
                    checked={formState.executionEnvironment === 'wsl'}
                    name="taskExecutionEnvironment"
                    onChange={() => updateFormState({ executionEnvironment: 'wsl' })}
                    type="radio"
                    value="wsl"
                  />
                  <span className={styles.radioLabel}>WSL</span>
                </label>
              </div>
              <span className="modal-help">WSL runs the task through wsl.exe when Agent-Office is running on Windows.</span>
            </div>
          ) : null}
          <label className="modal-checkbox">
            <input
              checked={formState.autoMergeOnSuccess}
              onChange={(event) => updateFormState({ autoMergeOnSuccess: event.target.checked })}
              type="checkbox"
            />
            <span>Auto-merge branch on success</span>
          </label>
          <div className="modal-error">{error}</div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={closeAssignTask} type="button">Cancel</button>
            <button className="btn-primary" disabled={submitting} type="submit">
              {submitting ? 'Assigning...' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
