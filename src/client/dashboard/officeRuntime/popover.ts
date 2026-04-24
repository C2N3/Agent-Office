import {
  type OfficeCharacter,
  escapeText,
  getDashboardAPI,
  state,
} from '../shared.js';
import { OFFICE, officeCharacters } from '../../office/index.js';

let officePopoverHost: HTMLDivElement | null = null;
let popoverActionListener: ((event: MouseEvent) => void) | null = null;

export function registerOfficePopoverHost(element: HTMLDivElement | null): void {
  if (officePopoverHost && officePopoverHost !== element) {
    clearOfficePopoverActions();
    officePopoverHost.innerHTML = '';
  }
  officePopoverHost = element;
  if (!element) clearOfficePopoverActions();
}

export function getOfficePopoverHost(): HTMLDivElement | null {
  return officePopoverHost;
}

function clearOfficePopoverActions(): void {
  if (officePopoverHost && popoverActionListener) {
    officePopoverHost.removeEventListener('click', popoverActionListener);
  }
  popoverActionListener = null;
}

async function promptRenameAgent(agentId: string): Promise<void> {
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

function attachOfficePopoverActions(character: OfficeCharacter): void {
  const popoverEl = getOfficePopoverHost();
  if (!popoverEl) return;
  clearOfficePopoverActions();
  popoverActionListener = (event) => {
    const actionButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-action]');
    const action = actionButton?.dataset.action;
    if (!action) return;
    if (action === 'rename') {
      void promptRenameAgent(character.id);
      return;
    }
    if (action === 'unpin') {
      (officeCharacters as unknown as { unpinCharacter?: (id: string) => void })
        .unpinCharacter?.(character.id);
      hideOfficePopover();
    }
  };
  popoverEl.addEventListener('click', popoverActionListener);
}

function positionOfficePopover(canvas: HTMLCanvasElement, character: OfficeCharacter, popoverEl: HTMLDivElement): void {
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

export function showOfficePopover(
  canvas: HTMLCanvasElement,
  character: OfficeCharacter,
): void {
  const popoverEl = getOfficePopoverHost();
  if (!popoverEl) return;
  const agent = state.agents.get(character.id);
  const name = escapeText(character.role || (agent && agent.name) || 'Agent');
  const status = (agent && agent.status) || character.agentState || 'idle';
  const statusClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(status) ? status : 'waiting';
  const project = escapeText((agent && agent.metadata && agent.metadata.projectSlug) || character.metadata?.project || '-');
  const tool = escapeText((agent && agent.currentTool) || character.metadata?.tool || '-');
  const model = escapeText((agent && agent.model) || '-');
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
      <div class="mc-agent-status ${statusClass}" style="font-size:0.6rem">${escapeText(status.toUpperCase())}</div>
    </div>
    <div class="pop-row"><span>Project</span><span class="pop-val">${project}</span></div>
    <div class="pop-row"><span>Repo</span><span class="pop-val">${repository}</span></div>
    <div class="pop-row"><span>Branch</span><span class="pop-val">${branch}</span></div>
    <div class="pop-row"><span>Tool</span><span class="pop-val">${tool}</span></div>
    <div class="pop-row"><span>Model</span><span class="pop-val">${model}</span></div>
    <button class="pop-terminal-btn" data-action="rename">Rename</button>
    ${unpinButton}
  `;
  popoverEl.style.display = 'block';
  attachOfficePopoverActions(character);
  positionOfficePopover(canvas, character, popoverEl);
}

export function hideOfficePopover(): void {
  const popoverEl = getOfficePopoverHost();
  if (!popoverEl) return;
  popoverEl.style.display = 'none';
}
