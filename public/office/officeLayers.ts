/**
 * Office Layers — Background/foreground image loading, per-room.
 * Ported from pixel_office layerCache.ts, extended for multi-room layouts.
 */

/* eslint-disable no-unused-vars */

import { OFFICE, OFFICE_LAYOUT } from './officeConfig.js';

export function loadOfficeImage(src) {
  return new Promise<HTMLImageElement>(function (resolve) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () {
      console.warn('[OfficeLayers] Failed to load:', src);
      const blank = new Image();
      blank.width = 800;
      blank.height = 800;
      resolve(blank);
    };
    img.src = src;
  });
}

// Aggregate world bounds across all rooms. Individual rooms live in officeRooms.
export const officeLayers: any = {
  width: 0,
  height: 0,
  ready: false,
};

// Per-room state keyed by roomId. Populated by buildOfficeLayers().
export const officeRooms: Record<string, any> = {};
export const officeRoomOrder: string[] = [];

export function getRoomAtWorld(worldX: number, worldY: number) {
  for (let i = 0; i < officeRoomOrder.length; i++) {
    const room = officeRooms[officeRoomOrder[i]];
    if (!room) continue;
    if (worldX >= room.originX && worldX < room.originX + room.width &&
        worldY >= room.originY && worldY < room.originY + room.height) {
      return room;
    }
  }
  return null;
}

export function getNearestRoom(worldX: number, worldY: number) {
  let best: any = null;
  let bestDist = Infinity;
  for (let i = 0; i < officeRoomOrder.length; i++) {
    const room = officeRooms[officeRoomOrder[i]];
    if (!room) continue;
    const cx = room.originX + room.width / 2;
    const cy = room.originY + room.height / 2;
    const dx = worldX - cx;
    const dy = worldY - cy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = room; }
  }
  return best;
}

function cacheBustSrc(src: string, ts: number) {
  if (!src) return src;
  const sep = src.indexOf('?') === -1 ? '?' : '&';
  return src + sep + 't=' + ts;
}

async function loadRoomDecor(roomCfg: any, originX: number, originY: number) {
  const decor = Array.isArray(roomCfg && roomCfg.decor) ? roomCfg.decor : [];
  const loaded = await Promise.all(decor.map(async function (item) {
    return {
      id: item.id,
      x: (Number(item.x) || 0) + originX,
      y: (Number(item.y) || 0) + originY,
      width: item.width,
      height: item.height,
      scale: item.scale,
      alpha: item.alpha,
      layer: item.layer || 'bg',
      image: await loadOfficeImage(item.src),
    };
  }));

  return {
    before: loaded.filter(function (d) { return d.layer !== 'fg'; }),
    after: loaded.filter(function (d) { return d.layer === 'fg'; }),
  };
}

export async function buildOfficeLayers() {
  const layout: any = OFFICE_LAYOUT || {};
  const rooms: any[] = Array.isArray(layout.rooms) && layout.rooms.length > 0
    ? layout.rooms
    : [{
        id: 'room1',
        name: 'room1',
        assets: layout.assets || {},
        seatMap: layout.seatMap,
        idleSeatMap: layout.idleSeatMap,
        laptopSeatMap: layout.laptopSeatMap,
        decor: layout.decor,
      }];
  const gap = Number.isFinite(layout.roomGap) && layout.roomGap >= 0 ? layout.roomGap : 0;
  const scale = (OFFICE && OFFICE.MAP_SCALE) || 1;
  const ts = Date.now();

  // Reset previous state
  officeRoomOrder.length = 0;
  Object.keys(officeRooms).forEach(function (key) { delete officeRooms[key]; });

  // Load all room backgrounds in parallel first, then layout sequentially.
  const loadResults = await Promise.all(rooms.map(async function (roomCfg) {
    const assets = (roomCfg && roomCfg.assets) || {};
    const bgSrc = assets.background || '/public/office/rooms/room1/map/office_bg_32.webp';
    const fgSrc = assets.foreground || '/public/office/rooms/room1/map/office_fg_32.webp';
    const [bgImg, fgImg] = await Promise.all([
      loadOfficeImage(cacheBustSrc(bgSrc, ts)),
      loadOfficeImage(cacheBustSrc(fgSrc, ts)),
    ]);
    return { roomCfg, bgImg, fgImg };
  }));

  let cursorX = 0;
  let maxBottom = 0;

  for (let i = 0; i < loadResults.length; i++) {
    const { roomCfg, bgImg, fgImg } = loadResults[i];
    const width = Math.round((bgImg.naturalWidth || 800) * scale);
    const height = Math.round((bgImg.naturalHeight || 800) * scale);
    const originX = Number.isFinite(roomCfg.originX) ? roomCfg.originX : cursorX;
    const originY = Number.isFinite(roomCfg.originY) ? roomCfg.originY : 0;

    const decorLoaded = await loadRoomDecor(roomCfg, originX, originY);

    const roomState = {
      id: roomCfg.id,
      name: roomCfg.name || roomCfg.id,
      originX,
      originY,
      width,
      height,
      bgImage: bgImg,
      fgImage: fgImg,
      decorBefore: decorLoaded.before,
      decorAfter: decorLoaded.after,
      assets: roomCfg.assets || {},
      seatMap: roomCfg.seatMap || {},
      idleSeatMap: roomCfg.idleSeatMap || {},
      laptopSeatMap: roomCfg.laptopSeatMap || {},
    };
    officeRooms[roomCfg.id] = roomState;
    officeRoomOrder.push(roomCfg.id);

    cursorX = Math.max(cursorX, originX + width + gap);
    maxBottom = Math.max(maxBottom, originY + height);
  }

  officeLayers.width = cursorX > 0 && loadResults.length > 0 ? cursorX - gap : 0;
  officeLayers.height = maxBottom;
  officeLayers.ready = loadResults.length > 0;

  return officeLayers;
}
