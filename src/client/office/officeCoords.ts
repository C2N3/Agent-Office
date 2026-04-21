/**
 * Office Coords — Parse office_xy.webp and office_laptop.webp per room.
 * Coordinates are stored in WORLD space (room origin already applied).
 */

/* eslint-disable no-unused-vars */

import { OFFICE } from './officeConfig.js';
import { loadOfficeImage, officeRooms, officeRoomOrder } from './officeLayers.js';

type SpotType = 'desk' | 'idle' | 'meeting';
interface Coord { x: number; y: number; id: number; type: SpotType; }
interface LaptopSpot { x: number; y: number; dir: string; }
interface RoomCoords { desk: Coord[]; idle: Coord[]; laptopSpots: LaptopSpot[]; }

export const officeCoordsByRoom: Record<string, RoomCoords> = {};

export function getRoomCoords(roomId: string): RoomCoords {
  let coords = officeCoordsByRoom[roomId];
  if (!coords) {
    coords = { desk: [], idle: [], laptopSpots: [] };
    officeCoordsByRoom[roomId] = coords;
  }
  return coords;
}

async function imageToPixels(src: string) {
  const sep = src.indexOf('?') === -1 ? '?' : '&';
  const img = await loadOfficeImage(src + sep + 't=' + Date.now());
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

function colorMatch(r, g, b, tr, tg, tb, threshold) {
  return Math.abs(r - tr) < threshold && Math.abs(g - tg) < threshold && Math.abs(b - tb) < threshold;
}

export async function parseRoomMapCoordinates(roomId: string) {
  const room = officeRooms[roomId];
  if (!room) return;
  const assets = room.assets || {};
  const src = assets.coordinates;
  if (!src) {
    officeCoordsByRoom[roomId] = { desk: [], idle: [], laptopSpots: officeCoordsByRoom[roomId]?.laptopSpots || [] };
    return;
  }

  const { data, width: iw, height: ih } = await imageToPixels(src);
  const scaleX = room.width / iw;
  const scaleY = room.height / ih;
  const THRESHOLD = 80;
  const TILE = OFFICE.TILE_SIZE;
  const tempIdle: any[] = [];
  const tempDesk: any[] = [];
  const tempMeeting: any[] = [];
  const seenGrid: Record<string, boolean> = {};

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const idx = (y * iw + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      const mapX = x * scaleX;
      const mapY = y * scaleY;
      const gx = Math.floor(mapX / TILE);
      const gy = Math.floor(mapY / TILE);
      const key = gx + ',' + gy;
      if (seenGrid[key]) continue;
      seenGrid[key] = true;

      const localX = gx * TILE + Math.floor(TILE / 2);
      const localY = gy * TILE + TILE;
      const worldX = localX + room.originX;
      const worldY = localY + room.originY;

      if (colorMatch(r, g, b, 0, 255, 0, THRESHOLD) || colorMatch(r, g, b, 0, 0, 0, THRESHOLD)) {
        tempIdle.push({ x: worldX, y: worldY });
      } else if (colorMatch(r, g, b, 0, 0, 255, THRESHOLD)) {
        tempDesk.push({ x: worldX, y: worldY });
      } else if (colorMatch(r, g, b, 255, 255, 0, THRESHOLD)) {
        tempMeeting.push({ x: worldX, y: worldY });
      }
    }
  }

  let localId = 0;
  const deskOut: Coord[] = [];
  const idleOut: Coord[] = [];

  tempDesk.forEach(function (p) {
    deskOut.push({ x: p.x, y: p.y, id: localId++, type: 'desk' });
  });
  tempMeeting.forEach(function (p) {
    deskOut.push({ x: p.x, y: p.y, id: localId++, type: 'meeting' });
  });
  tempIdle.forEach(function (p) {
    idleOut.push({ x: p.x, y: p.y, id: localId++, type: 'idle' });
  });

  const existing = officeCoordsByRoom[roomId] || { laptopSpots: [] } as any;
  officeCoordsByRoom[roomId] = { desk: deskOut, idle: idleOut, laptopSpots: existing.laptopSpots || [] };
}

export async function parseRoomObjectCoordinates(roomId: string) {
  const room = officeRooms[roomId];
  if (!room) return;
  const assets = room.assets || {};
  const src = assets.laptopSpots;
  if (!src) {
    const coords = getRoomCoords(roomId);
    coords.laptopSpots = [];
    return;
  }

  const { data, width: iw, height: ih } = await imageToPixels(src);
  const scaleX = room.width / iw;
  const scaleY = room.height / ih;
  const THRESHOLD = 80;
  const TILE = OFFICE.TILE_SIZE;
  const spots: LaptopSpot[] = [];
  const seenGrid: Record<string, boolean> = {};

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const idx = (y * iw + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      let dir: string | null = null;
      if (colorMatch(r, g, b, 255, 128, 0, THRESHOLD)) dir = 'left';
      else if (colorMatch(r, g, b, 0, 255, 255, THRESHOLD)) dir = 'down';
      else if (colorMatch(r, g, b, 255, 0, 255, THRESHOLD)) dir = 'up';
      else if (colorMatch(r, g, b, 0, 0, 255, THRESHOLD)) dir = 'right';
      else continue;

      const mapX = x * scaleX;
      const mapY = y * scaleY;
      const gx = Math.floor(mapX / TILE);
      const gy = Math.floor(mapY / TILE);
      const key = gx + ',' + gy;
      if (seenGrid[key]) continue;
      seenGrid[key] = true;

      spots.push({ x: gx * TILE + room.originX, y: gy * TILE + room.originY, dir });
    }
  }

  const coords = getRoomCoords(roomId);
  coords.laptopSpots = spots;
}

export async function parseAllRoomCoordinates() {
  for (let i = 0; i < officeRoomOrder.length; i++) {
    const roomId = officeRoomOrder[i];
    await parseRoomMapCoordinates(roomId);
    await parseRoomObjectCoordinates(roomId);
  }
}

// Legacy back-compat shim: the old single-map `officeCoords` global.
// Returns room1's coords if present, else the first room.
export const officeCoords: any = new Proxy({}, {
  get(_target, prop) {
    const firstId = officeRoomOrder[0];
    const source = (firstId && officeCoordsByRoom[firstId]) || { desk: [], idle: [], laptopSpots: [] };
    return (source as any)[prop];
  },
});

// Legacy wrappers so old imports continue to work during migration.
export async function parseMapCoordinates(_bgW?: number, _bgH?: number) {
  for (let i = 0; i < officeRoomOrder.length; i++) {
    await parseRoomMapCoordinates(officeRoomOrder[i]);
  }
}

export async function parseObjectCoordinates(_bgW?: number, _bgH?: number) {
  for (let i = 0; i < officeRoomOrder.length; i++) {
    await parseRoomObjectCoordinates(officeRoomOrder[i]);
  }
}
