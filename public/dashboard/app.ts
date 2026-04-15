import {
  DOM,
  archiveState,
  type DisplayValue,
  getDashboardAPI,
  state,
} from './shared.js';
import {
  clearUnregisteredAgents,
  connectSSE,
  initFilterControls,
  renderAgentList,
  updateAgentUI,
  updateBulkArchiveButton,
} from './agentViews.js';
import {
  initViewControls,
  renderArchiveView,
  renderHeatmapView,
  renderUsageView,
} from './activityViews.js';
import { initAgentPanelEvents } from './agentPanelEvents.js';
import { setupOfficeClickHandler } from './office.js';
import { renderDashboardModals } from './modalMarkup.js';
import {
  fitActiveTerminal,
  initResizableHandles,
  initTerminalProfileMenu,
  initTerminals,
  openTerminalForAgent,
  refreshTerminalProfiles,
  resumeRegisteredSession,
} from './terminal/index.js';
import { initOffice } from '../office/index.js';
import {
  setupAgentModal,
  setupAssignTaskModal,
  setupAvatarPicker,
  setupConversationViewer,
  setupNicknameEdit,
  setupTaskReportModal,
  setupTeamFormationModal,
  setupTeamReportModal,
} from './modals/index.js';
import { installHoverTooltips } from '../uiTooltip.js';

type DashboardUiError = Error | { message?: string } | DisplayValue;

function initPipControls() {
  const pipBtn = document.getElementById('pipToggleBtn');
  const pipPlaceholder = document.getElementById('pipPlaceholder');
  const pipStopBtn = document.getElementById('pipStopBtn');
  const officeCanvas = document.getElementById('office-canvas');

  function setPipState(isOpen: boolean) {
    if (pipBtn) pipBtn.classList.toggle('active', isOpen);
    if (pipPlaceholder) pipPlaceholder.style.display = isOpen ? 'flex' : 'none';
    if (officeCanvas) officeCanvas.style.display = isOpen ? 'none' : 'block';
  }

  const dashboardAPI = getDashboardAPI();
  if (pipBtn) {
    pipBtn.addEventListener('click', () => {
      dashboardAPI?.togglePip?.();
    });
  }
  if (pipStopBtn) {
    pipStopBtn.addEventListener('click', () => {
      dashboardAPI?.togglePip?.();
    });
  }
  if (dashboardAPI?.onPipStateChanged) {
    dashboardAPI.onPipStateChanged((isOpen: boolean) => {
      setPipState(isOpen);
    });
  }
}

function initOverlayControls() {
  const overlayBtn = document.getElementById('overlayToggleBtn');
  const dashboardAPI = getDashboardAPI();
  if (overlayBtn) {
    overlayBtn.addEventListener('click', () => {
      dashboardAPI?.toggleOverlay?.();
    });
  }
  if (dashboardAPI?.onOverlayStateChanged) {
    dashboardAPI.onOverlayStateChanged((isOpen: boolean) => {
      if (overlayBtn) overlayBtn.classList.toggle('active', isOpen);
    });
  }
}

function initInitialView() {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  let button = document.querySelector(`[data-view="${state.currentView}"]`) as HTMLButtonElement | null;
  if (!button) button = document.querySelector('[data-view="office"]') as HTMLButtonElement | null;
  if (!button) return;
  button.classList.add('active');

  const target = button.dataset.view;
  document.querySelectorAll('.view-section').forEach((view) => view.classList.remove('active'));
  const targetView = document.getElementById(`${target}View`);
  if (targetView) targetView.classList.add('active');

  if (target === 'heatmap') renderHeatmapView();
  else if (target === 'usage') renderUsageView();
  else if (target === 'archive') renderArchiveView();
}

function initArchiveEvents() {
  if (DOM.archiveRefreshBtn) {
    DOM.archiveRefreshBtn.addEventListener('click', () => {
      renderArchiveView(true);
    });
  }

  if (DOM.bulkArchiveBtn) {
    DOM.bulkArchiveBtn.addEventListener('click', () => {
      clearUnregisteredAgents();
    });
    updateBulkArchiveButton();
  }

  if (!DOM.archiveGrid) return;
  DOM.archiveGrid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const historyBtn = target.closest('.agent-history-btn') as HTMLButtonElement | null;
    if (historyBtn?.dataset.historyId) {
      event.stopPropagation();
      globalThis.openSessionHistory?.(historyBtn.dataset.historyId, historyBtn.dataset.agentName || 'Workspace');
      return;
    }

    const deleteBtn = target.closest('.archive-delete-btn') as HTMLButtonElement | null;
    if (deleteBtn?.dataset.deleteId) {
      event.stopPropagation();
      if (confirm('Delete this archived agent record permanently? This cannot be undone.')) {
        const dashboardAPI = getDashboardAPI();
        const deleteResult = dashboardAPI?.deleteRegisteredAgent?.(deleteBtn.dataset.deleteId);
        deleteResult?.then(() => {
          archiveState.items = null;
          renderArchiveView(true);
        });
      }
    }
  });
}

function initApp() {
  globalThis.openTerminalForAgent = openTerminalForAgent;

  renderDashboardModals();
  initFilterControls();
  initViewControls();
  initPipControls();
  initOverlayControls();
  initInitialView();

  connectSSE();
  initTerminals();
  initTerminalProfileMenu();
  refreshTerminalProfiles().catch((error: DashboardUiError) => console.error('[Terminal Profiles]', error));
  initResizableHandles?.();

  setTimeout(() => {
    initOffice().catch((error: DashboardUiError) => console.error('[Office Init]', error));
    setupOfficeClickHandler(openTerminalForAgent);
  }, 100);

  initAgentPanelEvents();
  installHoverTooltips({
    selector: '.mc-agent-card [data-tooltip], .mc-agent-card button[title]',
  });
  initArchiveEvents();
  setupNicknameEdit();
  setupAgentModal(openTerminalForAgent);
  setupAssignTaskModal();
  setupAvatarPicker(updateAgentUI);
  setupConversationViewer(resumeRegisteredSession);
  setupTaskReportModal();
  setupTeamFormationModal();
  setupTeamReportModal();

  window.addEventListener('resize', () => {
    fitActiveTerminal();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
