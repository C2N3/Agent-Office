
import { getDashboardAPI } from '../shared.js';
import { getProviderModels, normalizeProvider } from '../providerCatalog.js';
import { dashboardModalRegistry } from './registry.js';

export function setupAssignTaskModal() {
  const modal = document.getElementById('assignTaskModal');
  const form = document.getElementById('assignTaskForm');
  const cancelBtn = document.getElementById('cancelAssignTaskBtn');
  const errorEl = document.getElementById('assignTaskError');
  const agentNameEl = document.getElementById('assignTaskAgentName');
  const providerInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="taskProvider"]'));
  const executionEnvironmentInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="taskExecutionEnvironment"]'));
  const modelSelect = document.getElementById('taskModelInput') as HTMLSelectElement | null;
  if (!modal || !form) return;

  let currentAgent: any = null;

  function populateModels(provider: string) {
    if (!modelSelect) return;
    const models = getProviderModels(provider);
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m.value}">${m.label}</option>`)
      .join('');
  }

  function getSelectedProvider() {
    return providerInputs.find((input) => input.checked)?.value || resolveAgentProvider(currentAgent);
  }

  function setSelectedProvider(provider: string) {
    const normalized = normalizeProvider(provider);
    providerInputs.forEach((input) => {
      input.checked = input.value === normalized;
    });
    populateModels(normalized);
  }

  function getSelectedExecutionEnvironment() {
    return executionEnvironmentInputs.find((input) => input.checked)?.value || 'native';
  }

  function setSelectedExecutionEnvironment(value = 'native') {
    const normalized = executionEnvironmentInputs.some((input) => input.value === value) ? value : 'native';
    executionEnvironmentInputs.forEach((input) => {
      input.checked = input.value === normalized;
    });
  }

  function resolveAgentProvider(agent: any) {
    return normalizeProvider(agent?.provider || agent?.metadata?.provider);
  }

  function resolveTaskRepositoryPath(agent: any) {
    const workspaceRepo = agent?.metadata?.workspace?.repositoryPath || '';
    const metadataProjectPath = agent?.metadata?.projectPath || '';
    const projectPath = agent?.projectPath || '';
    const worktreePath = agent?.metadata?.workspace?.worktreePath || '';

    return workspaceRepo || metadataProjectPath || projectPath || worktreePath || '';
  }

  function resolveAgentLabel(agent: any) {
    return agent?.name || agent?.project || agent?.id || 'Agent';
  }

  providerInputs.forEach((input) => {
    input.addEventListener('change', () => {
      populateModels(getSelectedProvider());
    });
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

    const provider = getSelectedProvider();
    const executionEnvironment = getSelectedExecutionEnvironment();
    const model = modelSelect?.value || null;
    const maxTurns = parseInt((document.getElementById('taskMaxTurnsInput') as HTMLInputElement).value, 10) || 30;
    const priority = (document.getElementById('taskPriorityInput') as HTMLSelectElement).value || 'normal';
    const autoMergeOnSuccess = !!(document.getElementById('taskAutoMergeInput') as HTMLInputElement).checked;

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${resolveAgentLabel(currentAgent)}: ${prompt.slice(0, 50)}`,
          prompt,
          provider,
          executionEnvironment,
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

  dashboardModalRegistry.openAssignTaskModal = function (agent) {
    currentAgent = agent;
    const provider = resolveAgentProvider(agent);
    (form as HTMLFormElement).reset();
    if (agentNameEl) agentNameEl.textContent = resolveAgentLabel(agent);
    setSelectedProvider(provider);
    setSelectedExecutionEnvironment('native');
    if (errorEl) errorEl.textContent = '';
    modal.style.display = '';
    requestAnimationFrame(() => {
      (document.getElementById('taskPromptInput') as HTMLTextAreaElement)?.focus();
    });
  };
}
