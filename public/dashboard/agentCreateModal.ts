// @ts-nocheck

import { getDashboardAPI } from './shared.js';
import {
  buildFallbackBranchName,
  pickDirectory,
  populateBaseBranchOptions,
  setPreviewStatus,
  submitAgentCreateForm,
  updatePreviewCopy,
  updateWorktreeFieldState,
} from './agentCreateModalHelpers.js';

export function setupAgentModal(openTerminalForAgent) {
  const modal = document.getElementById('createAgentModal');
  const form = document.getElementById('createAgentForm');
  const openBtn = document.getElementById('createAgentBtn');
  const cancelBtn = document.getElementById('cancelCreateBtn');
  const errorEl = document.getElementById('createAgentError');
  const workspacePathInput = document.getElementById('agentWorkspacePathInput') as HTMLInputElement | null;
  const previewStatusEl = document.getElementById('agentWorkspacePreviewStatus');
  const strategyInput = document.getElementById('agentStrategyInput') as HTMLSelectElement | null;
  const worktreeFields = document.getElementById('worktreeAgentFields');
  const workspaceParentInput = document.getElementById('agentWorkspaceParentInput') as HTMLInputElement | null;
  const branchInput = document.getElementById('agentBranchInput') as HTMLInputElement | null;
  const baseBranchInput = document.getElementById('agentBaseBranchInput') as HTMLInputElement | null;
  const baseBranchList = document.getElementById('agentBaseBranchList');
  const branchModeInput = document.getElementById('agentBranchModeInput') as HTMLInputElement | null;
  const startPointInput = document.getElementById('agentStartPointInput') as HTMLInputElement | null;
  const inspectStatusEl = document.getElementById('agentRepoInspectStatus');
  if (!modal || !form || !openBtn || !workspacePathInput || !strategyInput || !worktreeFields) return;

  let selectedProvider = 'claude';
  let branchMode = 'auto';
  let baseBranchTouched = false;
  let startPointTouched = false;
  let previewTimer = null;
  let registrationPreview = null;

  const providerBtns = document.querySelectorAll('#providerSelect .provider-btn');
  providerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      providerBtns.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.provider;
      syncAutoBranch();
      refreshRegistrationPreview().catch((error) => {
        console.error('[Workspace Resolve]', error);
      });
    });
  });

  function resetProviderSelection() {
    providerBtns.forEach((btn) => btn.classList.remove('active'));
    if (providerBtns[0]) providerBtns[0].classList.add('active');
    selectedProvider = 'claude';
  }

  function updateBranchModeLabel() {
    if (branchModeInput) branchModeInput.value = branchMode === 'auto' ? 'Auto' : 'Custom';
  }

  function fallbackBranchName() {
    return buildFallbackBranchName(
      document.getElementById('agentNameInput')?.value.trim() || 'agent',
      selectedProvider || 'general'
    );
  }

  function suggestedBranchName() {
    return registrationPreview?.worktreeDefaults?.branchName || fallbackBranchName();
  }

  function syncAutoBranch() {
    if (branchMode !== 'auto' || !branchInput) return;
    branchInput.value = suggestedBranchName();
  }

  function syncStartPointToBaseBranch() {
    if (startPointTouched || !startPointInput || !baseBranchInput) return;
    startPointInput.value = baseBranchInput.value.trim();
  }

  function resetFormState() {
    form.reset();
    resetProviderSelection();
    branchMode = 'auto';
    baseBranchTouched = false;
    startPointTouched = false;
    registrationPreview = null;
    if (strategyInput) strategyInput.value = 'auto';
    if (baseBranchList) baseBranchList.innerHTML = '';
    if (workspaceParentInput) workspaceParentInput.value = '';
    if (baseBranchInput) baseBranchInput.value = '';
    if (startPointInput) startPointInput.value = '';
    updateBranchModeLabel();
    updatePreviewCopy({
      previewStatusEl,
      inspectStatusEl,
      registrationPreview,
      strategyValue: strategyInput.value,
      worktreeFields,
    });
    if (errorEl) errorEl.textContent = '';
    const openTerminalCheckbox = document.getElementById('workspaceOpenTerminalInput') as HTMLInputElement | null;
    if (openTerminalCheckbox) openTerminalCheckbox.checked = true;
    syncAutoBranch();
  }

  function closeModal() {
    modal.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
  }

  async function refreshRegistrationPreview() {
    const trimmedPath = String(workspacePathInput.value || '').trim();
    if (!trimmedPath) {
      registrationPreview = null;
      populateBaseBranchOptions(baseBranchList, []);
      if (!baseBranchTouched && baseBranchInput) baseBranchInput.value = '';
      if (!startPointTouched && startPointInput) startPointInput.value = '';
      updatePreviewCopy({
        previewStatusEl,
        inspectStatusEl,
        registrationPreview,
        strategyValue: strategyInput.value,
        worktreeFields,
      });
      return;
    }

    setPreviewStatus(previewStatusEl, 'Inspecting workspace path...');

    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.resolveWorkspaceRegistration) {
      setPreviewStatus(previewStatusEl, 'Workspace inspection is only available in the Electron app.');
      return;
    }

    const result = await dashboardAPI.resolveWorkspaceRegistration({
      workspacePath: trimmedPath,
      name: document.getElementById('agentNameInput')?.value.trim() || '',
      provider: selectedProvider,
      strategy: strategyInput.value,
      branchName: branchInput?.value.trim() || '',
    });
    if (!result?.success) {
      registrationPreview = null;
      populateBaseBranchOptions(baseBranchList, []);
      setPreviewStatus(previewStatusEl, result?.error || 'Could not inspect workspace path.');
      updateWorktreeFieldState(worktreeFields, registrationPreview, strategyInput.value);
      return;
    }

    registrationPreview = result.preview || null;
    populateBaseBranchOptions(baseBranchList, registrationPreview?.branches || []);
    if (baseBranchInput && !baseBranchTouched) {
      baseBranchInput.value = registrationPreview?.worktreeDefaults?.baseBranch || '';
    }
    if (workspaceParentInput && !workspaceParentInput.value.trim()) {
      workspaceParentInput.value = registrationPreview?.worktreeDefaults?.workspaceParent || '';
    }
    syncStartPointToBaseBranch();
    syncAutoBranch();
    updatePreviewCopy({
      previewStatusEl,
      inspectStatusEl,
      registrationPreview,
      strategyValue: strategyInput.value,
      worktreeFields,
    });
  }

  function scheduleRegistrationPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      refreshRegistrationPreview().catch((error) => {
        console.error('[Workspace Resolve]', error);
        setPreviewStatus(previewStatusEl, 'Could not inspect workspace path.');
      });
    }, 300);
  }

  strategyInput?.addEventListener('change', () => {
    updatePreviewCopy({
      previewStatusEl,
      inspectStatusEl,
      registrationPreview,
      strategyValue: strategyInput.value,
      worktreeFields,
    });
    refreshRegistrationPreview().catch((error) => {
      console.error('[Workspace Resolve]', error);
      setPreviewStatus(previewStatusEl, 'Could not inspect workspace path.');
    });
  });

  document.getElementById('agentNameInput')?.addEventListener('input', () => {
    syncAutoBranch();
    scheduleRegistrationPreview();
  });
  branchInput?.addEventListener('input', () => {
    const branchValue = branchInput.value.trim();
    branchMode = !branchValue || branchValue === suggestedBranchName() ? 'auto' : 'custom';
    if (branchMode === 'auto' && !branchValue) {
      syncAutoBranch();
    }
    updateBranchModeLabel();
  });
  branchInput?.addEventListener('focus', () => {
    if (branchMode === 'auto' && !branchInput.value.trim()) {
      syncAutoBranch();
    }
  });
  baseBranchInput?.addEventListener('input', () => {
    baseBranchTouched = true;
    syncStartPointToBaseBranch();
  });
  startPointInput?.addEventListener('input', () => {
    startPointTouched = !!startPointInput.value.trim();
  });
  workspacePathInput?.addEventListener('input', () => {
    scheduleRegistrationPreview();
  });
  workspacePathInput?.addEventListener('blur', () => {
    refreshRegistrationPreview().catch((error) => {
      console.error('[Workspace Resolve]', error);
      setPreviewStatus(previewStatusEl, 'Could not inspect workspace path.');
    });
  });

  document.getElementById('agentWorkspacePathBrowseBtn')?.addEventListener('click', () => {
    pickDirectory({
      inputId: 'agentWorkspacePathInput',
      title: 'Select workspace folder',
      errorEl,
    }).catch((error) => {
      console.error('[Directory Picker]', error);
      if (errorEl) errorEl.textContent = 'Could not open folder picker.';
    });
  });
  document.getElementById('agentWorkspaceParentBrowseBtn')?.addEventListener('click', () => {
    pickDirectory({
      inputId: 'agentWorkspaceParentInput',
      title: 'Select workspace parent folder',
      fallbackInputId: 'agentWorkspacePathInput',
      errorEl,
    }).catch((error) => {
      console.error('[Directory Picker]', error);
      if (errorEl) errorEl.textContent = 'Could not open folder picker.';
    });
  });
  openBtn.addEventListener('click', () => {
    resetFormState();
    modal.style.display = '';
  });
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitAgentCreateForm({
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
    });
  });
}
