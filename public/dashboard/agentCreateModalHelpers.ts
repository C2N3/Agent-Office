// @ts-nocheck

import { escapeText, getDashboardAPI } from './shared.js';
import {
  getEffectiveRegistrationStrategy,
  getRegistrationDecisionMessage,
} from './agentRegistration.js';

export function setPreviewStatus(previewStatusEl, message) {
  if (previewStatusEl) previewStatusEl.textContent = message;
}

export function buildFallbackBranchName(agentName, provider) {
  const slug = String(agentName || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
  return `workspace/${provider || 'general'}/${slug}`;
}

export function populateBaseBranchOptions(baseBranchList, branches = []) {
  if (!baseBranchList) return;
  baseBranchList.innerHTML = branches
    .map((branch) => `<option value="${escapeText(branch)}"></option>`)
    .join('');
}

export function parsePathListValue(inputId) {
  return String(document.getElementById(inputId)?.value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function updateWorktreeFieldState(worktreeFields, registrationPreview, strategyValue) {
  if (!worktreeFields) return;
  const effectiveStrategy = getEffectiveRegistrationStrategy(registrationPreview, strategyValue);
  const worktreeEnabled = effectiveStrategy === 'worktree';
  worktreeFields.classList.toggle('is-disabled', !worktreeEnabled);
  worktreeFields.querySelectorAll('input, textarea, button, select').forEach((element) => {
    element.disabled = !worktreeEnabled;
  });
}

export function updatePreviewCopy({
  previewStatusEl,
  inspectStatusEl,
  registrationPreview,
  strategyValue,
  worktreeFields,
}) {
  setPreviewStatus(
    previewStatusEl,
    registrationPreview
      ? getRegistrationDecisionMessage(registrationPreview, strategyValue)
      : 'Enter a workspace path to inspect how it will be registered.'
  );

  if (inspectStatusEl) {
    if (!registrationPreview) {
      inspectStatusEl.textContent = 'Worktree options are available when the effective strategy is managed git worktree.';
    } else if (registrationPreview.isGitRepository) {
      const branchCount = Array.isArray(registrationPreview.branches) ? registrationPreview.branches.length : 0;
      inspectStatusEl.textContent =
        `Detected ${registrationPreview.repositoryName} · ${registrationPreview.currentBranch || 'HEAD'} · ${branchCount} local branches`;
    } else {
      inspectStatusEl.textContent = 'Managed worktree options require a git repository path.';
    }
  }

  updateWorktreeFieldState(worktreeFields, registrationPreview, strategyValue);
}

export async function pickDirectory({
  inputId,
  title,
  fallbackInputId,
  errorEl,
}) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const fallbackInput = fallbackInputId
    ? document.getElementById(fallbackInputId)
    : null;
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.pickDirectory) {
    if (errorEl) errorEl.textContent = 'Folder selection is only available in the Electron app.';
    return;
  }

  const result = await dashboardAPI.pickDirectory({
    title,
    defaultPath: input.value.trim() || fallbackInput?.value.trim() || undefined,
  });
  if (!result?.success) {
    if (errorEl) errorEl.textContent = result?.error || 'Could not open folder picker.';
    return;
  }
  if (result.canceled || !result.path) return;

  input.value = result.path;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function submitAgentCreateForm({
  errorEl,
  workspacePathInput,
  strategyInput,
  branchInput,
  baseBranchInput,
  workspaceParentInput,
  startPointInput,
  selectedProvider,
  openTerminalForAgent,
  closeModal,
  resetFormState,
}) {
  if (errorEl) errorEl.textContent = '';

  const dashboardAPI = getDashboardAPI();
  const name = document.getElementById('agentNameInput')?.value.trim() || '';
  const role = document.getElementById('agentRoleInput')?.value.trim() || '';
  if (!name) {
    if (errorEl) errorEl.textContent = 'Name is required.';
    return;
  }

  const workspacePath = workspacePathInput?.value.trim() || '';
  if (!workspacePath) {
    if (errorEl) errorEl.textContent = 'Workspace path is required.';
    return;
  }
  if (!dashboardAPI?.createAgentFromPath) {
    if (errorEl) errorEl.textContent = 'Agent creation is not available.';
    return;
  }

  const result = await dashboardAPI.createAgentFromPath({
    name,
    role,
    provider: selectedProvider,
    workspacePath,
    strategy: strategyInput?.value || 'auto',
    branchName: branchInput?.value.trim() || '',
    baseBranch: baseBranchInput?.value.trim() || '',
    workspaceParent: workspaceParentInput?.value.trim() || '',
    startPoint: startPointInput?.value.trim() || baseBranchInput?.value.trim() || '',
    copyPaths: parsePathListValue('agentCopyPathsInput'),
    symlinkPaths: parsePathListValue('agentSymlinkPathsInput'),
    bootstrapCommand: document.getElementById('agentBootstrapCommandInput')?.value.trim() || '',
  });
  if (!result?.success) {
    if (errorEl) errorEl.textContent = result?.error || 'Failed to register agent.';
    return;
  }

  const shouldOpenTerminal = !!document.getElementById('workspaceOpenTerminalInput')?.checked;
  closeModal?.();
  resetFormState?.();

  if (!shouldOpenTerminal || !result.agent?.id) {
    return;
  }

  await openTerminalForAgent(result.agent.id, {
    cwd: result.workspace?.worktreePath || result.projectPath || workspacePath,
    label: name,
    skipProviderBoot: true,
  });

  if (result.effectiveStrategy === 'worktree' && result.bootstrapCommand && dashboardAPI.writeTerminal) {
    setTimeout(() => {
      dashboardAPI.writeTerminal(result.agent.id, `${result.bootstrapCommand}\r`);
    }, 250);
  }
}
