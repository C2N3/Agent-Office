import {
  type OfficeCharacter,
  type DashboardOpenOptions,
  escapeText,
  formatNum,
  getDashboardAPI,
  state,
} from './shared.js';
import { OFFICE, officeCharacters, officeRenderer } from '../office/index.js';

const popoverEl = document.getElementById('officePopover') as HTMLDivElement | null;

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
  if (!popoverEl) return;
  const agent = state.agents.get(character.id);
  const name = character.role || (agent && agent.name) || 'Agent';
  const status = (agent && agent.status) || character.agentState || 'idle';
  const statusClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(status) ? status : 'waiting';
  const project = (agent && agent.metadata && agent.metadata.projectSlug) || character.metadata?.project || '-';
  const tool = (agent && agent.currentTool) || character.metadata?.tool || '-';
  const model = (agent && agent.model) || '-';
  const inputTokens = (agent && agent.tokenUsage?.inputTokens) || 0;
  const outputTokens = (agent && agent.tokenUsage?.outputTokens) || 0;
  const cost = (agent && agent.tokenUsage?.estimatedCost) || 0;
  const contextPercent = agent && agent.tokenUsage?.contextPercent;
  const contextText = contextPercent != null ? `~${contextPercent}%` : '-';
  const workspaceMeta = agent?.metadata?.workspace || null;
  const branch = escapeText(workspaceMeta?.branch || '-');
  const repository = escapeText(workspaceMeta?.repositoryName || '-');

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
    <div class="pop-row"><span>Tokens</span><span class="pop-val">${formatNum(inputTokens + outputTokens)}</span></div>
    <div class="pop-row"><span>Cost</span><span class="pop-val">$${cost.toFixed(4)}</span></div>
    <div class="pop-row"><span>Context</span><span class="pop-val">${contextText}</span></div>
    <button class="pop-terminal-btn" data-action="rename">Rename</button>
    <button class="pop-terminal-btn" data-action="open-terminal">Open Terminal</button>
  `;
  popoverEl.style.display = 'block';

  popoverEl.querySelector('[data-action="rename"]')?.addEventListener('click', () => {
    promptRenameAgent(character.id);
  });
  popoverEl.querySelector('[data-action="open-terminal"]')?.addEventListener('click', () => {
    openTerminalForAgent(character.id);
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
  if (!popoverEl) return;
  popoverEl.style.display = 'none';
}

export function setupOfficeClickHandler(openTerminalForAgent: (agentId: string, openOptions?: DashboardOpenOptions) => Promise<void> | void) {
  const canvasEl = document.getElementById('office-canvas');
  if (!(canvasEl instanceof HTMLCanvasElement)) return;
  const canvas = canvasEl;

  canvas.addEventListener('click', (event) => {
    const character = hitTestOfficeCharacter(canvas, event);
    if (character) {
      showOfficePopover(canvas, character, openTerminalForAgent);
    } else {
      hideOfficePopover();
    }
  });

  document.addEventListener('click', (event) => {
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
