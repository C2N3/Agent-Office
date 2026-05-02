/**
 * Office Init — Entry point: agent sync, render loop start
 * SSE events are received from dashboard's connectSSE() — no separate connection needed.
 * Floor-aware: only agents on the current floor are rendered.
 */

/* eslint-disable no-unused-vars */

import { loadAvatarFiles, loadOfficeLayout, loadSpriteFrames } from './officeConfig';
import { editorState } from './editor/editorState';
import { officeCharacters } from './character/index';
import { officeRenderer } from './officeRenderer';
import { floorManager } from './floorManager';
import { getOfficeCanvasHost } from './host';

let officeInitialized = false;

function isRegisteredOnlyOfficeFilterEnabled() {
  const officeWindow = window as Window & {
    dashboardIsRegisteredOnlyFilterEnabled?: () => boolean;
  };
  if (typeof officeWindow.dashboardIsRegisteredOnlyFilterEnabled === 'function') {
    return !!officeWindow.dashboardIsRegisteredOnlyFilterEnabled();
  }
  try {
    return localStorage.getItem('mc-filter-registered-only') !== 'false';
  } catch (e) {
    return true;
  }
}

function shouldDisplayOfficeAgent(agent) {
  return !isRegisteredOnlyOfficeFilterEnabled() || !!(agent && agent.isRegistered);
}

export async function initOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
    return;
  }

  // Load shared config before anything else
  await Promise.all([loadAvatarFiles(), loadSpriteFrames(), loadOfficeLayout()]);

  // Initialize floor manager
  floorManager.init();

  const canvas = getOfficeCanvasHost();
  if (!canvas) return;

  // Show loading indicator
  const container = canvas.parentElement as HTMLElement;
  let loadingEl = container.querySelector('.office-loading') as HTMLElement | null;
  if (!loadingEl) {
    loadingEl = canvas.ownerDocument.createElement('div');
    loadingEl.className = 'office-loading';
    loadingEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);color:#fff;font-size:14px;z-index:10;';
    loadingEl.textContent = 'Loading Office...';
    container.style.position = 'relative';
    container.appendChild(loadingEl);
  }

  try {
    // Init renderer with current floor's room only
    const currentFloor = floorManager.getCurrentFloor();
    const roomFilter = currentFloor ? [currentFloor.roomId] : undefined;
    const tilemapId = currentFloor ? (currentFloor.tilemapId || null) : null;
    await officeRenderer.initWithFloor(canvas, roomFilter, tilemapId);
  } catch (e) {
    console.error('[Office] Init failed:', e);
    if (loadingEl) loadingEl.textContent = 'Failed to load office view';
    return;
  }

  // Expose for cross-module access (SSE handlers, report modal)
  (globalThis as any).officeCharacters = officeCharacters;

  // Load existing agents — assign to floors and only show current floor
  try {
    const res = await fetch('/api/agents');
    const agents = await res.json();
    const currentFloor = floorManager.getCurrentFloor();
    agents.forEach(function (a: any) {
      if (!shouldDisplayOfficeAgent(a)) return;
      // Assign agent to a floor if not already assigned
      let agentFloor = floorManager.getAgentFloor(a.id);
      if (!agentFloor && currentFloor) {
        // New agents go to the current floor by default on first load
        // But distribute existing agents across floors that don't have them yet
        const floors = floorManager.getFloors();
        // Use hash-based distribution for initial assignment
        let hash = 0;
        const str = a.id || '';
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0;
        }
        const targetFloor = floors[Math.abs(hash) % floors.length];
        floorManager.assignAgent(a.id, targetFloor.id);
        agentFloor = targetFloor;
      }
      // Only add to canvas if on current floor
      if (agentFloor && currentFloor && agentFloor.id === currentFloor.id) {
        a._floorId = currentFloor.id;
        officeCharacters.addCharacter(a);
      }
    });
  } catch (e) {
    console.error('[Office] Failed to fetch agents:', e);
  }

  // Remove loading indicator
  if (loadingEl) loadingEl.remove();

  // Add Map Editor toggle button (only visible when floor has a tilemap)
  _createEditorToggleButton(container);
  _updateEditorButtonVisibility();

  officeInitialized = true;
}

export async function setupOfficeRuntime() {
  await initOffice();
}

/** Called from dashboard SSE agent.created handler */
export function officeOnAgentCreated(data: any) {
  if (!officeInitialized) return;
  if (!shouldDisplayOfficeAgent(data)) return;

  // Assign to current floor if not already assigned
  const currentFloor = floorManager.getCurrentFloor();
  let agentFloor = floorManager.getAgentFloor(data.id);
  if (!agentFloor && currentFloor) {
    floorManager.assignAgent(data.id, currentFloor.id);
    agentFloor = currentFloor;
  }

  // Only render if on current floor
  if (agentFloor && currentFloor && agentFloor.id === currentFloor.id) {
    data._floorId = currentFloor.id;
    officeCharacters.addCharacter(data);
  }
}

/** Called from dashboard SSE agent.updated handler */
export function officeOnAgentUpdated(data: any) {
  if (!officeInitialized) return;
  if (!shouldDisplayOfficeAgent(data)) {
    officeCharacters.removeCharacter(data.id);
    return;
  }

  // Only update on canvas if on current floor
  const currentFloor = floorManager.getCurrentFloor();
  const agentFloor = floorManager.getAgentFloor(data.id);
  if (agentFloor && currentFloor && agentFloor.id === currentFloor.id) {
    officeCharacters.updateCharacter(data);
  }
}

/** Called from dashboard SSE agent.removed handler */
export function officeOnAgentRemoved(data: any) {
  if (officeInitialized) {
    officeCharacters.removeCharacter(data.id);
    floorManager.unassignAgent(data.id);
  }
}

/**
 * Switch the office view to a different floor.
 * Clears current characters, rebuilds for the new floor's room, re-adds agents.
 */
export async function switchOfficeFloor(floorId: string) {
  if (!officeInitialized) return;

  const floor = floorManager.getFloors().find(f => f.id === floorId);
  if (!floor) return;

  // Clear all characters from canvas
  const allChars = officeCharacters.getCharacterArray();
  for (const c of allChars) {
    officeCharacters.removeCharacter(c.id);
  }

  // Rebuild renderer for the new floor's room
  await officeRenderer.switchToFloor([floor.roomId], floor.tilemapId || null);

  // Update editor button visibility for new floor
  _updateEditorButtonVisibility();

  // Re-add agents that belong to this floor
  try {
    const res = await fetch('/api/agents');
    const agents = await res.json();
    agents.forEach(function (a: any) {
      if (!shouldDisplayOfficeAgent(a)) return;
      const agentFloor = floorManager.getAgentFloor(a.id);
      if (agentFloor && agentFloor.id === floorId) {
        a._floorId = floorId;
        officeCharacters.addCharacter(a);
      }
    });
  } catch (e) {
    console.error('[Office] Failed to re-fetch agents on floor switch:', e);
  }
}

export function stopOffice() {
  officeRenderer.stop();
}

export function resumeOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
  }
}

export function updateOfficeRuntime() {
  resumeOffice();
}

export function teardownOfficeRuntime() {
  stopOffice();
}

/** Toggle the map editor overlay. */
export function toggleOfficeEditor() {
  if (!officeInitialized) return;
  const floor = floorManager.getCurrentFloor();
  const tilemapId = floor && floor.tilemapId ? floor.tilemapId : undefined;
  officeRenderer.toggleEditor(tilemapId);
}

// Expose globally for UI access
(globalThis as any).toggleOfficeEditor = toggleOfficeEditor;

let _editorToggleBtn: HTMLButtonElement | null = null;

function _createEditorToggleButton(container: HTMLElement) {
  if (_editorToggleBtn) return;

  const btn = document.createElement('button');
  btn.className = 'office-editor-toggle-btn';
  btn.textContent = 'Map Editor';
  btn.style.cssText = [
    'position:absolute',
    'bottom:12px',
    'right:12px',
    'z-index:25',
    'padding:6px 14px',
    'border:1px solid rgba(255,255,255,0.2)',
    'border-radius:6px',
    'background:rgba(30,30,40,0.85)',
    'color:#e2e8f0',
    'font-size:12px',
    'cursor:pointer',
    'user-select:none',
    'backdrop-filter:blur(4px)',
    'transition:background 0.15s,border-color 0.15s',
  ].join(';') + ';';

  btn.addEventListener('mouseenter', function () {
    btn.style.background = 'rgba(59,130,246,0.3)';
    btn.style.borderColor = '#3b82f6';
  });
  btn.addEventListener('mouseleave', function () {
    btn.style.background = editorState.active ? 'rgba(59,130,246,0.25)' : 'rgba(30,30,40,0.85)';
    btn.style.borderColor = editorState.active ? '#3b82f6' : 'rgba(255,255,255,0.2)';
  });
  btn.addEventListener('click', function () {
    toggleOfficeEditor();
    const active = editorState.active;
    btn.textContent = active ? 'Close Editor' : 'Map Editor';
    btn.style.background = active ? 'rgba(59,130,246,0.25)' : 'rgba(30,30,40,0.85)';
    btn.style.borderColor = active ? '#3b82f6' : 'rgba(255,255,255,0.2)';
  });

  container.appendChild(btn);
  _editorToggleBtn = btn;
}

function _updateEditorButtonVisibility() {
  if (!_editorToggleBtn) return;
  const floor = floorManager.getCurrentFloor();
  const hasTilemap = floor && floor.tilemapId;
  _editorToggleBtn.style.display = hasTilemap ? '' : 'none';
}
