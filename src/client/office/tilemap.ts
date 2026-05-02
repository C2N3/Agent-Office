/**
 * Tilemap — JSON-based office map loader.
 * Loads tilemap JSON + object catalog, builds collision grid, seats, laptops,
 * and composites offscreen canvases for rendering (back/front layers).
 */

/* eslint-disable no-unused-vars */

import { OFFICE } from './officeConfig';
import { loadOfficeImage } from './officeLayers';
import { toHttpAssetPath } from '../../shared/assetPaths';
import type {
  RoomTilemap, PlacedObject, ObjectCatalog, ObjectDef,
  Rotation, SeatSlot, LaptopSlot,
} from '../../shared/tilemapSchema';

// ── Catalog singleton ──

let _catalog: ObjectCatalog | null = null;
const _imageCache: Record<string, HTMLImageElement> = {};

export function getObjectCatalog(): ObjectCatalog | null {
  return _catalog;
}

export async function loadObjectCatalog(url?: string): Promise<ObjectCatalog> {
  if (_catalog) return _catalog;
  const src = url || toHttpAssetPath('office/object-catalog.json');
  const res = await fetch(src);
  _catalog = await res.json() as ObjectCatalog;
  return _catalog;
}

// ── Image loading with cache ──

async function loadCachedImage(src: string): Promise<HTMLImageElement> {
  if (_imageCache[src]) return _imageCache[src];
  const img = await loadOfficeImage(src);
  _imageCache[src] = img;
  return img;
}

// ── Tilemap loader ──

export async function loadTilemap(jsonUrl: string): Promise<RoomTilemap> {
  const res = await fetch(jsonUrl);
  return await res.json() as RoomTilemap;
}

// ── Rotation helpers ──

/** Rotate a tile offset (relative to object origin) by rotation degrees. */
function rotateOffset(
  ox: number, oy: number,
  objW: number, objH: number,
  rot: Rotation,
): { x: number; y: number } {
  switch (rot) {
    case 0:   return { x: ox, y: oy };
    case 90:  return { x: objH - 1 - oy, y: ox };
    case 180: return { x: objW - 1 - ox, y: objH - 1 - oy };
    case 270: return { x: oy, y: objW - 1 - ox };
    default:  return { x: ox, y: oy };
  }
}

/** Get effective width/height after rotation. */
function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number } {
  if (rot === 90 || rot === 270) return { w: h, h: w };
  return { w, h };
}

/** Rotate a direction string. */
const DIR_ORDER = ['up', 'right', 'down', 'left'];
function rotateDir(dir: string, rot: Rotation): string {
  const idx = DIR_ORDER.indexOf(dir);
  if (idx < 0) return dir;
  const steps = (rot / 90) | 0;
  return DIR_ORDER[(idx + steps) % 4];
}

// ── Collision grid ──

export function buildCollisionGrid(
  tilemap: RoomTilemap,
  catalog: ObjectCatalog,
): boolean[][] {
  const { gridWidth, gridHeight } = tilemap;

  // Start all walkable
  const grid: boolean[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < gridWidth; x++) {
      row.push(true);
    }
    grid.push(row);
  }

  // Mark object tiles as blocked
  for (let i = 0; i < tilemap.objects.length; i++) {
    const placed = tilemap.objects[i];
    const def = catalog.objects[placed.objectId];
    if (!def || !def.collision) continue;

    const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, placed.rotation);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const gx = placed.tileX + dx;
        const gy = placed.tileY + dy;
        if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
          grid[gy][gx] = false;
        }
      }
    }
  }

  return grid;
}

// ── Seat extraction ──

interface ExtractedSeat {
  x: number;
  y: number;
  id: number;
  type: 'desk' | 'idle' | 'meeting';
  dir: string;
  animType: string;
}

export function buildSeatsFromObjects(
  tilemap: RoomTilemap,
  catalog: ObjectCatalog,
  originX: number,
  originY: number,
): { desk: ExtractedSeat[]; idle: ExtractedSeat[] } {
  const TILE = tilemap.tileSize;
  const desk: ExtractedSeat[] = [];
  const idle: ExtractedSeat[] = [];
  let nextId = 0;

  for (let i = 0; i < tilemap.objects.length; i++) {
    const placed = tilemap.objects[i];
    const def = catalog.objects[placed.objectId];
    if (!def) continue;

    // Object is itself a seat (e.g. chair)
    if (def.isSeat) {
      const seatType = def.seatType || 'desk';
      const dir = rotateDir('down', placed.rotation);
      const worldX = placed.tileX * TILE + Math.floor(TILE / 2) + originX;
      const worldY = placed.tileY * TILE + TILE + 30 + originY; // +30 butt-to-feet offset
      const seat: ExtractedSeat = {
        x: worldX,
        y: worldY,
        id: nextId++,
        type: seatType,
        dir,
        animType: 'sit',
      };
      if (seatType === 'idle') {
        idle.push(seat);
      } else {
        desk.push(seat);
      }
    }

    // Object has named seat slots (e.g. bench, sofa)
    if (def.seatSlots) {
      for (let s = 0; s < def.seatSlots.length; s++) {
        const slot = def.seatSlots[s];
        const rotOff = rotateOffset(
          slot.offsetX, slot.offsetY,
          def.widthTiles, def.heightTiles,
          placed.rotation,
        );
        const dir = rotateDir(slot.dir, placed.rotation);
        const worldX = (placed.tileX + rotOff.x) * TILE + Math.floor(TILE / 2) + originX;
        const worldY = (placed.tileY + rotOff.y) * TILE + TILE + 30 + originY;
        const seatType = def.seatType || 'desk';
        const seat: ExtractedSeat = {
          x: worldX,
          y: worldY,
          id: nextId++,
          type: seatType,
          dir,
          animType: 'sit',
        };
        if (seatType === 'idle') {
          idle.push(seat);
        } else {
          desk.push(seat);
        }
      }
    }
  }

  return { desk, idle };
}

// ── Laptop extraction ──

interface ExtractedLaptop {
  x: number;
  y: number;
  dir: string;
  closedSrc: string;
  openSrc: string;
  seatId: number;
}

export function buildLaptopsFromObjects(
  tilemap: RoomTilemap,
  catalog: ObjectCatalog,
  originX: number,
  originY: number,
  deskSeats: ExtractedSeat[],
): ExtractedLaptop[] {
  const TILE = tilemap.tileSize;
  const laptops: ExtractedLaptop[] = [];

  for (let i = 0; i < tilemap.objects.length; i++) {
    const placed = tilemap.objects[i];
    const def = catalog.objects[placed.objectId];
    if (!def || !def.laptopSlots) continue;

    for (let s = 0; s < def.laptopSlots.length; s++) {
      const slot = def.laptopSlots[s];
      const rotOff = rotateOffset(
        slot.offsetX, slot.offsetY,
        def.widthTiles, def.heightTiles,
        placed.rotation,
      );
      const dir = rotateDir(slot.dir, placed.rotation);
      const worldX = (placed.tileX + rotOff.x) * TILE + originX;
      const worldY = (placed.tileY + rotOff.y) * TILE + originY;

      // Find nearest desk seat to associate laptop with
      let nearestSeatId = laptops.length;
      let nearestDist = Infinity;
      for (let d = 0; d < deskSeats.length; d++) {
        const dx = deskSeats[d].x - (worldX + TILE / 2);
        const dy = deskSeats[d].y - (worldY + TILE);
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestSeatId = deskSeats[d].id;
        }
      }

      const basePath = toHttpAssetPath('office/objects/laptops');
      laptops.push({
        x: worldX,
        y: worldY,
        dir,
        closedSrc: `${basePath}/laptop_${dir}_close.webp`,
        openSrc: `${basePath}/laptop_${dir}_open.webp`,
        seatId: nearestSeatId,
      });
    }
  }

  return laptops;
}

// ── Offscreen canvas compositing ──

/**
 * Resolve the HTTP path for an object sprite.
 * Sprite paths in the catalog are relative (e.g. "furniture/desk_back.webp"),
 * we prepend the asset base.
 */
function resolveSpritePath(spritePath: string): string {
  if (spritePath.startsWith('/') || spritePath.startsWith('http')) return spritePath;
  return toHttpAssetPath('office/objects/' + spritePath);
}

/**
 * Composite the background canvas: floor tiling + all backSprites.
 */
export async function compositeBackCanvas(
  tilemap: RoomTilemap,
  catalog: ObjectCatalog,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const TILE = tilemap.tileSize;

  // Draw floor tiles
  const floorDef = catalog.floors[tilemap.floorType];
  let floorImg: HTMLImageElement | null = null;
  if (floorDef) {
    try {
      floorImg = await loadCachedImage(resolveSpritePath(floorDef.sprite));
      if (!floorImg || !floorImg.naturalWidth) floorImg = null;
    } catch (e) { floorImg = null; }
  }

  // Fallback floor colors when sprites are missing
  const FLOOR_COLORS: Record<string, string> = {
    wood: '#8B7355',
    carpet_blue: '#4A6FA5',
    tile_white: '#E8E8E8',
  };

  for (let y = 0; y < tilemap.gridHeight; y++) {
    for (let x = 0; x < tilemap.gridWidth; x++) {
      if (floorImg) {
        ctx.drawImage(floorImg, x * TILE, y * TILE, TILE, TILE);
      } else {
        ctx.fillStyle = FLOOR_COLORS[tilemap.floorType] || '#777';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        // Subtle grid lines for visibility
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  // Draw back sprites (sorted by tileY for correct overlap)
  const backObjects: Array<{ placed: PlacedObject; def: ObjectDef }> = [];
  for (let i = 0; i < tilemap.objects.length; i++) {
    const placed = tilemap.objects[i];
    const def = catalog.objects[placed.objectId];
    if (def && def.sprites.back) {
      backObjects.push({ placed, def });
    }
  }
  backObjects.sort(function (a, b) { return a.placed.tileY - b.placed.tileY; });

  const CATEGORY_COLORS: Record<string, string> = {
    wall: '#555',
    furniture: '#6B5B3A',
    decoration: '#3A6B4A',
  };

  for (let i = 0; i < backObjects.length; i++) {
    const { placed, def } = backObjects[i];
    const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, placed.rotation);
    const drawW = w * TILE;
    const drawH = h * TILE;
    const drawX = placed.tileX * TILE;
    const drawY = placed.tileY * TILE;

    let img: HTMLImageElement | null = null;
    try {
      img = await loadCachedImage(resolveSpritePath(def.sprites.back!));
      if (!img || !img.naturalWidth) img = null;
    } catch (e) { img = null; }

    if (img) {
      if (placed.rotation === 0) {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        ctx.save();
        ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
        ctx.rotate((placed.rotation * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
    } else {
      // Fallback: colored rectangle with label
      ctx.fillStyle = CATEGORY_COLORS[def.category] || '#666';
      ctx.fillRect(drawX, drawY, drawW, drawH);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX + 1, drawY + 1, drawW - 2, drawH - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px sans-serif';
      ctx.fillText(def.name || placed.objectId, drawX + 4, drawY + 14);
    }
  }

  return canvas;
}

/**
 * Composite the foreground canvas: all frontSprites.
 */
export async function compositeFrontCanvas(
  tilemap: RoomTilemap,
  catalog: ObjectCatalog,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const TILE = tilemap.tileSize;

  const frontObjects: Array<{ placed: PlacedObject; def: ObjectDef }> = [];
  for (let i = 0; i < tilemap.objects.length; i++) {
    const placed = tilemap.objects[i];
    const def = catalog.objects[placed.objectId];
    if (def && def.sprites.front) {
      frontObjects.push({ placed, def });
    }
  }
  frontObjects.sort(function (a, b) { return a.placed.tileY - b.placed.tileY; });

  for (let i = 0; i < frontObjects.length; i++) {
    const { placed, def } = frontObjects[i];
    const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, placed.rotation);
    const drawW = w * TILE;
    const drawH = h * TILE;
    const drawX = placed.tileX * TILE;
    const drawY = placed.tileY * TILE;

    let img: HTMLImageElement | null = null;
    try {
      img = await loadCachedImage(resolveSpritePath(def.sprites.front!));
      if (!img || !img.naturalWidth) img = null;
    } catch (e) { img = null; }

    if (img) {
      if (placed.rotation === 0) {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        ctx.save();
        ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
        ctx.rotate((placed.rotation * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
    } else {
      // Fallback: semi-transparent overlay
      ctx.fillStyle = 'rgba(100, 100, 200, 0.3)';
      ctx.fillRect(drawX, drawY, drawW, drawH);
      ctx.strokeStyle = 'rgba(100, 100, 200, 0.5)';
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(drawX + 1, drawY + 1, drawW - 2, drawH - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '9px sans-serif';
      ctx.fillText('fg:' + (def.name || ''), drawX + 3, drawY + 12);
    }
  }

  return canvas;
}
