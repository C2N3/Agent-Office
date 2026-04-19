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
  initViewControls,
  renderArchiveView,
  renderHeatmapView,
  renderUsageView,
} from './activityViews.js';
import { initDevModeViews } from './devMode.js';
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

type DashboardUiError = Error | { message?: string } | DisplayValue;

/* ─── Floor Tabs ─── */

function renderFloorTabs() {
  const tabsList = document.getElementById('floorTabsList');
  if (!tabsList) return;

  const floors = floorManager.getFloors();
  const currentId = floorManager.getCurrentFloorId();
  const currentFloor = floorManager.getCurrentFloor();

  tabsList.innerHTML = '';
  for (const floor of floors) {
    const btn = document.createElement('button');
    btn.className = 'floor-tab' + (floor.id === currentId ? ' active' : '');
    btn.dataset.floorId = floor.id;
    btn.innerHTML = '<span class="floor-tab-name">' + escapeHtml(floor.name) + '</span>';
    tabsList.appendChild(btn);
  }

  // Update agent list header to show current floor name
  const agentListTitle = document.querySelector('#agentListPanel .panel-header-title span:first-child');
  if (agentListTitle && currentFloor) {
    agentListTitle.textContent = 'Agent List — ' + currentFloor.name;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showCreateFloorDialog(onCreated?: () => void) {
  const existing = document.getElementById('floorCreateOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'floor-create-overlay';
  overlay.id = 'floorCreateOverlay';
  overlay.innerHTML =
    '<div class="floor-create-dialog">' +
      '<h3>New Floor</h3>' +
      '<input type="text" id="floorNameInput" placeholder="e.g. Engineering" autofocus maxlength="30">' +
      '<div class="floor-create-actions">' +
        '<button class="floor-cancel-btn" id="floorCancelBtn">Cancel</button>' +
        '<button class="floor-confirm-btn" id="floorConfirmBtn">Create</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const input = document.getElementById('floorNameInput') as HTMLInputElement;
  const cancelBtn = document.getElementById('floorCancelBtn');
  const confirmBtn = document.getElementById('floorConfirmBtn');

  function close() { overlay.remove(); }

  function create() {
    const name = (input?.value || '').trim();
    if (!name) { input?.focus(); return; }
    const newFloor = floorManager.addFloor(name);
    renderFloorTabs();
    close();
    if (onCreated) onCreated();
    handleFloorSwitch(newFloor.id);
  }

  cancelBtn?.addEventListener('click', close);
  confirmBtn?.addEventListener('click', create);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') close(); });
  setTimeout(() => input?.focus(), 50);
}

/* ─── Floor Manager Modal ─── */

function showFloorManagerModal() {
  const existing = document.getElementById('floorManagerOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'floor-create-overlay';
  overlay.id = 'floorManagerOverlay';

  function buildList() {
    const floors = floorManager.getFloors();
    const currentId = floorManager.getCurrentFloorId();
    let html = '';
    for (const floor of floors) {
      const isCurrent = floor.id === currentId;
      html +=
        '<div class="floor-mgr-row" data-floor-id="' + floor.id + '">' +
          '<input type="text" class="floor-mgr-name" value="' + escapeHtml(floor.name) + '" maxlength="30" data-rename-floor="' + floor.id + '">' +
          '<span class="floor-mgr-count">' + floor.agentIds.length + ' agents</span>' +
          (isCurrent ? '<span class="floor-mgr-current">current</span>' : '') +
          (floors.length > 1
            ? '<button class="floor-mgr-delete" data-delete-floor="' + floor.id + '" title="Delete">&times;</button>'
            : '') +
        '</div>';
    }
    return html;
  }

  function render() {
    const body = overlay.querySelector('.floor-mgr-body');
    if (body) body.innerHTML = buildList();
  }

  overlay.innerHTML =
    '<div class="floor-create-dialog floor-mgr-dialog">' +
      '<div class="floor-mgr-header">' +
        '<h3>Floor Manager</h3>' +
        '<button class="floor-mgr-close" id="floorMgrCloseBtn">&times;</button>' +
      '</div>' +
      '<div class="floor-mgr-body">' + buildList() + '</div>' +
      '<div class="floor-create-actions">' +
        '<button class="floor-confirm-btn" id="floorMgrAddBtn">+ Add Floor</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('floorMgrCloseBtn');
  const addBtn = document.getElementById('floorMgrAddBtn');

  function close() { overlay.remove(); renderFloorTabs(); }

  // Delegation: rename on blur/enter, delete on click
  overlay.addEventListener('input', () => {}); // keep alive
  overlay.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const floorId = target?.dataset?.renameFloor;
    if (floorId) {
      const newName = (target.value || '').trim();
      if (newName) floorManager.renameFloor(floorId, newName);
      else target.value = floorManager.getFloors().find(f => f.id === floorId)?.name || '';
    }
  });

  overlay.addEventListener('keydown', (e) => {
    const target = e.target as HTMLInputElement;
    if (target?.dataset?.renameFloor && (e as KeyboardEvent).key === 'Enter') {
      target.blur();
    }
  });

  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Delete
    const deleteId = target.dataset?.deleteFloor;
    if (deleteId) {
      const floors = floorManager.getFloors();
      if (floors.length <= 1) return;
      const floor = floors.find(f => f.id === deleteId);
      if (!floor) return;
      if (!confirm('Delete "' + floor.name + '"? Agents on this floor will be unassigned.')) return;

      for (const agentId of [...floor.agentIds]) {
        floorManager.unassignAgent(agentId);
      }
      const wasCurrent = floorManager.getCurrentFloorId() === deleteId;
      floorManager.removeFloor(deleteId);
      render();
      if (wasCurrent) {
        const current = floorManager.getCurrentFloor();
        if (current) handleFloorSwitch(current.id);
      }
      return;
    }

    // Overlay background click
    if (target === overlay) { close(); return; }
  });

  closeBtn?.addEventListener('click', close);
  addBtn?.addEventListener('click', () => {
    close();
    showCreateFloorDialog(() => {
      // Re-open manager after creating
      setTimeout(() => showFloorManagerModal(), 100);
    });
  });
}

async function handleFloorSwitch(floorId: string) {
  floorManager.switchFloor(floorId);
  renderFloorTabs();
  await switchOfficeFloor(floorId);
  renderAgentList();
}

function initFloorTabs() {
  renderFloorTabs();

  const tabsList = document.getElementById('floorTabsList');
  const addBtn = document.getElementById('floorAddBtn');
  const manageBtn = document.getElementById('floorManageBtn');

  // Tab click — switch floor
  tabsList?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const tab = target.closest('.floor-tab') as HTMLElement | null;
    if (tab?.dataset.floorId) {
      const floorId = tab.dataset.floorId;
      if (floorId !== floorManager.getCurrentFloorId()) {
        handleFloorSwitch(floorId);
      }
    }
  });

  // Add button
  addBtn?.addEventListener('click', () => {
    showCreateFloorDialog();
  });

  // Manage button — open floor manager modal
  manageBtn?.addEventListener('click', () => {
    showFloorManagerModal();
  });

  // Listen for floor manager events
  floorManager.on('floors-updated', () => {
    renderFloorTabs();
  });
}

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
  else if (target === 'remote') {
    import('./remoteView.js').then((m) => { m.renderRemoteView(); m.startRemoteViewPolling(); });
  } else if (target === 'cloudflare') {
    import('./cloudflareView.js').then((m) => { m.renderCloudflareView(); m.startCloudflareViewPolling(); });
  }
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

async function initApp() {
  const { isDev } = await initDevModeViews();
  if (!isDev && state.currentView === 'cloudflare') {
    state.currentView = 'office';
    localStorage.setItem('mc-view', 'office');
  }

  globalThis.openTerminalForAgent = openTerminalForAgent;

  renderDashboardModals();
  initFilterControls();
  initViewControls();
  initPipControls();
  initOverlayControls();
  initInitialView();

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
