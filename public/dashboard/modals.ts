// @ts-nocheck

import {
  SHARED_AVATAR_FILES,
  escapeText,
  getDashboardAPI,
  state,
} from './shared.js';
import { officeCharacters } from '../office/index.js';

export function setupNicknameEdit() {
  const panel = document.getElementById('agentPanel');
  if (!panel) return;

  panel.addEventListener('dblclick', (event) => {
    const nameEl = event.target.closest('.agent-display-name');
    if (!nameEl || nameEl.querySelector('input')) return;

    const agentId = nameEl.dataset.agentId;
    const currentName = nameEl.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'nickname-input';
    input.style.cssText = 'background:#1a1d23;color:#e6edf3;border:1px solid #3b82f6;border-radius:4px;padding:1px 4px;font:inherit;width:100%;outline:none;';

    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    function save() {
      const value = input.value.trim();
      const dashboardAPI = getDashboardAPI();
      if (value && value !== currentName && dashboardAPI) {
        dashboardAPI.setNickname(agentId, value);
      } else if (!value && dashboardAPI) {
        dashboardAPI.removeNickname(agentId);
      }
      input.remove();
      nameEl.textContent = value || currentName;
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (keydownEvent) => {
      if (keydownEvent.key === 'Enter') {
        keydownEvent.preventDefault();
        input.blur();
      }
      if (keydownEvent.key === 'Escape') {
        keydownEvent.preventDefault();
        input.value = currentName;
        input.blur();
      }
    });
  });
}

export function setupAgentModal(openTerminalForAgent) {
  const modal = document.getElementById('createAgentModal');
  const form = document.getElementById('createAgentForm');
  const openBtn = document.getElementById('createAgentBtn');
  const cancelBtn = document.getElementById('cancelCreateBtn');
  const errorEl = document.getElementById('createAgentError');
  const modeBtns = document.querySelectorAll('#createModeSelect .provider-btn');
  const existingFields = document.getElementById('existingAgentFields');
  const worktreeFields = document.getElementById('worktreeAgentFields');
  const repoPathInput = document.getElementById('agentRepoPathInput');
  const branchInput = document.getElementById('agentBranchInput');
  const baseBranchInput = document.getElementById('agentBaseBranchInput');
  const baseBranchList = document.getElementById('agentBaseBranchList');
  const branchModeInput = document.getElementById('agentBranchModeInput');
  const startPointInput = document.getElementById('agentStartPointInput');
  const inspectStatusEl = document.getElementById('agentRepoInspectStatus');
  if (!modal || !form || !openBtn || !existingFields || !worktreeFields) return;

  let createMode = 'existing';
  let selectedProvider = 'claude';
  let branchMode = 'auto';
  let baseBranchTouched = false;
  let startPointTouched = false;
  let lastInspectedRepoPath = '';
  let inspectTimer = null;
  let repoInspection = null;

  const providerBtns = document.querySelectorAll('#providerSelect .provider-btn');
  providerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      providerBtns.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.provider;
      syncAutoBranch();
    });
  });

  function setCreateMode(nextMode) {
    createMode = nextMode === 'worktree' ? 'worktree' : 'existing';
    modeBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === createMode));
    existingFields.style.display = createMode === 'existing' ? '' : 'none';
    worktreeFields.style.display = createMode === 'worktree' ? '' : 'none';
  }

  function resetProviderSelection() {
    providerBtns.forEach((btn) => btn.classList.remove('active'));
    if (providerBtns[0]) providerBtns[0].classList.add('active');
    selectedProvider = 'claude';
  }

  function resetFormState() {
    form.reset();
    setCreateMode('existing');
    resetProviderSelection();
    branchMode = 'auto';
    baseBranchTouched = false;
    startPointTouched = false;
    lastInspectedRepoPath = '';
    repoInspection = null;
    updateBranchModeLabel();
    if (baseBranchList) baseBranchList.innerHTML = '';
    if (inspectStatusEl) inspectStatusEl.textContent = 'Enter a repository path to inspect branches.';
    if (errorEl) errorEl.textContent = '';
    const openTerminalCheckbox = document.getElementById('workspaceOpenTerminalInput');
    if (openTerminalCheckbox) openTerminalCheckbox.checked = true;
  }

  function closeModal() {
    modal.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
  }

  async function pickDirectory({
    inputId,
    title,
    fallbackInputId,
  }: {
    inputId: string;
    title: string;
    fallbackInputId?: string;
  }) {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;

    const fallbackInput = fallbackInputId
      ? document.getElementById(fallbackInputId) as HTMLInputElement | null
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

  function parsePathListValue(inputId) {
    return String(document.getElementById(inputId)?.value || '')
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function updateBranchModeLabel() {
    if (branchModeInput) branchModeInput.value = branchMode === 'auto' ? 'Auto' : 'Custom';
  }

  function suggestBranchName() {
    const agentName = document.getElementById('agentNameInput')?.value.trim() || 'agent';
    const slug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
    return `workspace/${selectedProvider || 'general'}/${slug}`;
  }

  function syncAutoBranch() {
    if (branchMode !== 'auto' || !branchInput) return;
    branchInput.value = suggestBranchName();
  }

  function syncStartPointToBaseBranch() {
    if (startPointTouched || !startPointInput || !baseBranchInput) return;
    startPointInput.value = baseBranchInput.value.trim();
  }

  function populateBaseBranchOptions(branches = []) {
    if (!baseBranchList) return;
    baseBranchList.innerHTML = branches
      .map((branch) => `<option value="${escapeText(branch)}"></option>`)
      .join('');
  }

  async function inspectRepository(repoPath) {
    const trimmedPath = String(repoPath || '').trim();
    if (!trimmedPath) {
      lastInspectedRepoPath = '';
      repoInspection = null;
      populateBaseBranchOptions([]);
      if (!baseBranchTouched && baseBranchInput) baseBranchInput.value = '';
      if (!startPointTouched && startPointInput) startPointInput.value = '';
      if (inspectStatusEl) inspectStatusEl.textContent = 'Enter a repository path to inspect branches.';
      return;
    }

    if (trimmedPath === lastInspectedRepoPath) return;

    lastInspectedRepoPath = trimmedPath;
    repoInspection = null;
    if (inspectStatusEl) inspectStatusEl.textContent = 'Inspecting repository...';

    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.inspectWorkspaceRepo) {
      if (inspectStatusEl) inspectStatusEl.textContent = 'Repository inspection is only available in the Electron app.';
      return;
    }

    const result = await dashboardAPI.inspectWorkspaceRepo(trimmedPath);
    if (!result?.success) {
      repoInspection = null;
      populateBaseBranchOptions([]);
      if (inspectStatusEl) inspectStatusEl.textContent = result?.error || 'Could not inspect repository.';
      return;
    }

    repoInspection = result.repository;
    populateBaseBranchOptions(repoInspection.branches || []);
    if (baseBranchInput && !baseBranchTouched) {
      baseBranchInput.value = repoInspection.currentBranch || '';
    }
    syncStartPointToBaseBranch();
    if (inspectStatusEl) {
      const branchCount = Array.isArray(repoInspection.branches) ? repoInspection.branches.length : 0;
      inspectStatusEl.textContent =
        `Detected ${repoInspection.repositoryName} · ${repoInspection.currentBranch || 'HEAD'} · ${branchCount} local branches`;
    }
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setCreateMode(btn.dataset.mode));
  });

  document.getElementById('agentNameInput')?.addEventListener('input', syncAutoBranch);
  branchInput?.addEventListener('input', () => {
    const branchValue = branchInput.value.trim();
    branchMode = !branchValue || branchValue === suggestBranchName() ? 'auto' : 'custom';
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
  repoPathInput?.addEventListener('input', () => {
    if (inspectTimer) clearTimeout(inspectTimer);
    lastInspectedRepoPath = '';
    if (inspectStatusEl) {
      inspectStatusEl.textContent = repoPathInput.value.trim()
        ? 'Inspecting repository...'
        : 'Enter a repository path to inspect branches.';
    }
    inspectTimer = setTimeout(() => {
      inspectRepository(repoPathInput.value).catch((error) => {
        console.error('[Workspace Inspect]', error);
        if (inspectStatusEl) inspectStatusEl.textContent = 'Could not inspect repository.';
      });
    }, 300);
  });
  repoPathInput?.addEventListener('blur', () => {
    inspectRepository(repoPathInput.value).catch((error) => {
      console.error('[Workspace Inspect]', error);
      if (inspectStatusEl) inspectStatusEl.textContent = 'Could not inspect repository.';
    });
  });

  document.getElementById('agentPathBrowseBtn')?.addEventListener('click', () => {
    pickDirectory({ inputId: 'agentPathInput', title: 'Select project folder' }).catch((error) => {
      console.error('[Directory Picker]', error);
      if (errorEl) errorEl.textContent = 'Could not open folder picker.';
    });
  });
  document.getElementById('agentRepoPathBrowseBtn')?.addEventListener('click', () => {
    pickDirectory({ inputId: 'agentRepoPathInput', title: 'Select repository folder' }).catch((error) => {
      console.error('[Directory Picker]', error);
      if (errorEl) errorEl.textContent = 'Could not open folder picker.';
    });
  });
  document.getElementById('agentWorkspaceParentBrowseBtn')?.addEventListener('click', () => {
    pickDirectory({
      inputId: 'agentWorkspaceParentInput',
      title: 'Select workspace parent folder',
      fallbackInputId: 'agentRepoPathInput',
    }).catch((error) => {
      console.error('[Directory Picker]', error);
      if (errorEl) errorEl.textContent = 'Could not open folder picker.';
    });
  });
  openBtn.addEventListener('click', () => {
    resetFormState();
    syncAutoBranch();
    modal.style.display = '';
  });
  cancelBtn?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = '';

    const dashboardAPI = getDashboardAPI();
    const name = document.getElementById('agentNameInput').value.trim();
    const role = document.getElementById('agentRoleInput').value.trim();
    if (!name) {
      if (errorEl) errorEl.textContent = 'Name is required.';
      return;
    }

    if (createMode === 'worktree') {
      const repoPath = document.getElementById('agentRepoPathInput').value.trim();
      if (!repoPath) {
        if (errorEl) errorEl.textContent = 'Repository path is required.';
        return;
      }
      if (!dashboardAPI?.createWorkspaceAgent) {
        if (errorEl) errorEl.textContent = 'Workspace creation is not available.';
        return;
      }

      const payload = {
        name,
        role,
        provider: selectedProvider,
        repoPath,
        branchName: document.getElementById('agentBranchInput').value.trim(),
        baseBranch: document.getElementById('agentBaseBranchInput').value.trim(),
        workspaceParent: document.getElementById('agentWorkspaceParentInput').value.trim(),
        startPoint: document.getElementById('agentStartPointInput').value.trim()
          || document.getElementById('agentBaseBranchInput').value.trim(),
        copyPaths: parsePathListValue('agentCopyPathsInput'),
        symlinkPaths: parsePathListValue('agentSymlinkPathsInput'),
        bootstrapCommand: document.getElementById('agentBootstrapCommandInput').value.trim(),
      };

      const result = await dashboardAPI.createWorkspaceAgent(payload);
      if (!result?.success) {
        if (errorEl) errorEl.textContent = result?.error || 'Failed to create workspace.';
        return;
      }

      const shouldOpenTerminal = !!document.getElementById('workspaceOpenTerminalInput')?.checked;
      closeModal();
      resetFormState();

      if (shouldOpenTerminal && result.agent?.id) {
        await openTerminalForAgent(result.agent.id, {
          cwd: result.workspace?.worktreePath,
          label: name,
          skipProviderBoot: true,
        });

        if (result.bootstrapCommand && dashboardAPI.writeTerminal) {
          setTimeout(() => {
            dashboardAPI.writeTerminal(result.agent.id, `${result.bootstrapCommand}\r`);
          }, 250);
        }
      }
      return;
    }

    const projectPath = document.getElementById('agentPathInput').value.trim();
    if (!projectPath) {
      if (errorEl) errorEl.textContent = 'Project path is required.';
      return;
    }

    if (dashboardAPI?.createRegisteredAgent) {
      const result = await dashboardAPI.createRegisteredAgent({ name, role, projectPath, provider: selectedProvider });
      if (result?.success) {
        closeModal();
        resetFormState();
      } else if (errorEl) {
        errorEl.textContent = result?.error || 'Failed to register agent.';
      }
    }
  });
}

export function setupAssignTaskModal() {
  const modal = document.getElementById('assignTaskModal');
  const form = document.getElementById('assignTaskForm');
  const cancelBtn = document.getElementById('cancelAssignTaskBtn');
  const errorEl = document.getElementById('assignTaskError');
  const agentNameEl = document.getElementById('assignTaskAgentName');
  const providerDisplay = document.getElementById('taskProviderDisplay') as HTMLInputElement | null;
  const modelSelect = document.getElementById('taskModelInput') as HTMLSelectElement | null;
  if (!modal || !form) return;

  const MODELS_BY_PROVIDER: Record<string, { value: string; label: string }[]> = {
    claude: [
      { value: '', label: 'Default' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
    codex: [
      { value: '', label: 'Default' },
      { value: 'o4-mini', label: 'o4-mini' },
      { value: 'o3', label: 'o3' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    gemini: [
      { value: '', label: 'Default' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  };

  let currentAgent: any = null;

  function populateModels(provider: string) {
    if (!modelSelect) return;
    const models = MODELS_BY_PROVIDER[provider] || [{ value: '', label: 'Default' }];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m.value}">${m.label}</option>`)
      .join('');
  }

  function closeModal() {
    modal.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
    currentAgent = null;
  }

  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = '';
    if (!currentAgent) return;

    const prompt = (document.getElementById('taskPromptInput') as HTMLTextAreaElement).value.trim();
    if (!prompt) {
      if (errorEl) errorEl.textContent = 'Task prompt is required.';
      return;
    }

    const provider = currentAgent.provider || 'claude';
    const model = modelSelect?.value || null;
    const maxTurns = parseInt((document.getElementById('taskMaxTurnsInput') as HTMLInputElement).value, 10) || 30;
    const priority = (document.getElementById('taskPriorityInput') as HTMLSelectElement).value || 'normal';
    const autoMergeOnSuccess = !!(document.getElementById('taskAutoMergeInput') as HTMLInputElement).checked;

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${currentAgent.displayName || currentAgent.name}: ${prompt.slice(0, 50)}`,
          prompt,
          provider,
          model,
          maxTurns,
          repositoryPath: currentAgent.metadata?.projectPath || currentAgent.projectPath || currentAgent.workspace?.worktreePath || '',
          priority,
          autoMergeOnSuccess,
          agentRegistryId: currentAgent.registryId || currentAgent.id,
        }),
      });
      const result = await response.json();
      if (result.error) {
        if (errorEl) errorEl.textContent = result.error;
        return;
      }
      closeModal();
      (form as HTMLFormElement).reset();
    } catch (e: any) {
      if (errorEl) errorEl.textContent = `Failed: ${e.message}`;
    }
  });

  (globalThis as any).openAssignTaskModal = function (agent: any) {
    currentAgent = agent;
    const provider = agent.provider || 'claude';
    if (agentNameEl) agentNameEl.textContent = agent.displayName || agent.name || 'Agent';
    if (providerDisplay) providerDisplay.value = provider.charAt(0).toUpperCase() + provider.slice(1);
    populateModels(provider);
    (form as HTMLFormElement).reset();
    if (providerDisplay) providerDisplay.value = provider.charAt(0).toUpperCase() + provider.slice(1);
    if (errorEl) errorEl.textContent = '';
    modal.style.display = '';
  };
}

export function setupAvatarPicker(updateAgentUI) {
  const modal = document.getElementById('avatarPickerModal');
  const grid = document.getElementById('avatarPickerGrid');
  const cancelBtn = document.getElementById('cancelAvatarBtn');
  if (!modal || !grid) return;

  const displayWidth = 53;
  const displayHeight = 70;
  const columns = 8;
  let currentRegistryId = null;
  let currentAgentId = null;

  SHARED_AVATAR_FILES.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'avatar-picker-item';
    item.dataset.index = index;
    item.style.backgroundImage = `url('./public/characters/${file}')`;
    item.style.backgroundSize = `${displayWidth * columns}px auto`;
    item.style.backgroundPosition = '0px 0px';
    item.style.width = `${displayWidth}px`;
    item.style.height = `${displayHeight}px`;
    item.style.imageRendering = 'auto';
    item.title = `Avatar ${index}`;

    item.addEventListener('click', async () => {
      if (!currentRegistryId) return;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.updateRegisteredAgent) {
        await dashboardAPI.updateRegisteredAgent(currentRegistryId, { avatarIndex: index });
      }

      if (currentAgentId) {
        const character = officeCharacters.characters.get(currentAgentId);
        if (character) {
          character.avatarFile = file;
          character.skinIndex = index;
        }
      }

      if (currentAgentId) {
        const agent = state.agents.get(currentAgentId);
        if (agent) {
          agent.avatarIndex = index;
          updateAgentUI(agent);
        }
      }
      modal.style.display = 'none';
    });

    grid.appendChild(item);
  });

  cancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.style.display = 'none';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display !== 'none') modal.style.display = 'none';
  }, { capture: true });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.agent-avatar-btn');
    if (!btn) return;
    event.stopPropagation();
    currentRegistryId = btn.dataset.avatarId;
    currentAgentId = btn.dataset.agentId;

    const agent = state.agents.get(currentAgentId);
    const currentIndex = agent ? (agent.avatarIndex != null ? agent.avatarIndex : 0) : 0;
    grid.querySelectorAll('.avatar-picker-item').forEach((item) => {
      item.classList.toggle('selected', parseInt(item.dataset.index, 10) === currentIndex);
    });

    modal.style.display = '';
    requestAnimationFrame(() => modal.focus());
  });
}

export function setupConversationViewer(resumeRegisteredSession) {
  const overlay = document.createElement('div');
  overlay.className = 'conv-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'conv-modal';
  modal.innerHTML = `
    <div class="conv-modal-header">
      <div class="conv-modal-title">Session History</div>
      <button class="conv-modal-close">&times;</button>
    </div>
    <div class="conv-modal-body">
      <div class="conv-session-list"></div>
      <div class="conv-chat-panel" style="display:none">
        <div class="conv-chat-header">
          <button class="conv-back-btn">&larr; Back</button>
          <span class="conv-chat-session-id"></span>
          <button class="conv-resume-btn">Resume</button>
        </div>
        <div class="conv-chat-messages"></div>
      </div>
    </div>
  `;
  overlay.appendChild(modal);

  const sessionListEl = modal.querySelector('.conv-session-list');
  const chatPanel = modal.querySelector('.conv-chat-panel');
  const chatMessages = modal.querySelector('.conv-chat-messages');
  const chatSessionId = modal.querySelector('.conv-chat-session-id');
  const backBtn = modal.querySelector('.conv-back-btn');
  const resumeBtn = modal.querySelector('.conv-resume-btn');
  const closeBtn = modal.querySelector('.conv-modal-close');
  const titleEl = modal.querySelector('.conv-modal-title');

  let currentRegistryId = null;
  let currentSessionId = null;
  let currentResumeSessionId = null;
  let currentAgentName = null;

  function closeModal() {
    overlay.style.display = 'none';
    currentRegistryId = null;
    currentSessionId = null;
    currentResumeSessionId = null;
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') closeModal();
  });
  backBtn.addEventListener('click', () => {
    chatPanel.style.display = 'none';
    sessionListEl.style.display = '';
    currentSessionId = null;
    currentResumeSessionId = null;
  });
  resumeBtn.addEventListener('click', async () => {
    if (!currentRegistryId || !(currentResumeSessionId || currentSessionId)) return;
    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.resumeSession) {
      alert('Resume is only available in the Electron app');
      return;
    }

    const registryId = currentRegistryId;
    const sessionId = currentResumeSessionId || currentSessionId;
    const label = currentAgentName;
    closeModal();

    const result = await resumeRegisteredSession(registryId, sessionId, label);
    if (!result?.success) {
      alert(`Failed to resume: ${result?.error || 'unknown'}`);
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '';
    }
  }

  function renderMessage(message) {
    if (message.role === 'system') {
      return `<div class="conv-msg conv-msg-system"><span class="conv-msg-badge">SYSTEM</span> ${escapeHtml(message.content)}</div>`;
    }
    if (message.role === 'user') {
      return `<div class="conv-msg conv-msg-user"><span class="conv-msg-badge">USER</span><div class="conv-msg-content">${escapeHtml(message.content)}</div>${message.timestamp ? `<span class="conv-msg-time">${formatTime(message.timestamp)}</span>` : ''}</div>`;
    }
    if (message.role === 'assistant') {
      const toolHtml = message.toolUses && message.toolUses.length > 0
        ? `<div class="conv-msg-tools">${message.toolUses.map((tool) => `<span class="conv-tool-tag">${escapeHtml(tool.name)}</span>`).join('')}</div>`
        : '';
      return `<div class="conv-msg conv-msg-assistant"><span class="conv-msg-badge">ASSISTANT</span>${toolHtml}<div class="conv-msg-content">${escapeHtml(message.content)}</div><div class="conv-msg-meta">${message.model ? `<span class="conv-msg-model">${message.model}</span>` : ''}${message.timestamp ? `<span class="conv-msg-time">${formatTime(message.timestamp)}</span>` : ''}</div></div>`;
    }
    return '';
  }

  async function openConversation(registryId, sessionId, resumeSessionId) {
    currentSessionId = sessionId;
    currentResumeSessionId = resumeSessionId || sessionId;
    sessionListEl.style.display = 'none';
    chatPanel.style.display = '';
    chatSessionId.textContent = `${(currentResumeSessionId || sessionId).slice(0, 16)}...`;
    chatMessages.innerHTML = '<div class="conv-loading">Loading conversation...</div>';

    try {
      let data;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.getConversation) {
        data = await dashboardAPI.getConversation(registryId, sessionId, {});
      } else {
        const response = await fetch(`/api/agents/${registryId}/conversation/${sessionId}`);
        data = await response.json();
      }

      if (data.error) {
        chatMessages.innerHTML = `<div class="conv-empty">${data.error}</div>`;
        return;
      }
      if (!data.messages || data.messages.length === 0) {
        chatMessages.innerHTML = '<div class="conv-empty">No messages in this session.</div>';
        return;
      }

      chatMessages.innerHTML = data.messages.map(renderMessage).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
      chatMessages.innerHTML = '<div class="conv-empty">Failed to load conversation.</div>';
      console.error('[Conversation]', error);
    }
  }

  async function openSessionHistory(registryId, agentName) {
    currentRegistryId = registryId;
    currentSessionId = null;
    currentResumeSessionId = null;
    currentAgentName = agentName || 'Agent';
    titleEl.textContent = `${currentAgentName} — Session History`;
    sessionListEl.style.display = '';
    chatPanel.style.display = 'none';
    sessionListEl.innerHTML = '<div class="conv-loading">Loading...</div>';
    overlay.style.display = '';

    try {
      let history;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.getSessionHistory) {
        history = await dashboardAPI.getSessionHistory(registryId);
      } else {
        const response = await fetch(`/api/agents/${registryId}/history`);
        history = await response.json();
      }

      if (!history || history.length === 0) {
        sessionListEl.innerHTML = '<div class="conv-empty">No session history yet.</div>';
        return;
      }

      history.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
      sessionListEl.innerHTML = history.map((entry) => {
        const started = entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '-';
        const ended = entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Active';
        const msgCount = entry.summary ? entry.summary.messageCount : '?';
        const hasTranscript = !!entry.transcriptPath;
        const conversationSessionId = entry.sessionId || entry.resumeSessionId || entry.runtimeSessionId || '';
        const resumeSessionId = entry.resumeSessionId || entry.sessionId || entry.runtimeSessionId || '';
        const labelSessionId = resumeSessionId || conversationSessionId;
        return `
          <div class="conv-session-item ${hasTranscript ? '' : 'no-transcript'}" data-session-id="${conversationSessionId}" data-resume-session-id="${resumeSessionId}" data-has-transcript="${hasTranscript}">
            <div class="conv-session-main">
              <span class="conv-session-id-label">${labelSessionId.slice(0, 12)}...</span>
              <span class="conv-session-msgs">${msgCount} messages${hasTranscript ? '' : ' · transcript unavailable'}</span>
            </div>
            <div class="conv-session-dates">
              <span>${started}</span>
              <span class="conv-session-arrow">&rarr;</span>
              <span>${ended}</span>
            </div>
          </div>
        `;
      }).join('');

      sessionListEl.querySelectorAll('.conv-session-item').forEach((item) => {
        item.addEventListener('click', () => {
          openConversation(registryId, item.dataset.sessionId, item.dataset.resumeSessionId || item.dataset.sessionId);
        });
      });
    } catch (error) {
      sessionListEl.innerHTML = '<div class="conv-empty">Failed to load history.</div>';
      console.error('[History]', error);
    }
  }

  globalThis.openSessionHistory = openSessionHistory;
}

export function setupTaskReportModal() {
  const modal = document.getElementById('taskReportModal');
  const closeBtn = document.getElementById('closeTaskReportBtn');
  const outputEl = document.getElementById('taskReportOutput');
  const diffSummaryEl = document.getElementById('taskReportDiffSummary');
  const diffEl = document.getElementById('taskReportDiff');
  const titleEl = document.getElementById('taskReportTitle');
  const mergeBtn = document.getElementById('taskReportMergeBtn');
  const rejectBtn = document.getElementById('taskReportRejectBtn');
  if (!modal || !outputEl || !diffSummaryEl || !diffEl || !mergeBtn || !rejectBtn) return;

  let currentTaskId = '';
  let currentAgentId = '';

  function closeModal() {
    modal.style.display = 'none';
    currentTaskId = '';
    currentAgentId = '';
  }

  closeBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  async function openTaskReport(taskId) {
    currentTaskId = taskId;
    if (titleEl) titleEl.textContent = 'Task Report';
    outputEl.textContent = 'Loading...';
    diffSummaryEl.textContent = '';
    diffEl.textContent = '';
    modal.style.display = '';

    try {
      const res = await fetch(`/api/tasks/${taskId}/report`);
      const data = await res.json();
      currentAgentId = data.agentRegistryId || '';
      if (titleEl) titleEl.textContent = data.title || 'Task Report';
      const cleanedOutput = (data.output || '').trim();
      outputEl.textContent = cleanedOutput
        || '(이 태스크에 대한 에이전트 응답을 찾을 수 없습니다. 아래 Changes 섹션에서 실제 변경 내역을 확인하세요.)';
      diffSummaryEl.textContent = data.diffSummary || '(no changes)';
      diffEl.textContent = data.diff || '';
    } catch (e) {
      outputEl.textContent = 'Failed to load report.';
    }
  }

  mergeBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;
    mergeBtn.disabled = true;
    mergeBtn.textContent = 'Merging...';
    try {
      const res = await fetch(`/api/tasks/${currentTaskId}/merge`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        if (officeChars?.clearReportBubble && currentAgentId) officeChars.clearReportBubble(currentAgentId);
        closeModal();
      } else {
        alert(data.error || 'Merge failed');
      }
    } catch (e) {
      alert('Merge request failed');
    } finally {
      mergeBtn.disabled = false;
      mergeBtn.textContent = 'Merge';
    }
  });

  rejectBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;
    if (!confirm('Reject this task and discard all changes?')) return;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Rejecting...';
    try {
      const res = await fetch(`/api/tasks/${currentTaskId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        if (officeChars?.clearReportBubble && currentAgentId) officeChars.clearReportBubble(currentAgentId);
        closeModal();
      } else {
        alert(data.error || 'Reject failed');
      }
    } catch (e) {
      alert('Reject request failed');
    } finally {
      rejectBtn.disabled = false;
      rejectBtn.textContent = 'Reject';
    }
  });

  (globalThis as any).openTaskReportModal = openTaskReport;
}
