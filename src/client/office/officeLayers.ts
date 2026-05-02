/**
 * Office Layers — Background/foreground image loading, per-room.
 * Ported from pixel_office layerCache.ts, extended for multi-room layouts.
 */

/* eslint-disable no-unused-vars */

import { OFFICE, OFFICE_LAYOUT } from './officeConfig';
import { toHttpAssetPath } from '../../shared/assetPaths';
import {
  loadTilemap, loadObjectCatalog, compositeBackCanvas, compositeFrontCanvas,
} from './tilemap';

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

/**
 * Build office layers. If roomFilter is provided, only rooms whose IDs are
 * in the array will be loaded (used for floor-based rendering).
 */
export async function buildOfficeLayers(roomFilter?: string[], tilemapId?: string | null) {
  const layout: any = OFFICE_LAYOUT || {};
  let rooms: any[] = Array.isArray(layout.rooms) && layout.rooms.length > 0
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

  // Floor filter: only load the room(s) belonging to the active floor
  if (roomFilter && roomFilter.length > 0) {
    const filtered = rooms.filter(function (r) { return roomFilter.indexOf(r.id) !== -1; });
    // If filter matches nothing, fallback to first room with the requested id
    if (filtered.length > 0) {
      rooms = filtered;
    } else {
      // Use first room as template but assign the requested roomId
      rooms = [Object.assign({}, rooms[0], { id: roomFilter[0], name: roomFilter[0] })];
    }
  }

  const gap = Number.isFinite(layout.roomGap) && layout.roomGap >= 0 ? layout.roomGap : 0;
  const scale = (OFFICE && OFFICE.MAP_SCALE) || 1;
  const ts = Date.now();

  // Reset previous state
  officeRoomOrder.length = 0;
  Object.keys(officeRooms).forEach(function (key) { delete officeRooms[key]; });

  // Load all room backgrounds in parallel first, then layout sequentially.
  const loadResults = await Promise.all(rooms.map(async function (roomCfg) {
    const assets = (roomCfg && roomCfg.assets) || {};

    // Tilemap: use tilemapId (per-floor) or assets.tilemap (layout config)
    const tilemapUrl = tilemapId
      ? '/api/office-tilemap/' + encodeURIComponent(tilemapId)
      : assets.tilemap;
    if (tilemapUrl) {
      const catalog = await loadObjectCatalog();
      const tilemapData = await loadTilemap(cacheBustSrc(tilemapUrl, ts));
      const tileSize = tilemapData.tileSize || OFFICE.TILE_SIZE;
      const tmWidth = tilemapData.gridWidth * tileSize;
      const tmHeight = tilemapData.gridHeight * tileSize;
      const [backCanvas, frontCanvas] = await Promise.all([
        compositeBackCanvas(tilemapData, catalog, tmWidth, tmHeight),
        compositeFrontCanvas(tilemapData, catalog, tmWidth, tmHeight),
      ]);
      return { roomCfg, bgImg: backCanvas as any, fgImg: frontCanvas as any, tilemap: tilemapData, isTilemap: true, tmWidth, tmHeight };
    }

    const bgSrc = assets.background || toHttpAssetPath('office/rooms/room1/map/office_bg_32.webp');
    const fgSrc = assets.foreground || toHttpAssetPath('office/rooms/room1/map/office_fg_32.webp');
    const [bgImg, fgImg] = await Promise.all([
      loadOfficeImage(cacheBustSrc(bgSrc, ts)),
      loadOfficeImage(cacheBustSrc(fgSrc, ts)),
    ]);
    return { roomCfg, bgImg, fgImg, tilemap: null, isTilemap: false, tmWidth: 0, tmHeight: 0 };
  }));

  let cursorX = 0;
  let maxBottom = 0;

  for (let i = 0; i < loadResults.length; i++) {
    const { roomCfg, bgImg, fgImg, tilemap: tilemapData, isTilemap, tmWidth, tmHeight } = loadResults[i];
    const width = isTilemap ? tmWidth : Math.round((bgImg.naturalWidth || 800) * scale);
    const height = isTilemap ? tmHeight : Math.round((bgImg.naturalHeight || 800) * scale);
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
      tilemap: tilemapData || null,
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
