// @ts-nocheck

import { getDashboardAPI } from '../shared.js';

export function setupAssignTaskModal() {
  const modal = document.getElementById('assignTaskModal');
  const form = document.getElementById('assignTaskForm');
  const cancelBtn = document.getElementById('cancelAssignTaskBtn');
  const errorEl = document.getElementById('assignTaskError');
  const agentNameEl = document.getElementById('assignTaskAgentName');
  const providerSelect = document.getElementById('taskProviderInput') as HTMLSelectElement | null;
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

  function resolveTaskRepositoryPath(agent: any) {
    const workspaceRepo = agent?.metadata?.workspace?.repositoryPath || '';
    const metadataProjectPath = agent?.metadata?.projectPath || '';
    const projectPath = agent?.projectPath || '';
    const worktreePath = agent?.metadata?.workspace?.worktreePath || '';

    return workspaceRepo || metadataProjectPath || projectPath || worktreePath || '';
  }

  providerSelect?.addEventListener('change', () => {
    populateModels(providerSelect.value || 'claude');
  });

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

    const provider = providerSelect?.value || currentAgent.provider || 'claude';
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
          repositoryPath: resolveTaskRepositoryPath(currentAgent),
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
    (form as HTMLFormElement).reset();
    if (agentNameEl) agentNameEl.textContent = agent.displayName || agent.name || 'Agent';
    if (providerSelect) providerSelect.value = provider;
    populateModels(provider);
    if (errorEl) errorEl.textContent = '';
    modal.style.display = '';
  };
}
