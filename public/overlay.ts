import type { DashboardAgent } from './dashboard/shared.js';
import {
  initOffice,
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
  stopOffice,
  resumeOffice,
} from './office/index.js';
import { AVATAR_FILES, OFFICE, SPRITE_FRAMES, loadAvatarFiles, loadSpriteFrames } from './office/office-config.js';
import { loadAllOfficeSkins, getOfficeSkinImage } from './office/office-sprite.js';

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
let charCanvas: HTMLCanvasElement | null = null;
let charCtx: CanvasRenderingContext2D | null = null;
let officeCanvas: HTMLCanvasElement | null = null;
let charRafId = 0;
let charLastTime = 0;
let officeReady = false;
let spritesReady = false;

const overlayBridge = window as Window & {
  overlayAPI?: {
    close?: () => void;
    backToDashboard?: () => void;
    resize?: (w: number, h: number) => void;
  };
};

const ACTIVE_STATES = new Set(['working', 'thinking', 'error', 'help']);
const VISIBLE_STATES = new Set(['working', 'thinking', 'error', 'help', 'idle', 'done', 'offline']);

// Character layout constants
const CHAR_W = 64;
const CHAR_H = 85;
const GAP = 12;
const LABEL_H = 32;
const SLOT_H = CHAR_H + LABEL_H;
const PAD = 4; // minimal padding
const CONTROLS_H = 28; // space for hover controls
let lastResizedCount = -1;

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

// ─── Characters-only renderer ───
function getVisibleAgents(): OverlayAgent[] {
  const result: OverlayAgent[] = [];
  agents.forEach((a) => {
    if (VISIBLE_STATES.has(a.status)) result.push(a);
  });
  return result;
}

function charLoop(now: number) {
  if (mode !== 'characters') return;
  charRafId = requestAnimationFrame(charLoop);
  if (!charCtx || !charCanvas) return;

  const dt = Math.min(now - charLastTime, 100);
  charLastTime = now;

  const active = getVisibleAgents();

  // Resize window to fit characters
  const count = Math.max(active.length, 1);
  if (count !== lastResizedCount && mode === 'characters') {
    lastResizedCount = count;
    const needW = count * CHAR_W + (count - 1) * GAP + PAD * 2;
    const needH = SLOT_H + PAD + CONTROLS_H;
    overlayBridge.overlayAPI?.resize?.(Math.round(needW), Math.round(needH));
  }

  const dpr = window.devicePixelRatio || 1;
  const cw = charCanvas.clientWidth;
  const ch = charCanvas.clientHeight;
  charCanvas.width = cw * dpr;
  charCanvas.height = ch * dpr;
  charCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  charCtx.clearRect(0, 0, cw, ch);

  if (active.length === 0) return;

  // Layout: characters in a row, centered
  const totalW = active.length * CHAR_W + (active.length - 1) * GAP;
  const startX = (cw - totalW) / 2;
  const startY = CONTROLS_H;

  for (let i = 0; i < active.length; i++) {
    const agent = active[i];

    // Tick animation
    agent.animTimer += dt;
    const interval = 1000 / 4; // slow animation
    if (agent.animTimer >= interval) {
      agent.animTimer -= interval;
      agent.animFrame++;
    }

    // Pick animation based on status
    const isActive = ACTIVE_STATES.has(agent.status);
    let anim: string;
    if (agent.status === 'error') anim = 'alert_jump';
    else if (agent.status === 'help') anim = 'alert_jump';
    else if (agent.status === 'done') anim = 'dance';
    else if (isActive) anim = 'sit_work_down';
    else anim = 'down_idle';

    const frames = SPRITE_FRAMES[anim];
    if (!frames) continue;
    const frameIdx = frames[agent.animFrame % frames.length];

    const img = getOfficeSkinImage(agent.avatarFile);
    if (!img || !img.complete || img.naturalWidth === 0) continue;

    const sx = (frameIdx % OFFICE.COLS) * OFFICE.SRC_FRAME_W;
    const expectedHeight = OFFICE.SRC_FRAME_H * OFFICE.ROWS;
    const yOffset = Math.max(0, img.naturalHeight - expectedHeight) / 2;
    const sy = Math.floor(frameIdx / OFFICE.COLS) * OFFICE.SRC_FRAME_H + yOffset;

    const cx = startX + i * (CHAR_W + GAP);
    const cy = startY;

    // Semi-transparent for inactive agents
    if (!isActive) charCtx.globalAlpha = 0.35;

    // Draw character sprite
    charCtx.drawImage(
      img,
      sx, sy, OFFICE.SRC_FRAME_W, OFFICE.SRC_FRAME_H,
      cx, cy, CHAR_W, CHAR_H
    );

    // Draw name label
    charCtx.save();
    charCtx.textAlign = 'center';
    charCtx.textBaseline = 'top';

    const labelX = cx + CHAR_W / 2;
    const labelY = cy + CHAR_H + 4;
    let name = agent.name;
    if (name.length > 10) name = name.slice(0, 9) + '..';

    // Status color
    const stateColors: Record<string, string> = {
      working: '#22c55e', thinking: '#3b82f6', error: '#ef4444', help: '#f59e0b',
    };
    const color = stateColors[agent.status] || '#94a3b8';

    // Name bg
    charCtx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
    const tw = charCtx.measureText(name).width;
    const boxW = tw + 10;
    const boxH = 16;
    charCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    charCtx.strokeStyle = color;
    charCtx.lineWidth = 1.5;
    charCtx.beginPath();
    charCtx.roundRect(labelX - boxW / 2, labelY, boxW, boxH, 4);
    charCtx.fill();
    charCtx.stroke();

    // Name text
    charCtx.fillStyle = '#f8fafc';
    charCtx.fillText(name, labelX, labelY + 3);

    // Status dot
    charCtx.fillStyle = color;
    charCtx.beginPath();
    charCtx.arc(cx + CHAR_W - 4, cy + 4, 4, 0, Math.PI * 2);
    charCtx.fill();

    charCtx.restore();

    // Reset alpha
    if (!isActive) charCtx.globalAlpha = 1.0;
  }
}

function startCharMode() {
  if (charCanvas) charCanvas.style.display = 'block';
  if (officeCanvas) officeCanvas.style.display = 'none';
  stopOffice();
  lastResizedCount = -1; // force resize on next frame
  charLastTime = performance.now();
  charRafId = requestAnimationFrame(charLoop);
}

function stopCharMode() {
  if (charRafId) { cancelAnimationFrame(charRafId); charRafId = 0; }
  if (charCanvas) charCanvas.style.display = 'none';
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
  charCanvas = document.getElementById('char-canvas') as HTMLCanvasElement;
  charCtx = charCanvas?.getContext('2d') || null;

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
