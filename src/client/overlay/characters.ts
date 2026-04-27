
import { OFFICE, SPRITE_FRAMES } from '../office/officeConfig';
import { getOfficeSkinImage } from '../office/officeSprite';

const ACTIVE_STATES = new Set(['working', 'thinking', 'error', 'help']);
const VISIBLE_STATES = new Set(['working', 'thinking', 'error', 'help', 'idle', 'done', 'offline']);

const CHAR_W = 64;
const CHAR_H = 85;
const GAP = 12;
const LABEL_H = 32;
const SLOT_H = CHAR_H + LABEL_H;
const PAD = 4;
const CONTROLS_H = 28;

export function createCharacterRenderer({ agents, overlayBridge, getMode }) {
  let canvas = null;
  let ctx = null;
  let rafId = 0;
  let lastTime = 0;
  let lastResizedCount = -1;

  function setCanvas(nextCanvas) {
    canvas = nextCanvas;
    ctx = canvas?.getContext('2d') || null;
  }

  function getVisibleAgents() {
    const result = [];
    agents.forEach((agent) => {
      if (VISIBLE_STATES.has(agent.status)) result.push(agent);
    });
    return result;
  }

  function loop(now) {
    if (getMode() !== 'characters') return;
    rafId = requestAnimationFrame(loop);
    if (!ctx || !canvas) return;

    const dt = Math.min(now - lastTime, 100);
    lastTime = now;

    const active = getVisibleAgents();
    resizeToAgentCount(active.length);

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    if (active.length === 0) return;

    const totalW = active.length * CHAR_W + (active.length - 1) * GAP;
    const startX = (cw - totalW) / 2;
    const startY = CONTROLS_H;

    for (let i = 0; i < active.length; i++) {
      drawAgent(active[i], dt, startX + i * (CHAR_W + GAP), startY);
    }
  }

  function resizeToAgentCount(agentCount) {
    const count = Math.max(agentCount, 1);
    if (count === lastResizedCount || getMode() !== 'characters') return;

    lastResizedCount = count;
    const needW = count * CHAR_W + (count - 1) * GAP + PAD * 2;
    const needH = SLOT_H + PAD + CONTROLS_H;
    overlayBridge.overlayAPI?.resize?.(Math.round(needW), Math.round(needH));
  }

  function drawAgent(agent, dt, x, y) {
    agent.animTimer += dt;
    const interval = 1000 / 4;
    if (agent.animTimer >= interval) {
      agent.animTimer -= interval;
      agent.animFrame++;
    }

    const isActive = ACTIVE_STATES.has(agent.status);
    const anim = getAnimationName(agent.status, isActive);
    const frames = SPRITE_FRAMES[anim];
    if (!frames) return;

    const img = getOfficeSkinImage(agent.avatarFile);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const frameIdx = frames[agent.animFrame % frames.length];
    const sx = (frameIdx % OFFICE.COLS) * OFFICE.SRC_FRAME_W;
    const expectedHeight = OFFICE.SRC_FRAME_H * OFFICE.ROWS;
    const yOffset = Math.max(0, img.naturalHeight - expectedHeight) / 2;
    const sy = Math.floor(frameIdx / OFFICE.COLS) * OFFICE.SRC_FRAME_H + yOffset;

    if (!isActive) ctx.globalAlpha = 0.35;
    ctx.drawImage(
      img,
      sx, sy, OFFICE.SRC_FRAME_W, OFFICE.SRC_FRAME_H,
      x, y, CHAR_W, CHAR_H
    );
    drawLabel(agent, x, y);
    if (!isActive) ctx.globalAlpha = 1.0;
  }

  function getAnimationName(status, isActive) {
    if (status === 'error' || status === 'help') return 'alert_jump';
    if (status === 'done') return 'dance';
    if (isActive) return 'sit_work_down';
    return 'down_idle';
  }

  function drawLabel(agent, x, y) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelX = x + CHAR_W / 2;
    const labelY = y + CHAR_H + 4;
    let name = agent.name;
    if (name.length > 10) name = name.slice(0, 9) + '..';

    const color = getStatusColor(agent.status);
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
    const textWidth = ctx.measureText(name).width;
    const boxW = textWidth + 10;
    const boxH = 16;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(labelX - boxW / 2, labelY, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(name, labelX, labelY + 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + CHAR_W - 4, y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function getStatusColor(status) {
    return {
      working: '#22c55e',
      thinking: '#3b82f6',
      error: '#ef4444',
      help: '#f59e0b',
    }[status] || '#94a3b8';
  }

  function start() {
    if (canvas) canvas.style.display = 'block';
    lastResizedCount = -1;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (canvas) canvas.style.display = 'none';
  }

  return { setCanvas, start, stop };
}
