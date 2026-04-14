/**
 * Office Renderer — Canvas render loop, layer compositing, effects.
 * Multi-room: each room has its own bg/fg/decor/laptops; characters are
 * Y-sorted across all rooms into a single pass.
 */

/* eslint-disable no-unused-vars */

import { OFFICE } from './officeConfig.js';
import { officeCharacters } from './character/index.js';
import {
  officeCoordsByRoom,
  parseRoomMapCoordinates,
  parseRoomObjectCoordinates,
} from './officeCoords.js';
import {
  buildOfficeLayers,
  officeLayers,
  officeRoomOrder,
  officeRooms,
} from './officeLayers.js';
import { officePathfinder } from './officePathfinder.js';
import { drawOfficeSprite, loadAllOfficeSkins } from './officeSprite.js';
import { drawOfficeBubble, drawOfficeNameTag } from './officeUi.js';
import { screenToWorld, setupCameraControls } from './renderer/camera.js';
import { rendererEffects } from './officeRendererEffects.js';

export const officeRenderer: any = {
  canvas: null,
  ctx: null,
  rafId: 0,
  lastTime: 0,
  effects: [],
  // Laptop images keyed by roomId: { [roomId]: { down, up, left, right } }
  laptopImagesByRoom: {} as Record<string, any>,
  laptopOpenImagesByRoom: {} as Record<string, any>,

  // Camera state for zoom/pan
  camera: { zoom: 1, panX: 0, panY: 0, minZoom: 0.15, maxZoom: 3 },
  followTarget: null as { agentId: string; zoom: number } | null,

  async init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 1. Load layers for every room
    await buildOfficeLayers();
    this._fitCanvasToContainer(true);

    // 2. Build pathfinder grid per room
    await officePathfinder.init();

    // 3. Parse coords per room
    for (let i = 0; i < officeRoomOrder.length; i++) {
      await parseRoomMapCoordinates(officeRoomOrder[i]);
    }

    // 4. Load all skins + per-room laptop images in parallel
    const directions = ['down', 'up', 'left', 'right'];
    const self = this;
    const ts = Date.now();
    const cacheBust = function (src) {
      if (!src) return src;
      const sep = src.indexOf('?') === -1 ? '?' : '&';
      return src + sep + 'v=' + ts;
    };

    const promises: Promise<unknown>[] = [loadAllOfficeSkins()];
    officeRoomOrder.forEach(function (roomId) {
      const room = officeRooms[roomId];
      const laptopStates = (room && room.assets && room.assets.laptopStates) || {};
      self.laptopImagesByRoom[roomId] = { down: null, up: null, left: null, right: null };
      self.laptopOpenImagesByRoom[roomId] = { down: null, up: null, left: null, right: null };
      directions.forEach(function (d) {
        const states = laptopStates[d] || {};
        promises.push(new Promise<void>(function (resolve) {
          if (!states.closed) return resolve();
          const img = new Image();
          img.src = cacheBust(states.closed);
          img.onload = function () { self.laptopImagesByRoom[roomId][d] = img; resolve(); };
          img.onerror = function () { resolve(); };
        }));
        promises.push(new Promise<void>(function (resolve) {
          if (!states.open) return resolve();
          const img = new Image();
          img.src = cacheBust(states.open);
          img.onload = function () { self.laptopOpenImagesByRoom[roomId][d] = img; resolve(); };
          img.onerror = function () { resolve(); };
        }));
      });
    });

    await Promise.all(promises);

    // 5. Parse laptop object coords per room
    for (let i = 0; i < officeRoomOrder.length; i++) {
      await parseRoomObjectCoordinates(officeRoomOrder[i]);
    }

    // 6. Setup wheel zoom + middle-click pan
    this._setupCameraControls(canvas);

    // 7. React to panel resizes
    this._setupResizeObserver(canvas);

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  },

  _fitCanvasToContainer: function (centerCamera) {
    const canvas = this.canvas;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.max(1, Math.round((parent && parent.clientWidth) || canvas.clientWidth || 1));
    const h = Math.max(1, Math.round((parent && parent.clientHeight) || canvas.clientHeight || 1));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (centerCamera && officeLayers.width > 0 && officeLayers.height > 0) {
      const zoomX = w / officeLayers.width;
      const zoomY = h / officeLayers.height;
      const fitZoom = Math.min(zoomX, zoomY);
      this.camera.zoom = Math.max(this.camera.minZoom, Math.min(fitZoom, this.camera.maxZoom));
      this.camera.panX = (w - officeLayers.width * this.camera.zoom) / 2;
      this.camera.panY = (h - officeLayers.height * this.camera.zoom) / 2;
    }
  },

  _setupResizeObserver: function (canvas) {
    const self = this;
    const target = canvas.parentElement || canvas;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(function () {
        self._fitCanvasToContainer(false);
      });
      ro.observe(target);
      this._resizeObserver = ro;
    } else {
      const onResize = function () { self._fitCanvasToContainer(false); };
      window.addEventListener('resize', onResize);
      this._onWindowResize = onResize;
    }
  },

  _setupCameraControls: function (canvas) {
    setupCameraControls(this, canvas, officeLayers);
  },

  screenToWorld: function (clientX, clientY) {
    return screenToWorld(this, clientX, clientY);
  },

  focusOnCharacter: function (agentId, opts) {
    const options = opts || {};
    const char = officeCharacters.characters.get(agentId);
    if (!char || !this.canvas) return false;

    const cam = this.camera;
    const requested = typeof options.zoom === 'number' ? options.zoom : 0.7;
    const targetZoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, requested));
    this.followTarget = { agentId, zoom: targetZoom };
    return true;
  },

  clearFollow: function () {
    this.followTarget = null;
  },

  _updateFollow: function (deltaMs) {
    const follow = this.followTarget;
    if (!follow || !this.canvas) return;
    const char = officeCharacters.characters.get(follow.agentId);
    if (!char) { this.followTarget = null; return; }

    const cam = this.camera;
    const alpha = 1 - Math.pow(0.001, deltaMs / 1000);
    cam.zoom += (follow.zoom - cam.zoom) * alpha;
    const targetPanX = this.canvas.width / 2 - char.x * cam.zoom;
    const targetPanY = this.canvas.height / 2 - char.y * cam.zoom;
    cam.panX += (targetPanX - cam.panX) * alpha;
    cam.panY += (targetPanY - cam.panY) * alpha;
  },

  stop: function () {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  },

  resume: function () {
    if (this.rafId) return;
    if (!this.canvas) return;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  },

  loop: function (now) {
    const self = this;
    self.rafId = requestAnimationFrame(function (t) { self.loop(t); });
    const deltaMs = Math.min(now - self.lastTime, 100);
    self.lastTime = now;
    self.update(deltaMs);
    self.render();
  },

  update: function (deltaMs) {
    const deltaSec = deltaMs / 1000;
    officeCharacters.updateAll(deltaSec, deltaMs);
    this._updateFollow(deltaMs);
    this.updateEffects(deltaMs);
  },

  render: function () {
    if (!this.ctx || !officeLayers.ready || officeRoomOrder.length === 0) return;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.camera.panX, this.camera.panY);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    const chars = officeCharacters.getCharacterArray();
    const MAP_SCALE = OFFICE.MAP_SCALE || 1;

    // Pass 1: backgrounds + decor-before + laptops per room
    for (let i = 0; i < officeRoomOrder.length; i++) {
      const roomId = officeRoomOrder[i];
      const room = officeRooms[roomId];
      if (!room) continue;

      if (room.bgImage) {
        ctx.drawImage(room.bgImage, room.originX, room.originY, room.width, room.height);
      }
      this._drawDecorItems(ctx, room.decorBefore);

      const coords = officeCoordsByRoom[roomId];
      const laptopSpots = (coords && coords.laptopSpots) || [];
      const seatMap = room.laptopSeatMap || {};
      const lpClosed = this.laptopImagesByRoom[roomId] || {};
      const lpOpen = this.laptopOpenImagesByRoom[roomId] || {};

      for (let si = 0; si < laptopSpots.length; si++) {
        const spot = laptopSpots[si];
        const seatId = seatMap[si] !== undefined ? seatMap[si] : si;
        const isAtDesk = chars.some(function (a) {
          return a.roomId === roomId && a.deskIndex === seatId &&
            (a.agentState === 'working' || a.agentState === 'thinking' ||
             a.agentState === 'error' || a.agentState === 'help');
        });

        const img = isAtDesk ? lpOpen[spot.dir] : lpClosed[spot.dir];
        if (img) {
          ctx.drawImage(img, spot.x, spot.y, img.naturalWidth * MAP_SCALE, img.naturalHeight * MAP_SCALE);
        }
      }
    }

    // Pass 2: all characters Y-sorted in world space
    const sorted = chars.slice().sort(function (a, b) { return a.y - b.y; });
    for (let j = 0; j < sorted.length; j++) {
      const agent = sorted[j];

      if (agent.agentState === 'error') {
        if (Math.random() < 0.1) this.spawnEffect('warning', agent.x, agent.y - OFFICE.FRAME_H - 5);
      }

      const isSubType = agent.metadata && agent.metadata.type === 'sub';
      const baseScale = isSubType ? 0.85 : 1.0;

      const isOffline = agent.agentState === 'offline';
      if (isOffline) ctx.globalAlpha = 0.35;

      ctx.save();
      ctx.translate(agent.x, agent.y);
      ctx.scale(baseScale, baseScale);
      ctx.translate(-agent.x, -agent.y);
      drawOfficeSprite(ctx, agent);
      ctx.restore();

      drawOfficeNameTag(ctx, agent);
      if (!isOffline) drawOfficeBubble(ctx, agent);

      if (isOffline) ctx.globalAlpha = 1.0;
    }

    // Pass 3: foregrounds + decor-after per room
    for (let i = 0; i < officeRoomOrder.length; i++) {
      const roomId = officeRoomOrder[i];
      const room = officeRooms[roomId];
      if (!room) continue;
      if (room.fgImage && room.fgImage.complete && room.fgImage.naturalWidth > 0) {
        ctx.drawImage(room.fgImage, room.originX, room.originY, room.width, room.height);
      }
      this._drawDecorItems(ctx, room.decorAfter);
    }

    // Effects
    this.renderEffects(ctx);

    ctx.restore();
  },

  ...rendererEffects,

  _drawDecorItems: function (ctx, items) {
    if (!Array.isArray(items) || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !item.image || !item.image.complete || item.image.naturalWidth <= 0) continue;

      const alpha = typeof item.alpha === 'number' ? item.alpha : 1;
      const scale = (typeof item.scale === 'number' ? item.scale : 1) * ((OFFICE && OFFICE.MAP_SCALE) || 1);
      const width = item.width || item.image.naturalWidth * scale;
      const height = item.height || item.image.naturalHeight * scale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(item.image, item.x, item.y, width, height);
      ctx.restore();
    }
  },
};
