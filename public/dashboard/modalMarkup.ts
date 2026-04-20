import { createElement } from 'react';
import { renderProviderRadioOptions } from './providerCatalog.js';
import { DashboardModals } from './react/modals.js';
import { renderInto } from './react/root.js';

function upgradeAssignTaskModal(root: HTMLElement) {
  const providerSelect = root.querySelector<HTMLSelectElement>('#taskProviderInput');
  if (providerSelect) {
    const providerGroup = document.createElement('div');
    providerGroup.className = 'modal-radio-group';
    providerGroup.id = 'taskProviderInput';
    providerGroup.innerHTML = renderProviderRadioOptions('taskProvider');
    providerSelect.replaceWith(providerGroup);
  }

  const isWindowsRuntime = (globalThis as any).dashboardAPI?.platform === 'win32';
  if (!isWindowsRuntime) return;

  const autoMergeInput = root.querySelector<HTMLInputElement>('#taskAutoMergeInput');
  const autoMergeLabel = autoMergeInput?.closest('.modal-checkbox');
  if (autoMergeLabel) {
    autoMergeLabel.insertAdjacentHTML('beforebegin', [
      '<div class="modal-label">Execution Environment',
      '<div class="modal-radio-group modal-radio-group-wide" id="taskExecutionEnvironmentInput">',
      '<label class="modal-radio-option"><input type="radio" name="taskExecutionEnvironment" value="native" checked><span>Current App</span></label>',
      '<label class="modal-radio-option"><input type="radio" name="taskExecutionEnvironment" value="wsl"><span>WSL</span></label>',
      '</div>',
      '<span class="modal-help">WSL runs the task through wsl.exe when Agent-Office is running on Windows.</span>',
      '</div>',
    ].join(''));
  }
}

export function renderDashboardModals() {
  const root = document.getElementById('dashboardModalRoot');
  if (!root) return;
  renderInto(root, createElement(DashboardModals));
  upgradeAssignTaskModal(root);
}
