import {
  type DashboardOpenOptions,
  type OfficeCharacter,
  SHARED_AVATAR_FILES,
  getDashboardAPI,
  state,
} from '../shared';
import { getOfficeCanvasHost, OFFICE, officeCharacters, officeRenderer } from '../../office/index';
import { getOfficePopoverHost, hideOfficePopover } from './popover';

type OpenTerminalForAgent = (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void;

type OfficeInteractionRuntimeOptions = {
  openTerminalForAgent: OpenTerminalForAgent;
};

type BoundOfficeInteractionRuntime = {
  canvas: HTMLCanvasElement;
  teardown: () => void;
};

let runtimeOptions: OfficeInteractionRuntimeOptions | null = null;
let boundRuntime: BoundOfficeInteractionRuntime | null = null;

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

function setCharacterPosition(character: OfficeCharacter, worldX: number, worldY: number): void {
  const mutable = character as OfficeCharacter & {
    x: number; y: number; path?: unknown[]; pathIndex?: number; manualPinned?: boolean;
    facingDir?: string; currentAnim?: string;
  };
  mutable.x = worldX;
  mutable.y = worldY;
  if (Array.isArray(mutable.path)) mutable.path = [];
  mutable.pathIndex = 0;
  mutable.manualPinned = true;
  mutable.facingDir = 'down';
  mutable.currentAnim = 'walk_down';
}

function bindOfficeInteractionRuntime(
  canvas: HTMLCanvasElement,
  options: OfficeInteractionRuntimeOptions,
): BoundOfficeInteractionRuntime {
  type DragState = {
    character: OfficeCharacter;
    startClientX: number;
    startClientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    moved: boolean;
  };
  let dragState: DragState | null = null;
  let clickSwallow: ((event: MouseEvent) => void) | null = null;
  const DRAG_THRESHOLD = 4;

  const onMouseDown = (event: MouseEvent) => {
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
  };

  const onMouseMove = (event: MouseEvent) => {
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
  };

  const onMouseUp = (event: MouseEvent) => {
    if (!dragState || event.button !== 0) return;
    const finishedDrag = dragState;
    dragState = null;
    canvas.style.cursor = '';

    if (!finishedDrag.moved) return;
    (officeCharacters as unknown as {
      dropCharacterAt?: (id: string, x: number, y: number) => void;
    }).dropCharacterAt?.(
      finishedDrag.character.id,
      finishedDrag.character.x,
      finishedDrag.character.y,
    );
    clickSwallow = (swallowedEvent: MouseEvent) => {
      swallowedEvent.stopImmediatePropagation();
      canvas.removeEventListener('click', clickSwallow as EventListener, true);
      clickSwallow = null;
    };
    canvas.addEventListener('click', clickSwallow, true);
  };

  const onCanvasClick = (event: MouseEvent) => {
    const character = hitTestOfficeCharacter(canvas, event);
    if (!character) {
      hideOfficePopover();
      return;
    }

    const agent = state.agents.get(character.id);
    const agentRegistryId = agent?.registryId || character.id;
    const agentName = agent?.nickname || agent?.name || character.role || 'Agent';
    const avatarIndex = agent?.avatarIndex != null ? agent.avatarIndex : 0;
    const avatarFile = SHARED_AVATAR_FILES[avatarIndex] || SHARED_AVATAR_FILES[0] || 'Origin/avatar_0.webp';

    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.openTaskChatWindow) return;
    void dashboardAPI.openTaskChatWindow({ agentRegistryId, agentName, avatarFile });
  };

  const onDocumentClick = (event: MouseEvent) => {
    const popoverEl = getOfficePopoverHost();
    const target = event.target as Node | null;
    if (target && popoverEl?.contains(target)) return;
    if (target === canvas) return;
    if (target && typeof canvas.contains === 'function' && canvas.contains(target)) return;
    hideOfficePopover();
  };

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hideOfficePopover();
  };

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onCanvasClick);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);

  return {
    canvas,
    teardown: () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('click', onCanvasClick);
      if (clickSwallow) canvas.removeEventListener('click', clickSwallow, true);
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeydown);
      canvas.style.cursor = '';
      dragState = null;
      clickSwallow = null;
    },
  };
}

function teardownBoundOfficeInteractionRuntime(): void {
  boundRuntime?.teardown();
  boundRuntime = null;
}

export function setupOfficeInteractionRuntime(options: OfficeInteractionRuntimeOptions): void {
  runtimeOptions = options;
  teardownBoundOfficeInteractionRuntime();
  updateOfficeInteractionRuntime();
}

export function setupOfficeClickHandler(openTerminalForAgent: OpenTerminalForAgent): void {
  setupOfficeInteractionRuntime({ openTerminalForAgent });
}

export function updateOfficeInteractionRuntime(): void {
  const canvas = getOfficeCanvasHost();
  if (boundRuntime?.canvas === canvas) return;
  teardownBoundOfficeInteractionRuntime();
  if (!canvas || !runtimeOptions) return;
  boundRuntime = bindOfficeInteractionRuntime(canvas, runtimeOptions);
}

export function teardownOfficeInteractionRuntime(): void {
  runtimeOptions = null;
  teardownBoundOfficeInteractionRuntime();
  hideOfficePopover();
}
