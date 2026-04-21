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
import { dashboardModalRegistry } from '../../modals/registry.js';
import { getDashboardAPI } from '../../shared.js';
import { syncCentralAgentRecord } from '../../centralAgents/index.js';
import { normalizeProvider } from '../../providerCatalog.js';
import { CreateAgentFormFields } from './fields.js';
import {
  DEFAULT_PREVIEW_STATUS,
  buildCreateAgentPayload,
  buildDefaultCreateAgentFormState,
  buildDefaultTouchedState,
  describeRegistrationPreview,
  getBranchModeForValue,
  getSuggestedBranchName,
  isWorktreeStrategyEnabled,
  syncAutoBranchName,
  type CreateAgentFormState,
  type CreateAgentTouchedState,
} from './state.js';
import { useRegistrationPreview } from './useRegistrationPreview.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CreateAgentModal(): ReactElement | null {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const touchedRef = useRef<CreateAgentTouchedState>(buildDefaultTouchedState());
  const [visible, setVisible] = useState(false);
  const [formState, setFormState] = useState<CreateAgentFormState>(buildDefaultCreateAgentFormState);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const {
    previewError,
    previewLoading,
    registrationPreview,
    resetPreview,
  } = useRegistrationPreview({
    formState,
    setFormState,
    touchedRef,
    visible,
  });

  const resetCreateAgentForm = useCallback(() => {
    touchedRef.current = buildDefaultTouchedState();
    setFormState(syncAutoBranchName(buildDefaultCreateAgentFormState(), null));
    resetPreview();
    setError('');
    setSubmitting(false);
  }, [resetPreview]);

  const closeCreateAgent = useCallback(() => {
    setVisible(false);
    resetCreateAgentForm();
  }, [resetCreateAgentForm]);

  const openCreateAgentModal = useCallback(() => {
    resetCreateAgentForm();
    setVisible(true);
  }, [resetCreateAgentForm]);

  useLayoutEffect(() => {
    dashboardModalRegistry.openCreateAgentModal = openCreateAgentModal;
    return () => {
      if (dashboardModalRegistry.openCreateAgentModal === openCreateAgentModal) {
        delete dashboardModalRegistry.openCreateAgentModal;
      }
    };
  }, [openCreateAgentModal]);

  useLayoutEffect(() => {
    if (!visible) return;

    const frameId = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [visible]);

  const updateFormState = useCallback((updates: Partial<CreateAgentFormState>) => {
    setFormState((current) => syncAutoBranchName({ ...current, ...updates }, registrationPreview));
    setError('');
  }, [registrationPreview]);

  const handleProviderChange = useCallback((provider: string) => {
    setFormState((current) => syncAutoBranchName({
      ...current,
      provider: normalizeProvider(provider),
    }, registrationPreview));
    setError('');
  }, [registrationPreview]);

  const handleBranchChange = useCallback((branchName: string) => {
    setFormState((current) => {
      const nextState = { ...current, branchName };
      const branchMode = getBranchModeForValue(branchName, nextState, registrationPreview);
      return syncAutoBranchName({ ...nextState, branchMode }, registrationPreview);
    });
    setError('');
  }, [registrationPreview]);

  const handleBranchFocus = useCallback(() => {
    setFormState((current) => {
      if (current.branchMode !== 'auto' || current.branchName.trim()) return current;
      return { ...current, branchName: getSuggestedBranchName(current, registrationPreview) };
    });
  }, [registrationPreview]);

  const handleBaseBranchChange = useCallback((baseBranch: string) => {
    touchedRef.current.baseBranch = true;
    setFormState((current) => ({
      ...current,
      baseBranch,
      startPoint: touchedRef.current.startPoint ? current.startPoint : baseBranch.trim(),
    }));
    setError('');
  }, []);

  const handleStartPointChange = useCallback((startPoint: string) => {
    touchedRef.current.startPoint = !!startPoint.trim();
    updateFormState({ startPoint });
  }, [updateFormState]);

  const handleSymlinkPathsChange = useCallback((symlinkPaths: string) => {
    touchedRef.current.symlinkPaths = true;
    updateFormState({ symlinkPaths });
  }, [updateFormState]);

  const browseDirectory = useCallback(async (
    field: 'workspacePath' | 'workspaceParent',
    title: string,
  ) => {
    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.pickDirectory) {
      setError('Folder selection is only available in the Electron app.');
      return;
    }

    const defaultPath = field === 'workspaceParent'
      ? formState.workspaceParent.trim() || formState.workspacePath.trim()
      : formState.workspacePath.trim();
    let result;
    try {
      result = await dashboardAPI.pickDirectory({
        title,
        defaultPath: defaultPath || undefined,
      });
    } catch (caughtError) {
      console.error('[Directory Picker]', caughtError);
      setError('Could not open folder picker.');
      return;
    }

    if (!result?.success) {
      setError(result?.error || 'Could not open folder picker.');
      return;
    }
    if (result.canceled || !result.path) return;

    updateFormState({ [field]: result.path } as Partial<CreateAgentFormState>);
  }, [formState.workspaceParent, formState.workspacePath, updateFormState]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const dashboardAPI = getDashboardAPI();
    if (!formState.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!formState.workspacePath.trim()) {
      setError('Workspace path is required.');
      return;
    }
    if (!dashboardAPI?.createAgentFromPath) {
      setError('Agent creation is not available.');
      return;
    }

    setSubmitting(true);
    setError('');

    let result;
    try {
      result = await dashboardAPI.createAgentFromPath(buildCreateAgentPayload(formState));
    } catch (caughtError) {
      setSubmitting(false);
      setError(`Failed: ${getErrorMessage(caughtError)}`);
      return;
    }

    setSubmitting(false);
    if (!result?.success) {
      setError(result?.error || 'Failed to register agent.');
      return;
    }

    syncCentralAgentRecord(result.agent).catch((caughtError) => {
      console.warn('[Central Agents] create sync failed', caughtError);
    });

    closeCreateAgent();
  }, [closeCreateAgent, formState, submitting]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeCreateAgent();
  }, [closeCreateAgent]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') closeCreateAgent();
  }, [closeCreateAgent]);

  const previewCopy = useMemo(() => {
    const copy = describeRegistrationPreview(registrationPreview, formState.strategy);
    return {
      previewStatus: previewLoading
        ? 'Inspecting workspace path...'
        : previewError || copy.previewStatus || DEFAULT_PREVIEW_STATUS,
      inspectStatus: copy.inspectStatus,
    };
  }, [formState.strategy, previewError, previewLoading, registrationPreview]);

  if (!visible) return null;

  return (
    <div
      aria-labelledby="createAgentTitle"
      aria-modal="true"
      className="modal-overlay"
      id="createAgentModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content create-agent-modal">
        <div className="modal-header" id="createAgentTitle">Register New Agent</div>
        <CreateAgentFormFields
          baseBranchOptions={registrationPreview?.branches || []}
          error={error}
          formState={formState}
          inspectStatus={previewCopy.inspectStatus}
          nameInputRef={nameInputRef}
          previewStatus={previewCopy.previewStatus}
          submitting={submitting}
          worktreeEnabled={isWorktreeStrategyEnabled(registrationPreview, formState.strategy)}
          onBaseBranchChange={handleBaseBranchChange}
          onBranchChange={handleBranchChange}
          onBranchFocus={handleBranchFocus}
          onBrowseWorkspaceParent={() => { void browseDirectory('workspaceParent', 'Select workspace parent folder'); }}
          onBrowseWorkspacePath={() => { void browseDirectory('workspacePath', 'Select workspace folder'); }}
          onCancel={closeCreateAgent}
          onChange={updateFormState}
          onProviderChange={handleProviderChange}
          onStartPointChange={handleStartPointChange}
          onSubmit={(submitEvent) => { void handleSubmit(submitEvent); }}
          onSymlinkPathsChange={handleSymlinkPathsChange}
        />
      </div>
    </div>
  );
}
