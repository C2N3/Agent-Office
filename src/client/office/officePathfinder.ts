/**
 * Office Pathfinder — A* pathfinding on collision map, per-room.
 * Public API takes world-space coordinates; each room keeps its own grid
 * in local coordinates and converts at the boundary.
 */

/* eslint-disable no-unused-vars */

import { OFFICE } from './officeConfig.js';
import { loadOfficeImage, officeRooms, officeRoomOrder } from './officeLayers.js';
import { toHttpAssetPath } from '../../shared/assetPaths.js';

interface RoomGrid {
  grid: boolean[][];
  gridW: number;
  gridH: number;
  originX: number;
  originY: number;
  tile: number;
  width: number;
  height: number;
}

export const officePathfinder: any = {
  rooms: {} as Record<string, RoomGrid>,

  async init() {
    this.rooms = {};
    for (let i = 0; i < officeRoomOrder.length; i++) {
      const roomId = officeRoomOrder[i];
      await this.initRoom(roomId);
    }
  },

  async initRoom(roomId: string) {
    const room = officeRooms[roomId];
    if (!room) return;
    const TILE = OFFICE.TILE_SIZE;
    const assets = room.assets || {};
    const src = assets.collision || toHttpAssetPath('office/rooms/room1/map/office_collision.webp');
    const sep = src.indexOf('?') === -1 ? '?' : '&';
    const img = await loadOfficeImage(src + sep + 't=' + Date.now());
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const gridW = Math.ceil(room.width / TILE);
    const gridH = Math.ceil(room.height / TILE);
    const scaleX = canvas.width / room.width;
    const scaleY = canvas.height / room.height;

    const grid: boolean[][] = [];
    for (let gy = 0; gy < gridH; gy++) {
      grid[gy] = [];
      for (let gx = 0; gx < gridW; gx++) {
        const px = Math.floor((gx + 0.5) * TILE * scaleX);
        const py = Math.floor((gy + 0.5) * TILE * scaleY);
        const idx = (py * canvas.width + px) * 4;
        grid[gy][gx] = data[idx + 3] < 128;
      }
    }

    this.rooms[roomId] = {
      grid,
      gridW,
      gridH,
      originX: room.originX,
      originY: room.originY,
      tile: TILE,
      width: room.width,
      height: room.height,
    };
  },

  _roomFromWorld(worldX: number, worldY: number) {
    for (let i = 0; i < officeRoomOrder.length; i++) {
      const r = this.rooms[officeRoomOrder[i]];
      if (!r) continue;
      if (worldX >= r.originX && worldX < r.originX + r.width &&
          worldY >= r.originY && worldY < r.originY + r.height) {
        return { roomId: officeRoomOrder[i], room: r };
      }
    }
    return null;
  },

  isWalkable(roomId: string, gx: number, gy: number) {
    const r = this.rooms[roomId];
    if (!r) return false;
    if (gx < 0 || gy < 0 || gx >= r.gridW || gy >= r.gridH) return false;
    return r.grid[gy][gx];
  },

  findNearestWalkable(roomId: string, gx: number, gy: number) {
    for (let r = 1; r < 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.isWalkable(roomId, gx + dx, gy + dy)) return { x: gx + dx, y: gy + dy };
        }
      }
    }
    return { x: gx, y: gy };
  },

  findPath(roomId: string, startX: number, startY: number, endX: number, endY: number) {
    const r: RoomGrid = this.rooms[roomId];
    if (!r || r.gridW === 0) return [{ x: endX, y: endY }];

    const TILE = r.tile;
    const localSX = startX - r.originX;
    const localSY = startY - r.originY;
    const localEX = endX - r.originX;
    const localEY = endY - r.originY;

    let sgx = Math.max(0, Math.min(r.gridW - 1, Math.floor(localSX / TILE)));
    let sgy = Math.max(0, Math.min(r.gridH - 1, Math.floor(localSY / TILE)));
    let egx = Math.max(0, Math.min(r.gridW - 1, Math.floor(localEX / TILE)));
    let egy = Math.max(0, Math.min(r.gridH - 1, Math.floor(localEY / TILE)));

    if (!this.isWalkable(roomId, sgx, sgy)) {
      const ns = this.findNearestWalkable(roomId, sgx, sgy);
      sgx = ns.x; sgy = ns.y;
    }
    if (!this.isWalkable(roomId, egx, egy)) {
      const ne = this.findNearestWalkable(roomId, egx, egy);
      egx = ne.x; egy = ne.y;
    }
    if (sgx === egx && sgy === egy) return [{ x: endX, y: endY }];

    const openSet: any[] = [];
    const closedSet: Record<string, boolean> = {};
    const h0 = Math.abs(sgx - egx) + Math.abs(sgy - egy);
    openSet.push({ x: sgx, y: sgy, g: 0, h: h0, f: h0, parent: null });

    const dirs: Array<[number, number]> = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];

    while (openSet.length > 0) {
      openSet.sort(function (a, b) { return a.f - b.f; });
      const current: any = openSet.shift();
      const key = current.x + ',' + current.y;

      if (current.x === egx && current.y === egy) {
        const path: any[] = [];
        let node: any = current;
        while (node) {
          path.unshift({
            x: node.x * TILE + Math.floor(TILE / 2) + r.originX,
            y: node.y * TILE + Math.floor(TILE / 2) + r.originY,
          });
          node = node.parent;
        }
        path.shift();
        if (path.length > 0) {
          path[path.length - 1] = { x: endX, y: endY };
        }
        return path;
      }

      closedSet[key] = true;

      for (let i = 0; i < dirs.length; i++) {
        const dx = dirs[i][0], dy = dirs[i][1];
        const nx = current.x + dx, ny = current.y + dy;
        if (!this.isWalkable(roomId, nx, ny) || closedSet[nx + ',' + ny]) continue;

        const cost = (dx !== 0 && dy !== 0) ? 1.4 : 1;
        const g = current.g + cost;
        const h = Math.abs(nx - egx) + Math.abs(ny - egy);
        const f = g + h;

        let existing: any = null;
        for (let j = 0; j < openSet.length; j++) {
          if (openSet[j].x === nx && openSet[j].y === ny) { existing = openSet[j]; break; }
        }
        if (!existing) {
          openSet.push({ x: nx, y: ny, g: g, h: h, f: f, parent: current });
        } else if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
        }
      }

      if (Object.keys(closedSet).length > 2000) break;
    }

    return [{ x: endX, y: endY }];
  },
};
