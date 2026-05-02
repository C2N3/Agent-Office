
import {
  AVATAR_FILES,
  avatarIndexFromId,
  OFFICE,
  STATE_COLORS,
  STATE_ZONE_MAP,
  getSeatConfig,
  getIdleSeatEntry,
} from '../officeConfig';
import { officeCoordsByRoom } from '../officeCoords';
import { officeLayers, officeRooms, officeRoomOrder, getRoomAtWorld, getNearestRoom } from '../officeLayers';
import { officePathfinder } from '../officePathfinder';
import { officeRenderer } from '../officeRenderer';
import { animKeyFromDir, tickOfficeAnimation } from '../officeSprite';

function seatKey(roomId, deskIndex) {
  return roomId + ':' + deskIndex;
}

function pickInitialRoomId(agentId) {
  // In floor mode, there's always exactly one room loaded (the current floor's room).
  // So just pick the first available room.
  if (officeRoomOrder.length === 0) return null;
  return officeRoomOrder[0];
}

function roomCenter(roomId) {
  const room = officeRooms[roomId];
  if (!room) {
    return { x: (officeLayers.width || 1750) / 2, y: (officeLayers.height || 1750) / 2 };
  }
  return {
    x: room.originX + room.width / 2,
    y: room.originY + room.height / 2,
  };
}

export function addCharacter(agentData) {
  if (this.characters.has(agentData.id)) {
    this.updateCharacter(agentData);
    return;
  }

  const officeState = this._mapStatus(agentData);
  const avatarIdx = (agentData.avatarIndex !== undefined && agentData.avatarIndex !== null)
    ? agentData.avatarIndex : avatarIndexFromId(agentData.id);
  const avatarFile = AVATAR_FILES[avatarIdx] || AVATAR_FILES[0];

  const roomId = pickInitialRoomId(agentData.id);
  const center = roomId ? roomCenter(roomId) : { x: 875, y: 875 };

  const char = {
    id: agentData.id,
    roomId,
    floorId: agentData._floorId || null,
    x: center.x + (Math.random() - 0.5) * 175,
    y: center.y + (Math.random() - 0.5) * 175,
    path: [],
    pathIndex: 0,
    facingDir: 'down',
    avatarFile,
    skinIndex: avatarIdx,
    deskIndex: undefined,
    deskOverflow: false,
    manualPinned: false,
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

  if (agentData.avatarIndex != null && agentData.avatarIndex !== char.skinIndex) {
    const avatarFile = AVATAR_FILES[agentData.avatarIndex] || AVATAR_FILES[0];
    char.avatarFile = avatarFile;
    char.skinIndex = agentData.avatarIndex;
  }

  if (oldState !== newState) {
    const oldZone = STATE_ZONE_MAP[oldState] || 'idle';
    const newZone = STATE_ZONE_MAP[newState] || 'idle';

    if (!char.manualPinned) {
      if (newZone === 'desk' && char.deskIndex === undefined) {
        this.assignDesk(agentData.id);
      } else if (newZone === 'idle' && oldZone === 'desk') {
        this.releaseDesk(agentData.id);
      }
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
  if (!char.roomId) char.roomId = pickInitialRoomId(agentId);
  const roomId = char.roomId;
  if (!roomId) return;

  const roomCoords = officeCoordsByRoom[roomId];
  const deskCoords = (roomCoords && roomCoords.desk) || [];
  const usedDesks = new Set<number>();
  this.seatAssignments.forEach(function (_id, key) {
    const parts = String(key).split(':');
    if (parts[0] === roomId) usedDesks.add(Number(parts[1]));
  });

  const available: number[] = [];
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
  this.seatAssignments.set(seatKey(roomId, idx), agentId);
}

export function releaseDesk(agentId) {
  const char = this.characters.get(agentId);
  if (!char) return;
  if (char.deskIndex !== undefined && char.roomId) {
    this.seatAssignments.delete(seatKey(char.roomId, char.deskIndex));
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
  if (!char.roomId) char.roomId = pickInitialRoomId(char.id);
  const coords = officeCoordsByRoom[char.roomId];
  if (!coords || !coords.desk || !coords.idle) return;

  if (char.manualPinned) {
    char.path = [];
    char.pathIndex = 0;
    return;
  }

  if (char.agentState === 'working' || char.agentState === 'thinking' ||
      char.agentState === 'error' || char.agentState === 'help') {
    char.restTimer = 0;

    if (char.deskOverflow) {
      if (char.path.length > 0 && char.pathIndex < char.path.length) return;
      const nearIdle = this._findNearDeskIdleSpot(char);
      if (nearIdle) {
        if (Math.abs(char.x - nearIdle.x) < 5 && Math.abs(char.y - nearIdle.y) < 5) return;
        char.path = officePathfinder.findPath(char.roomId, char.x, char.y, nearIdle.x, nearIdle.y);
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

      char.path = officePathfinder.findPath(char.roomId, char.x, char.y, tx, ty);
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
    if (a.roomId !== char.roomId) return;
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
    char.path = officePathfinder.findPath(char.roomId, char.x, char.y, dest.x, dest.y);
    char.pathIndex = 0;
  }
}

export function updateMovement(char, deltaSec) {
  if (char.manualPinned) {
    char.path = [];
    char.pathIndex = 0;
    return;
  }

  const isArrived = char.path.length === 0 || char.pathIndex >= char.path.length;

  if (isArrived) {
    const coords = officeCoordsByRoom[char.roomId] || { desk: [], idle: [] };
    const allSpots = (coords.desk || []).concat(coords.idle || []);
    let currentSpot = null;
    for (let i = 0; i < allSpots.length; i++) {
      if (Math.abs(allSpots[i].x - char.x) < 5 && Math.abs(allSpots[i].y - char.y) < 5) {
        currentSpot = allSpots[i];
        break;
      }
    }

    if (char.agentState === 'done' || char.agentState === 'completed') {
      if (currentSpot && currentSpot.type === 'idle') {
        const entry = getIdleSeatEntry(char.roomId, currentSpot.id);
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
      const idleConfig = getSeatConfig(char.roomId, currentSpot.id);
      char.facingDir = idleConfig.dir;
      char.currentAnim = idleConfig.animType === 'sit' ? `sit_${idleConfig.dir}` : `${idleConfig.dir}_idle`;
    } else {
      const config = currentSpot ? getSeatConfig(char.roomId, currentSpot.id) : { dir: 'down', animType: 'sit' };
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
