/**
 * Office Coords — Parse office_xy.webp and office_laptop.webp per room.
 * Coordinates are stored in WORLD space (room origin already applied).
 */

/* eslint-disable no-unused-vars */

import { OFFICE } from './officeConfig';
import { loadOfficeImage, officeRooms, officeRoomOrder } from './officeLayers';
import { buildSeatsFromObjects, buildLaptopsFromObjects, getObjectCatalog } from './tilemap';

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

// Flood-fill connected components of same-class pixels.
// Each visual blob → one entry, regardless of pixel size. Discovery order is
// image scan order (top→bottom, left→right by first-seen pixel of the blob).
function findColorClusters<T extends string>(
  data: Uint8ClampedArray,
  iw: number,
  ih: number,
  classify: (r: number, g: number, b: number, a: number) => T | null,
): Array<{ type: T; centroidX: number; centroidY: number }> {
  const visited = new Uint8Array(iw * ih);
  const out: Array<{ type: T; centroidX: number; centroidY: number }> = [];
  const pixelType = (x: number, y: number) => {
    const i = (y * iw + x) * 4;
    return classify(data[i], data[i + 1], data[i + 2], data[i + 3]);
  };

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (visited[y * iw + x]) continue;
      const t = pixelType(x, y);
      if (!t) { visited[y * iw + x] = 1; continue; }

      const stack: number[] = [x, y];
      let sumX = 0, sumY = 0, count = 0;
      while (stack.length) {
        const cy = stack.pop() as number;
        const cx = stack.pop() as number;
        if (cx < 0 || cy < 0 || cx >= iw || cy >= ih) continue;
        if (visited[cy * iw + cx]) continue;
        if (pixelType(cx, cy) !== t) { visited[cy * iw + cx] = 1; continue; }
        visited[cy * iw + cx] = 1;
        sumX += cx; sumY += cy; count++;
        stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
      }
      if (count > 0) out.push({ type: t, centroidX: sumX / count, centroidY: sumY / count });
    }
  }
  return out;
}

export async function parseRoomMapCoordinates(roomId: string) {
  const room = officeRooms[roomId];
  if (!room) return;

  // Tilemap path: extract seats from JSON objects
  if (room.tilemap) {
    const catalog = getObjectCatalog();
    if (catalog) {
      const seats = buildSeatsFromObjects(room.tilemap, catalog, room.originX, room.originY);
      const existing = officeCoordsByRoom[roomId] || { laptopSpots: [] } as any;
      officeCoordsByRoom[roomId] = {
        desk: seats.desk.map(function (s) { return { x: s.x, y: s.y, id: s.id, type: s.type }; }),
        idle: seats.idle.map(function (s) { return { x: s.x, y: s.y, id: s.id, type: 'idle' as const }; }),
        laptopSpots: existing.laptopSpots || [],
      };
      // Store seat configs for behavior.ts (direction/animType)
      const seatMap: Record<number, { dir: string; animType: string }> = {};
      const allSeats = seats.desk.concat(seats.idle);
      for (let i = 0; i < allSeats.length; i++) {
        seatMap[allSeats[i].id] = { dir: allSeats[i].dir, animType: allSeats[i].animType };
      }
      room.seatMap = seatMap;
      return;
    }
  }

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

  const classify = (r: number, g: number, b: number, a: number) => {
    if (a < 128) return null;
    if (colorMatch(r, g, b, 0, 255, 0, THRESHOLD) || colorMatch(r, g, b, 0, 0, 0, THRESHOLD)) return 'idle' as const;
    if (colorMatch(r, g, b, 0, 0, 255, THRESHOLD)) return 'desk' as const;
    if (colorMatch(r, g, b, 255, 255, 0, THRESHOLD)) return 'meeting' as const;
    return null;
  };

  const clusters = findColorClusters(data, iw, ih, classify);
  for (const c of clusters) {
    // Marker ≈ character butt position. agent.y is feet, so feet sit slightly below marker.
    const localX = Math.round(c.centroidX * scaleX);
    const localY = Math.round(c.centroidY * scaleY + 30);
    const worldX = localX + room.originX;
    const worldY = localY + room.originY;
    if (c.type === 'idle') tempIdle.push({ x: worldX, y: worldY });
    else if (c.type === 'desk') tempDesk.push({ x: worldX, y: worldY });
    else if (c.type === 'meeting') tempMeeting.push({ x: worldX, y: worldY });
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

  // Tilemap path: extract laptops from JSON objects
  if (room.tilemap) {
    const catalog = getObjectCatalog();
    if (catalog) {
      const coords = getRoomCoords(roomId);
      const deskSeats = coords.desk.map(function (d) {
        return { x: d.x, y: d.y, id: d.id, type: d.type as 'desk', dir: 'down', animType: 'sit' };
      });
      const laptops = buildLaptopsFromObjects(room.tilemap, catalog, room.originX, room.originY, deskSeats);
      coords.laptopSpots = laptops.map(function (lp) { return { x: lp.x, y: lp.y, dir: lp.dir }; });
      // Build laptopSeatMap
      const laptopSeatMap: Record<number, number> = {};
      for (let i = 0; i < laptops.length; i++) {
        laptopSeatMap[i] = laptops[i].seatId;
      }
      room.laptopSeatMap = laptopSeatMap;
      return;
    }
  }

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

  const classify = (r: number, g: number, b: number, a: number) => {
    if (a < 128) return null;
    if (colorMatch(r, g, b, 255, 128, 0, THRESHOLD)) return 'left' as const;
    if (colorMatch(r, g, b, 0, 255, 255, THRESHOLD)) return 'down' as const;
    if (colorMatch(r, g, b, 255, 0, 255, THRESHOLD)) return 'up' as const;
    if (colorMatch(r, g, b, 0, 0, 255, THRESHOLD)) return 'right' as const;
    return null;
  };

  const clusters = findColorClusters(data, iw, ih, classify);
  for (const c of clusters) {
    const gx = Math.floor((c.centroidX * scaleX) / TILE);
    const gy = Math.floor((c.centroidY * scaleY) / TILE);
    // Sprite is 2 tiles tall with content in lower half. Shift up so visible
    // laptop sits on the table. Up-facing laptops sit on the back of the desk
    // (further up on screen) so they need an extra tile of upward shift.
    const yShift = c.type === 'up' ? Math.floor(1.5 * TILE) : TILE;
    spots.push({ x: gx * TILE + room.originX, y: gy * TILE - yShift + room.originY, dir: c.type });
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
