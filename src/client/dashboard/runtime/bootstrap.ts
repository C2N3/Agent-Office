import {
  DOM,
  archiveState,
  type DisplayValue,
  getDashboardAPI,
  state,
} from '../shared.js';
import {
  clearUnregisteredAgents,
  connectSSE,
  removeAgent,
  renderAgentList,
  updateAgent,
  updateBulkArchiveButton,
} from '../agentViews.js';
import {
  renderArchiveView,
} from '../activityViews.js';
import { setupOfficeClickHandler } from '../office.js';
import {
  fitActiveTerminal,
  initResizableHandles,
  initTerminalProfileMenu,
  initTerminals,
  openTerminalForAgent,
  refreshTerminalProfiles,
  resumeRegisteredSession,
} from '../terminal/index.js';
import {
  initOffice,
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
} from '../../office/index.js';
import {
  setupAgentModal,
  setupAssignTaskModal,
  setupConversationViewer,
  setupNicknameEdit,
  setupTaskReportModal,
  setupTeamReportModal,
} from '../modals/index.js';
import { installHoverTooltips } from '../../../shared/uiTooltip.js';
import { startCentralAgentSync } from '../centralAgents/index.js';
import { initOverlayControls, initPipControls } from '../app/windowControls.js';
import { installDashboardRuntimeGlobals, openSessionHistory } from './globals.js';

type DashboardUiError = Error | { message?: string } | DisplayValue;

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
      openSessionHistory(historyBtn.dataset.historyId, historyBtn.dataset.agentName || 'Workspace');
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

function initEventStreams() {
  connectSSE();
  startCentralAgentSync({
    upsertAgent: (agent) => {
      const existing = state.agents.has(agent.id);
      updateAgent(agent);
      if (existing) {
        officeOnAgentUpdated(agent);
      } else {
        officeOnAgentCreated(agent);
      }
    },
    removeAgent: (id) => {
      removeAgent(id);
      officeOnAgentRemoved({ id });
    },
  });
}

function initTerminalRuntime() {
  initTerminals();
  initTerminalProfileMenu();
  refreshTerminalProfiles().catch((error: DashboardUiError) => console.error('[Terminal Profiles]', error));
  initResizableHandles?.();
}

function initOfficeRuntime() {
  setTimeout(() => {
    initOffice()
      .then(() => renderAgentList())
      .catch((error: DashboardUiError) => console.error('[Office Init]', error));
    setupOfficeClickHandler(openTerminalForAgent);
  }, 100);
}

function initModalRuntime() {
  setupNicknameEdit();
  setupAgentModal(openTerminalForAgent);
  setupAssignTaskModal();
  setupConversationViewer(resumeRegisteredSession);
  setupTaskReportModal();
  setupTeamReportModal();
}

export function initDashboardRuntime() {
  installDashboardRuntimeGlobals(openTerminalForAgent);

  initPipControls();
  initOverlayControls();

  initEventStreams();
  initTerminalRuntime();
  initOfficeRuntime();

  installHoverTooltips({
    selector: '.mc-agent-card [data-tooltip], .mc-agent-card button[title]',
  });
  initArchiveEvents();
  initModalRuntime();

  window.addEventListener('resize', () => {
    fitActiveTerminal();
  });
}
