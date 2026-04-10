// @ts-nocheck

import {
  AVATAR_FILES,
  avatarIndexFromId,
  OFFICE,
  OFFICE_LAYOUT,
  STATE_COLORS,
  STATE_ZONE_MAP,
  getSeatConfig,
} from './office-config.js';
import { officeCoords } from './office-coords.js';
import { officeLayers } from './office-layers.js';
import { officePathfinder } from './office-pathfinder.js';
import { officeRenderer } from './office-renderer.js';
import { animKeyFromDir, tickOfficeAnimation } from './office-sprite.js';

export function addCharacter(agentData) {
  if (this.characters.has(agentData.id)) {
    this.updateCharacter(agentData);
    return;
  }

  const officeState = this._mapStatus(agentData);
  const avatarIdx = (agentData.avatarIndex !== undefined && agentData.avatarIndex !== null)
    ? agentData.avatarIndex : avatarIndexFromId(agentData.id);
  const avatarFile = AVATAR_FILES[avatarIdx] || AVATAR_FILES[0];

  const char = {
    id: agentData.id,
    x: (officeLayers.width || 1750) / 2 + (Math.random() - 0.5) * 175,
    y: (officeLayers.height || 1750) / 2 + (Math.random() - 0.5) * 175,
    path: [],
    pathIndex: 0,
    facingDir: 'down',
    avatarFile,
    skinIndex: avatarIdx,
    deskIndex: undefined,
    deskOverflow: false,
    currentAnim: 'down_idle',
    animFrame: 0,
    animTimer: 0,
    agentState: officeState,
    restTimer: 0,
    bubble: null,
    role: agentData.name || 'Agent',
    metadata: {
      name: agentData.name || 'Agent',
      project: agentData.project || '',
      tool: agentData.currentTool || null,
      provider: agentData.metadata?.provider || null,
      type: agentData.type || 'main',
      status: agentData.status || 'idle',
      lastMessage: agentData.lastMessage || null,
    },
  };

  this.characters.set(agentData.id, char);
  if (STATE_ZONE_MAP[officeState] === 'desk') {
    this.assignDesk(agentData.id);
  }

  this._updateTarget(char);
  this._setBubble(char, agentData);
}

export function updateCharacter(agentData) {
  const char = this.characters.get(agentData.id);
  if (!char) {
    this.addCharacter(agentData);
    return;
  }

  const oldState = char.agentState;
  const newState = this._mapStatus(agentData);
  char.agentState = newState;
  char.role = agentData.name || char.role;
  char.metadata.name = agentData.name || char.metadata.name;
  char.metadata.project = agentData.project || char.metadata.project;
  char.metadata.tool = agentData.currentTool || null;
  char.metadata.provider = agentData.metadata?.provider || char.metadata.provider || null;
  char.metadata.status = agentData.status || 'idle';
  char.metadata.type = agentData.type || char.metadata.type;
  char.metadata.lastMessage = agentData.lastMessage || char.metadata.lastMessage;

  if (oldState !== newState) {
    const oldZone = STATE_ZONE_MAP[oldState] || 'idle';
    const newZone = STATE_ZONE_MAP[newState] || 'idle';

    if (newZone === 'desk' && char.deskIndex === undefined) {
      this.assignDesk(agentData.id);
    } else if (newZone === 'idle' && oldZone === 'desk') {
      this.releaseDesk(agentData.id);
    }

    const stateColor = STATE_COLORS[newState] || '#94a3b8';
    officeRenderer.spawnEffect('stateChange', char.x, char.y - Math.round(OFFICE.FRAME_H * 0.5), stateColor);
    if (newState === 'done') {
      officeRenderer.spawnEffect('confetti', char.x, char.y - Math.round(OFFICE.FRAME_H * 0.7));
    } else if (newState === 'error') {
      officeRenderer.spawnEffect('warning', char.x, char.y - OFFICE.FRAME_H - 5);
    }
  }

  this._setBubble(char, agentData);
}

export function removeCharacter(agentId) {
  this.releaseDesk(agentId);
  this.characters.delete(agentId);
}

export function assignDesk(agentId) {
  const char = this.characters.get(agentId);
  if (!char || char.deskIndex !== undefined) return;

  const usedDesks = new Set(this.seatAssignments.keys());
  const deskCoords = officeCoords.desk || [];
  const available = [];
  for (let i = 0; i < deskCoords.length; i++) {
    if (!usedDesks.has(i)) available.push(i);
  }

  if (available.length === 0) {
    char.deskOverflow = true;
    return;
  }

  const hash = avatarIndexFromId(agentId);
  const idx = available[hash % available.length];
  char.deskIndex = idx;
  this.seatAssignments.set(idx, agentId);
}

export function releaseDesk(agentId) {
  const char = this.characters.get(agentId);
  if (!char) return;
  if (char.deskIndex !== undefined) {
    this.seatAssignments.delete(char.deskIndex);
    char.deskIndex = undefined;
  }
  char.deskOverflow = false;
}

export function updateAll(deltaSec, deltaMs) {
  this.characters.forEach((char) => {
    this._updateTarget(char);
    this._updateMovement(char, deltaSec);
    tickOfficeAnimation(char, deltaMs);

    if (char.agentState === 'working' && Math.random() < 0.05) {
      officeRenderer.spawnEffect('focus', char.x, char.y - Math.round(OFFICE.FRAME_H * 0.6));
    }
  });
}

export function updateTarget(char) {
  const coords = officeCoords;
  if (!coords || !coords.desk || !coords.idle) return;

  if (char.agentState === 'working' || char.agentState === 'thinking' ||
      char.agentState === 'error' || char.agentState === 'help') {
    char.restTimer = 0;

    if (char.deskOverflow) {
      if (char.path.length > 0 && char.pathIndex < char.path.length) return;
      const nearIdle = this._findNearDeskIdleSpot(char);
      if (nearIdle) {
        if (Math.abs(char.x - nearIdle.x) < 5 && Math.abs(char.y - nearIdle.y) < 5) return;
        char.path = officePathfinder.findPath(char.x, char.y, nearIdle.x, nearIdle.y);
        char.pathIndex = 0;
      }
      return;
    }

    if (char.deskIndex !== undefined && char.deskIndex < coords.desk.length) {
      const target = coords.desk[char.deskIndex];
      const tx = Math.floor(target.x);
      const ty = Math.floor(target.y);

      if (char.path.length === 0 && Math.floor(char.x) === tx && Math.floor(char.y) === ty) return;
      if (char.path.length > 0) {
        const last = char.path[char.path.length - 1];
        if (Math.floor(last.x) === tx && Math.floor(last.y) === ty) return;
      }

      char.path = officePathfinder.findPath(char.x, char.y, tx, ty);
      char.pathIndex = 0;
    }
    return;
  }

  if (char.path.length > 0 && char.pathIndex < char.path.length) return;

  const isAtIdle = coords.idle.some((p) => Math.abs(p.x - char.x) < 5 && Math.abs(p.y - char.y) < 5);
  if (isAtIdle) return;

  const occupied = {};
  this.characters.forEach((a) => {
    if (a.id === char.id) return;
    let ax = Math.floor(a.x);
    let ay = Math.floor(a.y);
    if (a.path.length > 0) {
      const t = a.path[a.path.length - 1];
      ax = Math.floor(t.x);
      ay = Math.floor(t.y);
    }
    occupied[`${ax},${ay}`] = true;
  });

  const valid = coords.idle.filter((p) => !occupied[`${Math.floor(p.x)},${Math.floor(p.y)}`]);
  if (valid.length > 0) {
    const dest = valid[Math.floor(Math.random() * valid.length)];
    char.path = officePathfinder.findPath(char.x, char.y, dest.x, dest.y);
    char.pathIndex = 0;
  }
}

export function updateMovement(char, deltaSec) {
  const isArrived = char.path.length === 0 || char.pathIndex >= char.path.length;

  if (isArrived) {
    const allSpots = (officeCoords.desk || []).concat(officeCoords.idle || []);
    let currentSpot = null;
    for (let i = 0; i < allSpots.length; i++) {
      if (Math.abs(allSpots[i].x - char.x) < 5 && Math.abs(allSpots[i].y - char.y) < 5) {
        currentSpot = allSpots[i];
        break;
      }
    }

    if (char.agentState === 'done' || char.agentState === 'completed') {
      if (currentSpot && currentSpot.type === 'idle') {
        const idleSeatMap = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.idleSeatMap) || {};
        const entry = idleSeatMap[currentSpot.id];
        char.currentAnim = entry === 'dance' ? 'dance' : `sit_${entry || 'down'}`;
      } else {
        char.currentAnim = `sit_${char.facingDir || 'down'}`;
      }
    } else if (char.deskOverflow) {
      char.facingDir = 'down';
      char.currentAnim = 'down_idle';
    } else if (char.agentState === 'error') {
      char.currentAnim = 'alert_jump';
    } else if (currentSpot && currentSpot.type === 'idle') {
      const idleConfig = getSeatConfig(currentSpot.id);
      char.facingDir = idleConfig.dir;
      char.currentAnim = idleConfig.animType === 'sit' ? `sit_${idleConfig.dir}` : `${idleConfig.dir}_idle`;
    } else {
      const config = currentSpot ? getSeatConfig(currentSpot.id) : { dir: 'down', animType: 'sit' };
      char.facingDir = config.dir;
      if (config.animType === 'sit') {
        const isWorking = char.agentState === 'working' || char.agentState === 'thinking' || char.agentState === 'help';
        char.currentAnim = `${isWorking ? 'sit_work_' : 'sit_'}${config.dir}`;
      } else {
        char.currentAnim = `${config.dir}_idle`;
      }
    }
    return;
  }

  const target = char.path[char.pathIndex];
  const dx = target.x - char.x;
  const dy = target.y - char.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < OFFICE.ARRIVE_THRESHOLD) {
    char.x = target.x;
    char.y = target.y;
    char.pathIndex++;
    return;
  }

  const speed = OFFICE.MOVE_SPEED * deltaSec;
  char.x += (dx / dist) * speed;
  char.y += (dy / dist) * speed;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  char.facingDir = dir;
  char.currentAnim = animKeyFromDir(dir, true);
}

export function humanizeToolName(toolName, provider) {
  if (!toolName) return null;

  if (provider === 'codex') {
    const known = {
      exec_command: 'Command',
      apply_patch: 'Patch',
      web_search: 'Web Search',
      view_image: 'Image',
      spawn_agent: 'Subagent',
      send_input: 'Agent Input',
      wait_agent: 'Waiting',
      query_docs: 'Docs',
      read_mcp_resource: 'MCP Resource',
    };

    if (known[toolName]) return known[toolName];
  }

  return String(toolName)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function mapStatus(agentOrStatus) {
  const dashboardStatus = typeof agentOrStatus === 'string'
    ? agentOrStatus
    : (agentOrStatus?.status || 'idle');
  const currentTool = typeof agentOrStatus === 'string'
    ? null
    : (agentOrStatus?.currentTool || null);
  const provider = typeof agentOrStatus === 'string'
    ? null
    : (agentOrStatus?.metadata?.provider || null);

  const map = {
    working: 'working',
    thinking: 'thinking',
    waiting: 'idle',
    completed: 'done',
    done: 'done',
    help: 'help',
    error: 'error',
    offline: 'offline',
  };

  if (provider === 'codex' && currentTool && !['error', 'offline', 'completed', 'done', 'help'].includes(dashboardStatus)) {
    return 'working';
  }

  return map[dashboardStatus] || 'idle';
}

export function setBubble(char, agentData) {
  if (agentData.reportTaskId) {
    char.bubble = { text: '작업 완료! 보고드릴게요', icon: null, expiresAt: Infinity, isReport: true, taskId: agentData.reportTaskId };
    return;
  }

  if (char.bubble && char.bubble.isReport) return;

  let text = null;
  let icon = null;
  const status = this._mapStatus(agentData);
  const provider = agentData.metadata?.provider || char.metadata.provider || null;
  const currentTool = agentData.currentTool || char.metadata.tool || null;

  if (status === 'working' && currentTool) {
    text = this._humanizeToolName(currentTool, provider);
  } else if (status === 'thinking') {
    text = 'Thinking...';
  } else if (status === 'completed' || status === 'done') {
    text = 'Done!';
  } else if (status === 'help') {
    text = 'Need help!';
  } else if (status === 'error') {
    text = 'Error!';
  }

  if (text) {
    const isPersistent = status === 'working' || status === 'thinking' || status === 'help' || status === 'error';
    char.bubble = { text, icon, expiresAt: isPersistent ? Infinity : Date.now() + 8000 };
  }
}

export function setReportBubble(agentId, taskId) {
  const char = this.characters.get(agentId);
  if (!char) return;
  char.bubble = { text: '작업 완료! 보고드릴게요', icon: null, expiresAt: Infinity, isReport: true, taskId };
}

export function clearReportBubble(agentId) {
  const char = this.characters.get(agentId);
  if (char?.bubble?.isReport) {
    char.bubble = null;
  }
}

export function findNearDeskIdleSpot(char) {
  const coords = officeCoords;
  if (!coords || !coords.idle || !coords.desk || coords.desk.length === 0) return null;

  let avgX = 0;
  let avgY = 0;
  for (let i = 0; i < coords.desk.length; i++) {
    avgX += coords.desk[i].x;
    avgY += coords.desk[i].y;
  }
  avgX /= coords.desk.length;
  avgY /= coords.desk.length;

  const occupied = {};
  this.characters.forEach((a) => {
    if (a.id === char.id) return;
    let ax = Math.floor(a.x);
    let ay = Math.floor(a.y);
    if (a.path.length > 0) {
      const t = a.path[a.path.length - 1];
      ax = Math.floor(t.x);
      ay = Math.floor(t.y);
    }
    occupied[`${ax},${ay}`] = true;
  });

  const candidates = coords.idle
    .filter((p) => !occupied[`${Math.floor(p.x)},${Math.floor(p.y)}`])
    .sort((a, b) => (Math.abs(a.x - avgX) + Math.abs(a.y - avgY)) - (Math.abs(b.x - avgX) + Math.abs(b.y - avgY)));

  if (candidates.length === 0) return null;
  const idHash = avatarIndexFromId(char.id);
  return candidates[idHash % Math.min(candidates.length, 5)];
}
