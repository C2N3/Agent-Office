import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { getDashboardAPI, type DashboardRegistrationPreview } from '../../shared.js';
import {
  applyRegistrationPreviewDefaults,
  syncAutoBranchName,
  type CreateAgentFormState,
  type CreateAgentTouchedState,
} from './state.js';

export function useRegistrationPreview({
  formState,
  setFormState,
  touchedRef,
  visible,
}: {
  formState: CreateAgentFormState;
  setFormState: Dispatch<SetStateAction<CreateAgentFormState>>;
  touchedRef: RefObject<CreateAgentTouchedState>;
  visible: boolean;
}): {
  previewError: string;
  previewLoading: boolean;
  registrationPreview: DashboardRegistrationPreview | null;
  resetPreview: () => void;
} {
  const [registrationPreview, setRegistrationPreview] = useState<DashboardRegistrationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const resetPreview = useCallback((): void => {
    setRegistrationPreview(null);
    setPreviewLoading(false);
    setPreviewError('');
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    const workspacePath = formState.workspacePath.trim();
    if (!workspacePath) {
      resetPreview();
      setFormState((current) => syncAutoBranchName(current, null));
      return undefined;
    }

    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.resolveWorkspaceRegistration) {
      setRegistrationPreview(null);
      setPreviewLoading(false);
      setPreviewError('Workspace inspection is only available in the Electron app.');
      return undefined;
    }

    let canceled = false;
    setPreviewLoading(true);
    setPreviewError('');

    const timerId = window.setTimeout(() => {
      dashboardAPI.resolveWorkspaceRegistration?.({
        workspacePath,
        name: formState.name.trim(),
        provider: formState.provider,
        strategy: formState.strategy,
        branchName: formState.branchMode === 'custom' ? formState.branchName.trim() : '',
      }).then((result) => {
        if (canceled) return;
        setPreviewLoading(false);
        if (!result?.success) {
          setRegistrationPreview(null);
          setPreviewError(result?.error || 'Could not inspect workspace path.');
          return;
        }

        const preview = result.preview || null;
        setRegistrationPreview(preview);
        setFormState((current) => applyRegistrationPreviewDefaults(
          current,
          preview,
          touchedRef.current,
        ));
      }).catch((caughtError) => {
        if (canceled) return;
        console.error('[Workspace Resolve]', caughtError);
        setRegistrationPreview(null);
        setPreviewLoading(false);
        setPreviewError('Could not inspect workspace path.');
      });
    }, 300);

    return () => {
      canceled = true;
      window.clearTimeout(timerId);
    };
  }, [
    formState.branchMode,
    formState.branchName,
    formState.name,
    formState.provider,
    formState.strategy,
    formState.workspacePath,
    setFormState,
    touchedRef,
    visible,
    resetPreview,
  ]);

  return {
    previewError,
    previewLoading,
    registrationPreview,
    resetPreview,
  };
}
