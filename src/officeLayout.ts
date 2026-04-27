import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveFromModule } from './runtime/module.js';

const DEFAULT_MAP_SCALE = 2.1875;
const DEFAULT_TILE_SIZE = 70;
const DEFAULT_ROOM_GAP = 0;

const DEFAULT_SEAT_MAP = {
  10: { dir: 'right', animType: 'sit' },
  12: { dir: 'right', animType: 'sit' },
  18: { dir: 'right', animType: 'sit' },
  28: { dir: 'right', animType: 'sit' },
  11: { dir: 'left', animType: 'sit' },
  13: { dir: 'left', animType: 'sit' },
  19: { dir: 'left', animType: 'sit' },
  29: { dir: 'left', animType: 'sit' },
  24: { dir: 'up', animType: 'stand' },
  4: { dir: 'up', animType: 'sit' },
  5: { dir: 'up', animType: 'sit' },
  6: { dir: 'up', animType: 'sit' },
  7: { dir: 'up', animType: 'sit' },
  14: { dir: 'up', animType: 'sit' },
  15: { dir: 'up', animType: 'sit' },
};

const DEFAULT_IDLE_SEAT_MAP = {
  18: 'right',
  28: 'right',
  24: 'dance',
  19: 'left',
  29: 'left',
};

const DEFAULT_LAPTOP_SEAT_MAP = {
  0: 10, 1: 8, 2: 9, 3: 11,
  4: 0, 5: 1, 6: 2, 7: 3,
  8: 12, 9: 14, 10: 15, 11: 13,
  12: 4, 13: 5, 14: 6, 15: 7,
};

function buildRoomTemplateAssets(roomDir) {
  return {
    background: `/assets/office/${roomDir}/map/office_bg_32.webp`,
    foreground: `/assets/office/${roomDir}/map/office_fg_32.webp`,
    coordinates: `/assets/office/${roomDir}/map/office_xy.webp`,
    collision: `/assets/office/${roomDir}/map/office_collision.webp`,
    laptopSpots: `/assets/office/${roomDir}/objects/office_laptop.webp`,
    laptopStates: {
      down: {
        closed: `/assets/office/${roomDir}/objects/office_laptop_front_close.webp`,
        open: `/assets/office/${roomDir}/objects/office_laptop_front_open.webp`,
      },
      up: {
        closed: `/assets/office/${roomDir}/objects/office_laptop_back_close.webp`,
        open: `/assets/office/${roomDir}/objects/office_laptop_back_open.webp`,
      },
      left: {
        closed: `/assets/office/${roomDir}/objects/office_laptop_left_close.webp`,
        open: `/assets/office/${roomDir}/objects/office_laptop_left_open.webp`,
      },
      right: {
        closed: `/assets/office/${roomDir}/objects/office_laptop_right_close.webp`,
        open: `/assets/office/${roomDir}/objects/office_laptop_right_open.webp`,
      },
    },
  };
}

function buildDefaultRoom(id, roomDir) {
  return {
    id,
    name: id,
    assets: buildRoomTemplateAssets(roomDir),
    seatMap: DEFAULT_SEAT_MAP,
    idleSeatMap: DEFAULT_IDLE_SEAT_MAP,
    laptopSeatMap: DEFAULT_LAPTOP_SEAT_MAP,
    decor: [],
  };
}

const DEFAULT_LAYOUT = {
  name: 'Default Office',
  mapScale: DEFAULT_MAP_SCALE,
  tileSize: DEFAULT_TILE_SIZE,
  roomGap: DEFAULT_ROOM_GAP,
  rooms: [
    buildDefaultRoom('room1', 'rooms/room1'),
    buildDefaultRoom('room2', 'rooms/room2'),
  ],
};

const VALID_DIRS = new Set(['up', 'down', 'left', 'right']);
const VALID_ANIM_TYPES = new Set(['sit', 'stand']);
const VALID_IDLE_VALUES = new Set(['up', 'down', 'left', 'right', 'dance']);
const VALID_DECOR_LAYERS = new Set(['bg', 'fg']);

type PlainObject = Record<string, any>;
const DEFAULT_LAYOUT_FOLDER = resolveFromModule(pathToFileURL(module.filename), '..', 'office-layout');

function cloneDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

function getCustomLayoutDir() {
  const envDir = process.env.AGENT_OFFICE_LAYOUT_DIR;
  if (envDir) return path.resolve(envDir);

  const manifestPath = path.join(DEFAULT_LAYOUT_FOLDER, 'manifest.json');
  if (fs.existsSync(manifestPath)) return DEFAULT_LAYOUT_FOLDER;

  return null;
}

function toClientAssetUrl(assetPath) {
  if (typeof assetPath !== 'string' || !assetPath.trim()) return null;
  if (/^https?:\/\//i.test(assetPath) || assetPath.startsWith('/')) return assetPath;

  const normalized = assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const encoded = normalized
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return '/api/office-layout/assets/' + encoded;
}

function mergeLaptopStates(inputStates, fallbackStates) {
  const result: PlainObject = {};
  ['down', 'up', 'left', 'right'].forEach((dir) => {
    const input = inputStates && typeof inputStates === 'object' ? inputStates[dir] : null;
    const fallback = fallbackStates[dir];
    result[dir] = {
      closed: toClientAssetUrl(input && input.closed) || fallback.closed,
      open: toClientAssetUrl(input && input.open) || fallback.open,
    };
  });
  return result;
}

function normalizeSeatMap(value, fallback) {
  if (!value || typeof value !== 'object') return { ...fallback };
  const next: PlainObject = { ...fallback };

  Object.entries(value).forEach(([key, config]) => {
    const seatConfig = config as PlainObject;
    if (!/^\d+$/.test(String(key)) || !config || typeof config !== 'object') return;
    next[String(key)] = {
      dir: VALID_DIRS.has(seatConfig.dir) ? seatConfig.dir : 'down',
      animType: VALID_ANIM_TYPES.has(seatConfig.animType) ? seatConfig.animType : 'sit',
    };
  });

  return next;
}

function normalizeIdleSeatMap(value, fallback) {
  if (!value || typeof value !== 'object') return { ...fallback };
  const next: PlainObject = { ...fallback };

  Object.entries(value).forEach(([key, dir]) => {
    if (!/^\d+$/.test(String(key)) || !VALID_IDLE_VALUES.has(String(dir))) return;
    next[String(key)] = dir;
  });

  return next;
}

function normalizeLaptopSeatMap(value, fallback) {
  if (!value || typeof value !== 'object') return { ...fallback };
  const next: PlainObject = { ...fallback };

  Object.entries(value).forEach(([key, seatId]) => {
    if (!/^\d+$/.test(String(key)) || !Number.isInteger(seatId)) return;
    next[String(key)] = seatId;
  });

  return next;
}

function normalizeDecor(value) {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const src = toClientAssetUrl(item.src);
    if (!src || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;

    const next: PlainObject = {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : 'decor-' + index,
      src,
      x: item.x,
      y: item.y,
      layer: VALID_DECOR_LAYERS.has(item.layer) ? item.layer : 'bg',
    };

    if (Number.isFinite(item.scale) && item.scale > 0) next.scale = item.scale;
    if (Number.isFinite(item.width) && item.width > 0) next.width = item.width;
    if (Number.isFinite(item.height) && item.height > 0) next.height = item.height;
    if (Number.isFinite(item.alpha) && item.alpha >= 0 && item.alpha <= 1) next.alpha = item.alpha;

    return next;
  }).filter(Boolean);
}

function normalizeRoomAssets(assets, fallbackAssets) {
  const input = assets && typeof assets === 'object' ? assets : {};
  return {
    background: toClientAssetUrl(input.background) || fallbackAssets.background,
    foreground: toClientAssetUrl(input.foreground) || fallbackAssets.foreground,
    coordinates: toClientAssetUrl(input.coordinates) || fallbackAssets.coordinates,
    collision: toClientAssetUrl(input.collision) || fallbackAssets.collision,
    laptopSpots: toClientAssetUrl(input.laptopSpots) || fallbackAssets.laptopSpots,
    laptopStates: mergeLaptopStates(input.laptopStates, fallbackAssets.laptopStates),
  };
}

function normalizeRoom(room, fallbackRoom, index) {
  const input = room && typeof room === 'object' ? room : {};
  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim()
    : (fallbackRoom && fallbackRoom.id) || 'room' + (index + 1);

  const next: PlainObject = {
    id,
    name: typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : (fallbackRoom && fallbackRoom.name) || id,
    assets: normalizeRoomAssets(input.assets, (fallbackRoom && fallbackRoom.assets) || DEFAULT_LAYOUT.rooms[0].assets),
    seatMap: normalizeSeatMap(input.seatMap, (fallbackRoom && fallbackRoom.seatMap) || DEFAULT_SEAT_MAP),
    idleSeatMap: normalizeIdleSeatMap(input.idleSeatMap, (fallbackRoom && fallbackRoom.idleSeatMap) || DEFAULT_IDLE_SEAT_MAP),
    laptopSeatMap: normalizeLaptopSeatMap(input.laptopSeatMap, (fallbackRoom && fallbackRoom.laptopSeatMap) || DEFAULT_LAPTOP_SEAT_MAP),
    decor: normalizeDecor(input.decor),
  };

  if (Number.isFinite(input.originX)) next.originX = input.originX;
  if (Number.isFinite(input.originY)) next.originY = input.originY;

  return next;
}

function normalizeRooms(value, fallbackRooms) {
  const rooms = Array.isArray(value) ? value : null;
  if (!rooms || rooms.length === 0) {
    return fallbackRooms.map((room, idx) => normalizeRoom(room, room, idx));
  }
  return rooms.map((room, idx) => normalizeRoom(room, fallbackRooms[idx] || fallbackRooms[0], idx));
}

function normalizeLayout(manifest) {
  const layout = cloneDefaultLayout();
  const input = manifest && typeof manifest === 'object' ? manifest : {};

  if (typeof input.name === 'string' && input.name.trim()) layout.name = input.name.trim();
  if (Number.isFinite(input.mapScale) && input.mapScale > 0) layout.mapScale = input.mapScale;
  if (Number.isFinite(input.tileSize) && input.tileSize > 0) layout.tileSize = input.tileSize;
  if (Number.isFinite(input.roomGap) && input.roomGap >= 0) layout.roomGap = input.roomGap;

  // Legacy single-room manifest: promote top-level assets/seatMap/etc into a single room.
  if (!Array.isArray(input.rooms) && (input.assets || input.seatMap || input.idleSeatMap || input.decor)) {
    const legacyRoom = {
      id: 'room1',
      name: 'room1',
      assets: input.assets,
      seatMap: input.seatMap,
      idleSeatMap: input.idleSeatMap,
      laptopSeatMap: input.laptopSeatMap,
      decor: input.decor,
    };
    layout.rooms = [normalizeRoom(legacyRoom, DEFAULT_LAYOUT.rooms[0], 0)];
  } else {
    layout.rooms = normalizeRooms(input.rooms, DEFAULT_LAYOUT.rooms);
  }

  return layout;
}

function loadOfficeLayoutManifest() {
  const layoutDir = getCustomLayoutDir();
  if (!layoutDir) return cloneDefaultLayout();

  const manifestPath = path.join(layoutDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return cloneDefaultLayout();

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return normalizeLayout(manifest);
  } catch (error) {
    console.error('[OfficeLayout] Failed to load custom office layout manifest:', error);
    return cloneDefaultLayout();
  }
}

function resolveOfficeLayoutAssetPath(assetPath) {
  const layoutDir = getCustomLayoutDir();
  if (!layoutDir || typeof assetPath !== 'string' || !assetPath.trim()) return null;

  const resolved = path.resolve(layoutDir, decodeURIComponent(assetPath));
  const relative = path.relative(layoutDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

export {
  DEFAULT_LAYOUT,
  loadOfficeLayoutManifest,
  normalizeLayout,
  resolveOfficeLayoutAssetPath,
  toClientAssetUrl,
};
