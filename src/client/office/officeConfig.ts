/**
 * Office Config — Constants, sprite frame map, seat configs, state mappings
 * Ported from pixel_office spriteSheet.ts, types.ts, seatConfigs.ts
 */

/* eslint-disable no-unused-vars */

import { toHttpAssetPath } from '../../shared/assetPaths';

// OFFICE constants — FRAME_W/H/COLS populated from sprite-frames.json at init
export const OFFICE = {
  MAP_SCALE: 2.1875,   // scale factor: old 48×64 → new 106×140
  TILE_SIZE: 70,        // 32 * 2.1875
  SRC_FRAME_W: 212,     // source sprite frame size (high-res)
  SRC_FRAME_H: 280,
  FRAME_W: 106,         // display size on office canvas
  FRAME_H: 140,
  COLS: 8,
  ROWS: 9,
  ANIM_FPS: 8,
  ANIM_INTERVAL: 1000 / 8,
  IDLE_ANIM_INTERVAL: 1000 / 2,
  MOVE_SPEED: 240,      // 110 * 2.1875
  ARRIVE_THRESHOLD: 4,  // 2 * 2.1875 ≈ 4
};

// SPRITE_FRAMES — office uses different key names (direction-based) than the raw JSON.
// Built from sprite-frames.json at init via loadSpriteFrames().
export let SPRITE_FRAMES: Record<string, number[]> = {};

/** Fetch sprite frame definitions and build SPRITE_FRAMES + update OFFICE constants. */
export async function loadSpriteFrames() {
  try {
    const res = await fetch(toHttpAssetPath('shared/sprite-frames.json'));
    const data = await res.json();
    const f = data.frames;

    OFFICE.SRC_FRAME_W = data.sheet.frameWidth;
    OFFICE.SRC_FRAME_H = data.sheet.frameHeight;
    OFFICE.COLS = data.sheet.cols;
    OFFICE.ROWS = data.sheet.rows;

    SPRITE_FRAMES = {
      down_idle:      f.front_idle,
      walk_down:      f.front_walk,
      left_idle:      f.left_idle,
      walk_left:      f.left_walk,
      right_idle:     f.right_idle,
      walk_right:     f.right_walk,
      up_idle:        f.back_idle,
      walk_up:        f.back_walk,
      dance:          f.front_done_dance,
      alert_jump:     f.front_alert_jump,
      sit_down:       f.front_sit_idle,
      sit_left:       f.left_sit_idle,
      sit_right:      f.right_sit_idle,
      sit_up:         f.back_sit_idle,
      sit_work_down:  f.front_sit_work,
      sit_work_left:  f.left_sit_work,
      sit_work_right: f.right_sit_work,
      sit_work_up:    f.back_sit_work,
    };
  } catch (e) {
    console.error('[OfficeConfig] Failed to load sprite-frames.json:', e);
  }
}

// Animation keys that use the slower idle FPS (vs active/walk FPS)
export const IDLE_ANIM_KEYS = new Set([
  'down_idle', 'left_idle', 'right_idle', 'up_idle',
  'sit_down', 'sit_left', 'sit_right', 'sit_up',
  'dance',
]);

// Default seat direction/pose config (global ID → pose)
const DEFAULT_SEAT_MAP = {
  10: { dir: 'left', animType: 'sit' },
  12: { dir: 'left', animType: 'sit' },
  18: { dir: 'left', animType: 'sit' },
  28: { dir: 'left', animType: 'sit' },

  11: { dir: 'right', animType: 'sit' },
  13: { dir: 'right', animType: 'sit' },
  19: { dir: 'right', animType: 'sit' },
  29: { dir: 'right', animType: 'sit' },

  24: { dir: 'up', animType: 'stand' },

  4:  { dir: 'up', animType: 'sit' },
  5:  { dir: 'up', animType: 'sit' },
  6:  { dir: 'up', animType: 'sit' },
  7:  { dir: 'up', animType: 'sit' },
  14: { dir: 'up', animType: 'sit' },
  15: { dir: 'up', animType: 'sit' },
};

// Idle zone spot → resting animation ('dance' or sit direction)
const DEFAULT_IDLE_SEAT_MAP = {
  18: 'left',
  28: 'left',
  24: 'dance',
  19: 'right',
  29: 'right',
};

// Dashboard status → office zone mapping
export const STATE_ZONE_MAP = {
  'working':   'desk',
  'thinking':  'desk',
  'waiting':   'idle',
  'completed': 'idle',
  'help':      'desk',
  'error':     'desk',
  'offline':   'idle',
};

// State colors for nametags
export const STATE_COLORS = {
  idle:      '#94a3b8',
  working:   '#f97316',
  thinking:  '#8b5cf6',
  meeting:   '#3b82f6',
  wandering: '#a855f7',
  error:     '#ef4444',
  done:      '#22c55e',
  completed: '#22c55e',
  waiting:   '#94a3b8',
  help:      '#ef4444',
  offline:   '#475569',
};

// Loaded from assets/shared/avatars.json at init time
export let AVATAR_FILES: string[] = [];

export async function loadAvatarFiles() {
  try {
    const res = await fetch(toHttpAssetPath('shared/avatars.json'));
    const data = await res.json();
    AVATAR_FILES = Array.isArray(data) ? data : (data.allFiles || []);
  } catch (e) {
    console.error('[OfficeConfig] Failed to load avatars.json, using fallback');
    AVATAR_FILES = ['Origin/avatar_0.webp'];
  }
}

export function avatarIndexFromId(id) {
  let hash = 0;
  const str = id || '';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % AVATAR_FILES.length;
}

// Laptop index → seat ID mapping
const DEFAULT_LAPTOP_ID_MAP = {
  0: 10, 1: 8, 2: 9, 3: 11,
  4: 0, 5: 1, 6: 2, 7: 3,
  8: 12, 9: 14, 10: 15, 11: 13,
  12: 4, 13: 5, 14: 6, 15: 7,
};

function buildRoomTemplateAssets(roomDir) {
  return {
    background: toHttpAssetPath(`office/${roomDir}/map/office_bg_32.webp`),
    foreground: toHttpAssetPath(`office/${roomDir}/map/office_fg_32.webp`),
    coordinates: toHttpAssetPath(`office/${roomDir}/map/office_xy.webp`),
    collision: toHttpAssetPath(`office/${roomDir}/map/office_collision.webp`),
    laptopSpots: toHttpAssetPath(`office/${roomDir}/objects/office_laptop.webp`),
    laptopStates: {
      down: {
        closed: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_front_close.webp`),
        open: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_front_open.webp`),
      },
      up: {
        closed: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_back_close.webp`),
        open: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_back_open.webp`),
      },
      left: {
        closed: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_left_close.webp`),
        open: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_left_open.webp`),
      },
      right: {
        closed: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_right_close.webp`),
        open: toHttpAssetPath(`office/${roomDir}/objects/office_laptop_right_open.webp`),
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
    laptopSeatMap: DEFAULT_LAPTOP_ID_MAP,
    decor: [],
  };
}

export let OFFICE_LAYOUT: any = {
  name: 'Default Office',
  mapScale: OFFICE.MAP_SCALE,
  tileSize: OFFICE.TILE_SIZE,
  roomGap: 0,
  rooms: [
    buildDefaultRoom('room1', 'rooms/room1'),
    buildDefaultRoom('room2', 'rooms/room2'),
  ],
};

export async function loadOfficeLayout() {
  try {
    const res = await fetch('/api/office-layout');
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const layout = await res.json();
    if (!layout || typeof layout !== 'object') return;

    OFFICE_LAYOUT = layout;
    if (typeof layout.mapScale === 'number' && layout.mapScale > 0) {
      OFFICE.MAP_SCALE = layout.mapScale;
    }
    if (typeof layout.tileSize === 'number' && layout.tileSize > 0) {
      OFFICE.TILE_SIZE = layout.tileSize;
    }
  } catch (e) {
    console.warn('[OfficeConfig] Failed to load custom office layout, using default:', e);
  }
}

function findRoomConfig(roomId) {
  const rooms = OFFICE_LAYOUT && Array.isArray(OFFICE_LAYOUT.rooms) ? OFFICE_LAYOUT.rooms : null;
  if (!rooms) return null;
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i] && rooms[i].id === roomId) return rooms[i];
  }
  return rooms[0] || null;
}

export function getSeatConfig(roomId, id) {
  const roomCfg = findRoomConfig(roomId);
  const seatMap = (roomCfg && roomCfg.seatMap) || DEFAULT_SEAT_MAP;
  return seatMap[id] || { dir: 'down', animType: 'sit' };
}

export function getIdleSeatEntry(roomId, id) {
  const roomCfg = findRoomConfig(roomId);
  const idleMap = (roomCfg && roomCfg.idleSeatMap) || DEFAULT_IDLE_SEAT_MAP;
  return idleMap[id];
}
