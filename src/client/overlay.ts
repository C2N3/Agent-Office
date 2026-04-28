import type { DashboardAgent } from './dashboard/shared';
import {
  initOffice,
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
  stopOffice,
  resumeOffice,
} from './office/index';
import { AVATAR_FILES, loadAvatarFiles, loadSpriteFrames } from './office/officeConfig';
import { loadAllOfficeSkins } from './office/officeSprite';
import { createCharacterRenderer } from './overlay/characters';

// ─── Types ───
interface OverlayAgent {
  id: string;
  name: string;
  status: string;
  avatarIndex: number;
  avatarFile: string;
  currentAnim: string;
  animFrame: number;
  animTimer: number;
  bubble: string | null;
}

type OverlayMode = 'office' | 'characters';

// ─── State ───
let mode: OverlayMode = 'characters';
let sseDelay = 1000;
let sseSource: EventSource | null = null;
const agents = new Map<string, OverlayAgent>();
let officeCanvas: HTMLCanvasElement | null = null;
let officeReady = false;
let spritesReady = false;

const overlayBridge = window as Window & {
  overlayAPI?: {
    close?: () => void;
    backToDashboard?: () => void;
    resize?: (w: number, h: number) => void;
  };
};

const characterRenderer = createCharacterRenderer({
  agents,
  overlayBridge,
  getMode: () => mode,
});

// ─── SSE Connection ───
function connectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }

  const eventSource = new EventSource('/api/events');
  sseSource = eventSource;

  eventSource.onerror = () => {
    eventSource.close();
    sseSource = null;
    setTimeout(connectSSE, sseDelay);
    sseDelay = Math.min(sseDelay * 2, 30000);
  };

  eventSource.addEventListener('connected', () => {
    sseDelay = 1000;
    fetch('/api/agents')
      .then((r) => r.json() as Promise<DashboardAgent[]>)
      .then((list) => list.forEach(handleAgent));
  });
  eventSource.addEventListener('agent.created', (e) => {
    const d = JSON.parse(e.data).data;
    handleAgent(d);
    if (mode === 'office') officeOnAgentCreated(d);
  });
  eventSource.addEventListener('agent.updated', (e) => {
    const d = JSON.parse(e.data).data;
    handleAgent(d);
    if (mode === 'office') officeOnAgentUpdated(d);
  });
  eventSource.addEventListener('agent.removed', (e) => {
    const d = JSON.parse(e.data).data;
    agents.delete(d.id);
    if (mode === 'office') officeOnAgentRemoved(d);
  });
}

function mapStatus(agent: DashboardAgent): string {
  const s = (agent.status || 'idle').toLowerCase();
  if (s === 'working' || s === 'thinking' || s === 'error' || s === 'help' || s === 'done' || s === 'idle' || s === 'offline') return s;
  return 'idle';
}

function handleAgent(agent: DashboardAgent) {
  const status = mapStatus(agent);
  const avatarIdx = agent.avatarIndex ?? 0;
  const existing = agents.get(agent.id);

  if (existing) {
    existing.status = status;
    existing.name = agent.name || existing.name;
    existing.bubble = agent.lastMessage || null;
    if (agent.avatarIndex != null && agent.avatarIndex !== existing.avatarIndex) {
      existing.avatarIndex = agent.avatarIndex;
      existing.avatarFile = AVATAR_FILES[agent.avatarIndex] || AVATAR_FILES[0] || '';
    }
    return;
  }

  agents.set(agent.id, {
    id: agent.id,
    name: agent.name || 'Agent',
    status,
    avatarIndex: avatarIdx,
    avatarFile: AVATAR_FILES[avatarIdx] || AVATAR_FILES[0] || '',
    currentAnim: 'sit_work_down',
    animFrame: 0,
    animTimer: 0,
    bubble: agent.lastMessage || null,
  });
}

function startCharMode() {
  if (officeCanvas) officeCanvas.style.display = 'none';
  stopOffice();
  characterRenderer.start();
}

function stopCharMode() {
  characterRenderer.stop();
}

async function startOfficeMode() {
  stopCharMode();
  if (officeCanvas) officeCanvas.style.display = 'block';
  overlayBridge.overlayAPI?.resize?.(480, 450); // restore office size
  if (!officeReady) {
    await initOffice();
    officeReady = true;
    // Re-add agents to office
    const res = await fetch('/api/agents');
    const list = await res.json() as DashboardAgent[];
    list.forEach((a) => officeOnAgentCreated(a));
  } else {
    resumeOffice();
  }
}

function toggleMode() {
  if (mode === 'office') {
    mode = 'characters';
    stopOffice();
    startCharMode();
  } else {
    mode = 'office';
    startOfficeMode();
  }
  const btn = document.getElementById('btnMode');
  if (btn) btn.classList.toggle('active', mode === 'characters');
}

// ─── Resize handle ───
function setupResize() {
  const handle = document.getElementById('resizeHandle');
  if (!handle) return;

  let startX = 0, startY = 0, startW = 0, startH = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startX = e.screenX;
    startY = e.screenY;
    startW = window.outerWidth;
    startH = window.outerHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.max(240, startW + (ev.screenX - startX));
      const newH = Math.max(200, startH + (ev.screenY - startY));
      overlayBridge.overlayAPI?.resize?.(newW, newH);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Boot ───
async function boot() {
  console.log('[Overlay] boot start');
  officeCanvas = document.getElementById('office-canvas') as HTMLCanvasElement;
  characterRenderer.setCanvas(document.getElementById('char-canvas') as HTMLCanvasElement);

  // Load sprite data for characters mode
  await Promise.all([loadAvatarFiles(), loadSpriteFrames()]);
  await loadAllOfficeSkins();
  spritesReady = true;

  connectSSE();
  setupResize();

  // Start in characters mode by default
  const btn = document.getElementById('btnMode');
  if (btn) btn.classList.add('active');
  startCharMode();
}

document.getElementById('btnClose')?.addEventListener('click', () => {
  overlayBridge.overlayAPI?.close?.() ?? window.close();
});
document.getElementById('btnDashboard')?.addEventListener('click', () => {
  overlayBridge.overlayAPI?.backToDashboard?.();
});
document.getElementById('btnMode')?.addEventListener('click', toggleMode);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
