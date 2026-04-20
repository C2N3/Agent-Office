import { createElement } from 'react';
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
  removeAgent,
  renderAgentList,
  updateAgent,
  updateAgentUI,
  updateBulkArchiveButton,
} from './agentViews.js';
import {
  renderArchiveView,
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
import {
  initOffice,
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
  switchOfficeFloor,
} from '../office/index.js';
import { floorManager } from '../office/floorManager.js';
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
import { startCentralAgentSync } from './centralAgents/index.js';
import { FloorTabs } from './react/floors.js';
import { renderInto } from './react/root.js';
import { initOverlayControls, initPipControls } from './app/windowControls.js';
import { notifyDashboardStore } from './state/store.js';

type DashboardUiError = Error | { message?: string } | DisplayValue;
type FloorDialog = 'none' | 'create' | 'manage';

/* ─── Floor Tabs ─── */

let floorDialog: FloorDialog = 'none';
let pendingFloorName = '';

function renderFloorTabs() {
  const floors = floorManager.getFloors();
  const currentId = floorManager.getCurrentFloorId();
  const currentFloor = floorManager.getCurrentFloor();
  renderInto(
    document.getElementById('floorTabs'),
    createElement(FloorTabs, {
      createName: pendingFloorName,
      currentFloorId: currentId,
      dialog: floorDialog,
      floors,
      onCloseDialog: () => {
        floorDialog = 'none';
        pendingFloorName = '';
        renderFloorTabs();
      },
      onCreateFloor: () => {
        const name = pendingFloorName.trim();
        if (!name) return;
        const newFloor = floorManager.addFloor(name);
        floorDialog = 'none';
        pendingFloorName = '';
        renderFloorTabs();
        handleFloorSwitch(newFloor.id);
      },
      onCreateNameChange: (value: string) => {
        pendingFloorName = value;
        renderFloorTabs();
      },
      onDeleteFloor: (floorId: string) => {
        const floor = floorManager.getFloors().find((entry) => entry.id === floorId);
        if (!floor) return;
        if (!confirm(`Delete "${floor.name}"? Agents on this floor will be unassigned.`)) return;
        for (const agentId of [...floor.agentIds]) {
          floorManager.unassignAgent(agentId);
        }
        const wasCurrent = floorManager.getCurrentFloorId() === floorId;
        floorManager.removeFloor(floorId);
        renderFloorTabs();
        if (wasCurrent) {
          const nextFloor = floorManager.getCurrentFloor();
          if (nextFloor) {
            handleFloorSwitch(nextFloor.id);
            return;
          }
        }
        renderAgentList();
      },
      onOpenCreate: () => {
        floorDialog = 'create';
        pendingFloorName = '';
        renderFloorTabs();
      },
      onOpenManage: () => {
        floorDialog = 'manage';
        renderFloorTabs();
      },
      onRenameFloor: (floorId: string, nextName: string) => {
        const trimmed = nextName.trim();
        if (trimmed) {
          floorManager.renameFloor(floorId, trimmed);
        }
        renderFloorTabs();
      },
      onSwitchFloor: (floorId: string) => {
        if (floorId !== floorManager.getCurrentFloorId()) {
          void handleFloorSwitch(floorId);
        }
      },
    }),
  );

  // Update agent list header to show current floor name
  const agentListTitle = document.querySelector('#agentListPanel .panel-header-title span:first-child');
  if (agentListTitle && currentFloor) {
    agentListTitle.textContent = 'Agent List — ' + currentFloor.name;
  }
}

async function handleFloorSwitch(floorId: string) {
  floorManager.switchFloor(floorId);
  floorDialog = 'none';
  pendingFloorName = '';
  renderFloorTabs();
  await switchOfficeFloor(floorId);
  renderAgentList();
}

function initFloorTabs() {
  renderFloorTabs();
  floorManager.on('floor-changed', renderFloorTabs);
  floorManager.on('floors-updated', renderFloorTabs);
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

export async function initDashboardApp() {
  globalThis.openTerminalForAgent = openTerminalForAgent;

  renderDashboardModals();
  initFilterControls();
  initPipControls();
  initOverlayControls();

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
  initTerminals();
  initTerminalProfileMenu();
  refreshTerminalProfiles().catch((error: DashboardUiError) => console.error('[Terminal Profiles]', error));
  initResizableHandles?.();

  // Initialize floor manager early so tabs render before office loads
  floorManager.init();
  initFloorTabs();
  notifyDashboardStore();

  setTimeout(() => {
    initOffice()
      .then(() => renderAgentList())
      .catch((error: DashboardUiError) => console.error('[Office Init]', error));
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
