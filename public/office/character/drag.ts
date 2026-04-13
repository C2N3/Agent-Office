
import { STATE_ZONE_MAP } from '../officeConfig.js';
import { officeCoords } from '../officeCoords.js';
import { officePathfinder } from '../officePathfinder.js';

export function pinCharacterAt(agentId, x, y) {
  const char = this.characters.get(agentId);
  if (!char) return;
  if (char.deskIndex !== undefined) {
    this.seatAssignments.delete(char.deskIndex);
    char.deskIndex = undefined;
  }
  char.deskOverflow = false;
  char.x = x;
  char.y = y;
  char.path = [];
  char.pathIndex = 0;
  char.manualPinned = true;
  const dir = char.facingDir || 'down';
  char.currentAnim = `${dir}_idle`;
}

export function unpinCharacter(agentId) {
  const char = this.characters.get(agentId);
  if (!char) return;
  char.manualPinned = false;
  char.path = [];
  char.pathIndex = 0;
  const zone = STATE_ZONE_MAP[char.agentState] || 'idle';
  if (zone === 'desk' && char.deskIndex === undefined) {
    this.assignDesk(agentId);
  }
}

// Compute the total walking distance of a path (sum of segment lengths).
function _pathLength(path, startX, startY) {
  if (!path || path.length === 0) return Infinity;
  let len = 0;
  let px = startX;
  let py = startY;
  for (let i = 0; i < path.length; i++) {
    const dx = path[i].x - px;
    const dy = path[i].y - py;
    len += Math.sqrt(dx * dx + dy * dy);
    px = path[i].x;
    py = path[i].y;
  }
  return len;
}

export function dropCharacterAt(agentId, x, y) {
  const char = this.characters.get(agentId);
  if (!char) return;
  char.x = x;
  char.y = y;
  char.manualPinned = false;
  char.path = [];
  char.pathIndex = 0;

  if (char.deskIndex !== undefined) {
    this.seatAssignments.delete(char.deskIndex);
    char.deskIndex = undefined;
  }
  char.deskOverflow = false;

  const zone = STATE_ZONE_MAP[char.agentState] || 'idle';
  if (zone === 'desk') {
    const usedDesks = new Set(this.seatAssignments.keys());
    const deskCoords = officeCoords.desk || [];
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestPath = null;
    for (let i = 0; i < deskCoords.length; i++) {
      if (usedDesks.has(i)) continue;
      const p = officePathfinder.findPath(x, y, deskCoords[i].x, deskCoords[i].y);
      const d = _pathLength(p, x, y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
        bestPath = p;
      }
    }
    if (bestIdx >= 0) {
      char.deskIndex = bestIdx;
      this.seatAssignments.set(bestIdx, agentId);
      char.path = bestPath;
      char.pathIndex = 0;
    } else {
      char.deskOverflow = true;
    }
    return;
  }

  const idleCoords = officeCoords.idle || [];
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
  let bestSpot = null;
  let bestDist = Infinity;
  let bestPath = null;
  for (let i = 0; i < idleCoords.length; i++) {
    const point = idleCoords[i];
    if (occupied[`${Math.floor(point.x)},${Math.floor(point.y)}`]) continue;
    const p = officePathfinder.findPath(x, y, point.x, point.y);
    const d = _pathLength(p, x, y);
    if (d < bestDist) {
      bestDist = d;
      bestSpot = point;
      bestPath = p;
    }
  }
  if (bestPath) {
    char.path = bestPath;
    char.pathIndex = 0;
  }
}
