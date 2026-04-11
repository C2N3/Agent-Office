// @ts-nocheck

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
    for (let i = 0; i < deskCoords.length; i++) {
      if (usedDesks.has(i)) continue;
      const ddx = deskCoords[i].x - x;
      const ddy = deskCoords[i].y - y;
      const dd = ddx * ddx + ddy * ddy;
      if (dd < bestDist) {
        bestDist = dd;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      char.deskIndex = bestIdx;
      this.seatAssignments.set(bestIdx, agentId);
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
  for (let i = 0; i < idleCoords.length; i++) {
    const point = idleCoords[i];
    if (occupied[`${Math.floor(point.x)},${Math.floor(point.y)}`]) continue;
    const ddx = point.x - x;
    const ddy = point.y - y;
    const dd = ddx * ddx + ddy * ddy;
    if (dd < bestDist) {
      bestDist = dd;
      bestSpot = point;
    }
  }
  if (bestSpot) {
    char.path = officePathfinder.findPath(char.x, char.y, bestSpot.x, bestSpot.y);
    char.pathIndex = 0;
  }
}
