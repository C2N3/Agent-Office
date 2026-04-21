import {
  type OfficeCharacter,
  type DashboardOpenOptions,
  escapeText,
  formatNum,
  getDashboardAPI,
  state,
} from './shared.js';
import { getOfficeCanvasHost, OFFICE, officeCharacters, officeRenderer } from '../office/index.js';
import { dashboardModalRegistry } from './modals/registry.js';

let officePopoverHost: HTMLDivElement | null = null;

export function registerOfficePopoverHost(element: HTMLDivElement | null): void {
  officePopoverHost = element;
}

function getPopoverEl(): HTMLDivElement | null {
  return officePopoverHost;
}

function hitTestOfficeCharacter(canvas: HTMLCanvasElement, event: MouseEvent): OfficeCharacter | null {
  if (!officeCharacters) return null;

  let canvasX;
  let canvasY;
  if (officeRenderer?.screenToWorld) {
    const world = officeRenderer.screenToWorld(event.clientX, event.clientY);
    canvasX = world.x;
    canvasY = world.y;
  } else {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    canvasX = (event.clientX - rect.left) * scaleX;
    canvasY = (event.clientY - rect.top) * scaleY;
  }

  const characters = officeCharacters.getCharacterArray();
  const sorted = [...characters].sort((left, right) => right.y - left.y);
  const frameWidth = OFFICE.FRAME_W || 106;
  const frameHeight = OFFICE.FRAME_H || 140;

  for (const character of sorted) {
    const left = character.x - frameWidth / 2;
    const top = character.y - frameHeight;
    if (canvasX >= left && canvasX <= left + frameWidth && canvasY >= top && canvasY <= top + frameHeight) {
      return character;
    }
  }
  return null;
}

async function promptRenameAgent(agentId: string) {
  const agent = state.agents.get(agentId);
  const currentName = (agent && (agent.nickname || agent.name)) || 'Agent';
  const nextName = window.prompt('Rename agent', currentName);
  const dashboardAPI = getDashboardAPI();
  if (nextName === null || !dashboardAPI) return;

  const trimmed = nextName.trim();
  if (trimmed) {
    await dashboardAPI.setNickname?.(agentId, trimmed);
  } else {
    await dashboardAPI.removeNickname?.(agentId);
  }
  hideOfficePopover();
}

function showOfficePopover(
  canvas: HTMLCanvasElement,
  character: OfficeCharacter,
  openTerminalForAgent: (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void
) {
  const popoverEl = getPopoverEl();
  if (!popoverEl) return;
  const agent = state.agents.get(character.id);
  const name = character.role || (agent && agent.name) || 'Agent';
  const status = (agent && agent.status) || character.agentState || 'idle';
  const statusClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(status) ? status : 'waiting';
  const project = (agent && agent.metadata && agent.metadata.projectSlug) || character.metadata?.project || '-';
  const tool = (agent && agent.currentTool) || character.metadata?.tool || '-';
  const model = (agent && agent.model) || '-';
  const workspaceMeta = agent?.metadata?.workspace || null;
  const branch = escapeText(workspaceMeta?.branch || '-');
  const repository = escapeText(workspaceMeta?.repositoryName || '-');

  const isPinned = !!(character as OfficeCharacter & { manualPinned?: boolean }).manualPinned;
  const unpinButton = isPinned
    ? '<button class="pop-terminal-btn" data-action="unpin">Unpin Position</button>'
    : '';

  popoverEl.innerHTML = `
    <div class="pop-header">
      <span class="pop-name">${name}</span>
      <div class="mc-agent-status ${statusClass}" style="font-size:0.6rem">${status.toUpperCase()}</div>
    </div>
    <div class="pop-row"><span>Project</span><span class="pop-val">${project}</span></div>
    <div class="pop-row"><span>Repo</span><span class="pop-val">${repository}</span></div>
    <div class="pop-row"><span>Branch</span><span class="pop-val">${branch}</span></div>
    <div class="pop-row"><span>Tool</span><span class="pop-val">${tool}</span></div>
    <div class="pop-row"><span>Model</span><span class="pop-val">${model}</span></div>
    <button class="pop-terminal-btn" data-action="rename">Rename</button>
    <button class="pop-terminal-btn" data-action="open-terminal">Open Terminal</button>
    ${unpinButton}
  `;
  popoverEl.style.display = 'block';

  popoverEl.querySelector('[data-action="rename"]')?.addEventListener('click', () => {
    promptRenameAgent(character.id);
  });
  popoverEl.querySelector('[data-action="open-terminal"]')?.addEventListener('click', () => {
    openTerminalForAgent(character.id);
  });
  popoverEl.querySelector('[data-action="unpin"]')?.addEventListener('click', () => {
    (officeCharacters as unknown as { unpinCharacter?: (id: string) => void })
      .unpinCharacter?.(character.id);
    hideOfficePopover();
  });

  const rect = canvas.getBoundingClientRect();
  const frameWidth = OFFICE.FRAME_W || 106;
  const frameHeight = OFFICE.FRAME_H || 140;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  const screenX = rect.left + (character.x - frameWidth / 2) * scaleX;
  const screenY = rect.top + (character.y - frameHeight) * scaleY;
  const popoverWidth = popoverEl.offsetWidth;
  const popoverHeight = popoverEl.offsetHeight;

  let left = screenX + (frameWidth * scaleX) / 2 - popoverWidth / 2;
  let top = screenY - popoverHeight - 8;
  if (top < 4) top = screenY + frameHeight * scaleY + 8;
  left = Math.max(4, Math.min(window.innerWidth - popoverWidth - 4, left));
  top = Math.max(4, Math.min(window.innerHeight - popoverHeight - 4, top));

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
}

function hideOfficePopover() {
  const popoverEl = getPopoverEl();
  if (!popoverEl) return;
  popoverEl.style.display = 'none';
}

export function setupOfficeClickHandler(openTerminalForAgent: (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void) {
  const canvasEl = getOfficeCanvasHost();
  if (!(canvasEl instanceof HTMLCanvasElement)) return;
  const canvas = canvasEl;

  // ── Drag-and-drop: move a character by left-click-dragging it.
  type DragState = {
    character: OfficeCharacter;
    startClientX: number;
    startClientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    moved: boolean;
  };
  let dragState: DragState | null = null;
  const DRAG_THRESHOLD = 4;

  const setCharacterPosition = (character: OfficeCharacter, worldX: number, worldY: number) => {
    const mutable = character as OfficeCharacter & {
      x: number; y: number; path?: unknown[]; pathIndex?: number; manualPinned?: boolean;
      facingDir?: string; currentAnim?: string;
    };
    const dx = worldX - mutable.x;
    const dy = worldY - mutable.y;
    mutable.x = worldX;
    mutable.y = worldY;
    // Stop any pathfinding movement in-flight so it doesn't fight the drag.
    // Also flag as manually pinned so _updateTarget doesn't recompute a path
    // back to the desk every frame while the user is dragging.
    if (Array.isArray(mutable.path)) mutable.path = [];
    mutable.pathIndex = 0;
    mutable.manualPinned = true;
    // Always show front-facing walk animation while being dragged so
    // the character looks natural and recognisable during the drag.
    mutable.facingDir = 'down';
    mutable.currentAnim = 'walk_down';
  };

  canvas.addEventListener('mousedown', (event) => {
    // Only left-click starts a character drag.
    if (event.button !== 0) return;
    const character = hitTestOfficeCharacter(canvas, event);
    if (!character) return;

    event.preventDefault();

    const world = officeRenderer?.screenToWorld?.(event.clientX, event.clientY);
    const startWorldX = world?.x ?? character.x;
    const startWorldY = world?.y ?? character.y;

    dragState = {
      character,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabOffsetX: character.x - startWorldX,
      grabOffsetY: character.y - startWorldY,
      moved: false,
    };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragState) return;
    const dx = event.clientX - dragState.startClientX;
    const dy = event.clientY - dragState.startClientY;
    if (!dragState.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;

    dragState.moved = true;
    hideOfficePopover();
    const world = officeRenderer?.screenToWorld?.(event.clientX, event.clientY);
    if (!world) return;
    setCharacterPosition(
      dragState.character,
      world.x + dragState.grabOffsetX,
      world.y + dragState.grabOffsetY,
    );
  });

  window.addEventListener('mouseup', (event) => {
    if (!dragState) return;
    if (event.button !== 0) return;
    const finishedDrag = dragState;
    dragState = null;
    canvas.style.cursor = '';

    if (finishedDrag.moved) {
      // Hand off to dropCharacterAt: it unpins, releases the prior desk, and
      // routes the character to the nearest work/rest spot for its current
      // state. Called directly on the object so `this` (→ this.characters)
      // is preserved.
      (officeCharacters as unknown as {
        dropCharacterAt?: (id: string, x: number, y: number) => void;
      }).dropCharacterAt?.(
        finishedDrag.character.id,
        finishedDrag.character.x,
        finishedDrag.character.y,
      );
      // Swallow the upcoming click event so it doesn't re-open the popover.
      const swallow = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        canvas.removeEventListener('click', swallow, true);
      };
      canvas.addEventListener('click', swallow, true);
    }
  });

  canvas.addEventListener('click', (event) => {
    const character = hitTestOfficeCharacter(canvas, event);
    if (character) {
      // If the character has a report bubble, open the report modal instead of popover
      if (character.bubble && character.bubble.isReport) {
        if (character.bubble.taskId) {
          const openReport = dashboardModalRegistry.openTaskReportModal;
          if (openReport) { openReport(character.bubble.taskId); return; }
        }
        if (character.bubble.teamId) {
          const openTeamReport = dashboardModalRegistry.openTeamReportModal;
          if (openTeamReport) { openTeamReport(character.bubble.teamId); return; }
        }
      }
      showOfficePopover(canvas, character, openTerminalForAgent);
    } else {
      hideOfficePopover();
    }
  });

  document.addEventListener('click', (event) => {
    const popoverEl = getPopoverEl();
    if (!popoverEl) return;
    const target = event.target as Node | null;
    const targetElement = event.target as HTMLElement | null;
    if (target && !popoverEl.contains(target) && targetElement?.id !== 'office-canvas') {
      hideOfficePopover();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideOfficePopover();
  });
}
