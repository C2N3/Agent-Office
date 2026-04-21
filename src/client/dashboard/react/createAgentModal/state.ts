import type {
  DashboardPathRegistrationStrategy,
  DashboardRegistrationPreview,
} from '../../shared.js';
import { DEFAULT_PROVIDER_ID, normalizeProvider } from '../../providerCatalog.js';
import {
  getEffectiveRegistrationStrategy,
  getRegistrationDecisionMessage,
} from '../../registration/decision.js';

export type CreateAgentBranchMode = 'auto' | 'custom';

export type CreateAgentFormState = {
  name: string;
  role: string;
  workspacePath: string;
  openTerminal: boolean;
  strategy: DashboardPathRegistrationStrategy;
  branchName: string;
  startPoint: string;
  baseBranch: string;
  branchMode: CreateAgentBranchMode;
  workspaceParent: string;
  copyPaths: string;
  symlinkPaths: string;
  bootstrapCommand: string;
  provider: string;
};

export type CreateAgentTouchedState = {
  baseBranch: boolean;
  startPoint: boolean;
  symlinkPaths: boolean;
};

export const DEFAULT_PREVIEW_STATUS = 'Enter a workspace path to inspect how it will be registered.';
export const DEFAULT_INSPECT_STATUS = 'Worktree options are available when the effective strategy is managed git worktree.';

export function buildDefaultCreateAgentFormState(): CreateAgentFormState {
  return {
    name: '',
    role: '',
    workspacePath: '',
    openTerminal: true,
    strategy: 'auto',
    branchName: '',
    startPoint: '',
    baseBranch: '',
    branchMode: 'auto',
    workspaceParent: '',
    copyPaths: '',
    symlinkPaths: '',
    bootstrapCommand: '',
    provider: DEFAULT_PROVIDER_ID,
  };
}

export function buildDefaultTouchedState(): CreateAgentTouchedState {
  return {
    baseBranch: false,
    startPoint: false,
    symlinkPaths: false,
  };
}

export function buildFallbackBranchName(agentName: string, provider: string): string {
  const slug = String(agentName || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
  return `workspace/${provider || 'general'}/${slug}`;
}

export function getSuggestedBranchName(
  formState: CreateAgentFormState,
  registrationPreview: DashboardRegistrationPreview | null,
): string {
  return registrationPreview?.worktreeDefaults?.branchName
    || buildFallbackBranchName(formState.name.trim() || 'agent', formState.provider || 'general');
}

export function getBranchModeForValue(
  branchValue: string,
  formState: CreateAgentFormState,
  registrationPreview: DashboardRegistrationPreview | null,
): CreateAgentBranchMode {
  const trimmedBranch = branchValue.trim();
  return !trimmedBranch || trimmedBranch === getSuggestedBranchName(formState, registrationPreview)
    ? 'auto'
    : 'custom';
}

export function syncAutoBranchName(
  formState: CreateAgentFormState,
  registrationPreview: DashboardRegistrationPreview | null,
): CreateAgentFormState {
  if (formState.branchMode !== 'auto') return formState;
  return {
    ...formState,
    branchName: getSuggestedBranchName(formState, registrationPreview),
  };
}

export function applyRegistrationPreviewDefaults(
  formState: CreateAgentFormState,
  registrationPreview: DashboardRegistrationPreview | null,
  touchedState: CreateAgentTouchedState,
): CreateAgentFormState {
  const defaults = registrationPreview?.worktreeDefaults;
  let nextState = { ...formState };

  if (!touchedState.baseBranch) {
    nextState.baseBranch = defaults?.baseBranch || '';
  }
  if (!nextState.workspaceParent.trim()) {
    nextState.workspaceParent = defaults?.workspaceParent || '';
  }
  if (!touchedState.symlinkPaths && defaults?.symlinkPaths?.length) {
    nextState.symlinkPaths = defaults.symlinkPaths.join('\n');
  }
  if (!touchedState.startPoint) {
    nextState.startPoint = nextState.baseBranch.trim();
  }

  return syncAutoBranchName(nextState, registrationPreview);
}

export function describeRegistrationPreview(
  registrationPreview: DashboardRegistrationPreview | null,
  strategy: DashboardPathRegistrationStrategy,
): { previewStatus: string; inspectStatus: string } {
  const previewStatus = registrationPreview
    ? getRegistrationDecisionMessage(registrationPreview, strategy)
    : DEFAULT_PREVIEW_STATUS;

  if (!registrationPreview) {
    return {
      previewStatus,
      inspectStatus: DEFAULT_INSPECT_STATUS,
    };
  }

  if (!registrationPreview.isGitRepository) {
    return {
      previewStatus,
      inspectStatus: 'Managed worktree options require a git repository path.',
    };
  }

  const branchCount = Array.isArray(registrationPreview.branches)
    ? registrationPreview.branches.length
    : 0;
  return {
    previewStatus,
    inspectStatus: `Detected ${registrationPreview.repositoryName} · ${registrationPreview.currentBranch || 'HEAD'} · ${branchCount} local branches`,
  };
}

export function isWorktreeStrategyEnabled(
  registrationPreview: DashboardRegistrationPreview | null,
  strategy: DashboardPathRegistrationStrategy,
): boolean {
  return getEffectiveRegistrationStrategy(registrationPreview, strategy) === 'worktree';
}

export function parsePathListValue(value: string): string[] {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildCreateAgentPayload(formState: CreateAgentFormState) {
  return {
    name: formState.name.trim(),
    role: formState.role.trim(),
    provider: normalizeProvider(formState.provider),
    workspacePath: formState.workspacePath.trim(),
    strategy: formState.strategy,
    branchName: formState.branchName.trim(),
    baseBranch: formState.baseBranch.trim(),
    workspaceParent: formState.workspaceParent.trim(),
    startPoint: formState.startPoint.trim() || formState.baseBranch.trim(),
    copyPaths: parsePathListValue(formState.copyPaths),
    symlinkPaths: parsePathListValue(formState.symlinkPaths),
    bootstrapCommand: formState.bootstrapCommand.trim(),
  };
}
