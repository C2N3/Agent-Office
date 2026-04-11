// @ts-nocheck
/**
 * Office Renderer — Canvas render loop, layer compositing, effects
 * Ported from pixel_office renderer.ts (rendering parts)
 */

/* eslint-disable no-unused-vars */

import { OFFICE, OFFICE_LAYOUT } from './officeConfig.js';
import { officeCharacters } from './character/index.js';
import { officeCoords, parseMapCoordinates, parseObjectCoordinates } from './officeCoords.js';
import { buildOfficeLayers, officeLayers } from './officeLayers.js';
import { officePathfinder } from './officePathfinder.js';
import { drawOfficeSprite, loadAllOfficeSkins } from './officeSprite.js';
import { drawOfficeBubble, drawOfficeNameTag } from './officeUi.js';
import { screenToWorld, setupCameraControls } from './renderer/camera.js';

export const officeRenderer: any = {
  canvas: null,
  ctx: null,
  rafId: 0,
  lastTime: 0,
  effects: [],
  laptopImages: { down: null, up: null, left: null, right: null },
  laptopOpenImages: { down: null, up: null, left: null, right: null },

  // Camera state for zoom/pan
  camera: { zoom: 1, panX: 0, panY: 0, minZoom: 0.15, maxZoom: 3 },

  async init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 1. Load layers (bg/fg)
    await buildOfficeLayers();
    // Canvas internal buffer follows the panel size so the map renders at
    // its native resolution and a larger panel reveals more of the world
    // (instead of stretching the same pixels). _fitCanvasToContainer also
    // centers the map on the first sizing pass.
    this._fitCanvasToContainer(true);

    // 2. Build pathfinder
    await officePathfinder.init(officeLayers.width, officeLayers.height);

    // 3. Parse coordinates
    await parseMapCoordinates(officeLayers.width, officeLayers.height);

    // 4. Load all skins + laptop images in parallel
    const directions = ['down', 'up', 'left', 'right'];
    const self = this;
    const ts = Date.now();
    const laptopStates = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.assets && OFFICE_LAYOUT.assets.laptopStates) || {};
    const cacheBust = function (src) {
      const sep = src.indexOf('?') === -1 ? '?' : '&';
      return src + sep + 'v=' + ts;
    };

    const promises = [loadAllOfficeSkins()];
    directions.forEach(function (d) {
      const states = laptopStates[d] || {};
      promises.push(new Promise<void>(function (resolve) {
        const img = new Image();
        img.src = cacheBust(states.closed || '');
        img.onload = function () { self.laptopImages[d] = img; resolve(); };
        img.onerror = function () { resolve(); };
      }));
      promises.push(new Promise<void>(function (resolve) {
        const img = new Image();
        img.src = cacheBust(states.open || '');
        img.onload = function () { self.laptopOpenImages[d] = img; resolve(); };
        img.onerror = function () { resolve(); };
      }));
    });

    await Promise.all(promises);

    // 5. Parse laptop object coords
    await parseObjectCoordinates(officeLayers.width, officeLayers.height);

    // 6. Setup wheel zoom + middle-click pan
    this._setupCameraControls(canvas);

    // 7. React to panel resizes (window resize, splitter drag, etc.)
    this._setupResizeObserver(canvas);

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  },

  _fitCanvasToContainer: function (centerCamera) {
    const canvas = this.canvas;
    if (!canvas) return;
    const parent = canvas.parentElement;
    // Fall back to the canvas's own client size if no parent is available.
    const w = Math.max(1, Math.round((parent && parent.clientWidth) || canvas.clientWidth || 1));
    const h = Math.max(1, Math.round((parent && parent.clientHeight) || canvas.clientHeight || 1));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (centerCamera) {
      // Center the world inside the canvas at zoom=1 so the map sits in
      // the middle and any extra panel space is visible around it.
      this.camera.panX = (w - officeLayers.width) / 2;
      this.camera.panY = (h - officeLayers.height) / 2;
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
      // Fallback for environments without ResizeObserver.
      const onResize = function () { self._fitCanvasToContainer(false); };
      window.addEventListener('resize', onResize);
      this._onWindowResize = onResize;
    }
  },

  _setupCameraControls: function (canvas) {
    setupCameraControls(this, canvas, officeLayers);
  },

  /** Convert screen (client) coordinates to world (canvas) coordinates */
  screenToWorld: function (clientX, clientY) {
    return screenToWorld(this, clientX, clientY);
  },

  stop: function () {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  },

  resume: function () {
    if (this.rafId) return; // already running
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
    this.updateEffects(deltaMs);
  },

  render: function () {
    if (!this.ctx || !officeLayers.bgImage) return;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transform
    ctx.save();
    ctx.translate(this.camera.panX, this.camera.panY);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 1. Background (drawn at native world size; camera transform handles fit)
    ctx.drawImage(officeLayers.bgImage, 0, 0, officeLayers.width, officeLayers.height);

    // 2. Static decor behind agents
    this._drawDecorItems(ctx, officeLayers.decorBefore);

    // 3. Laptops
    const laptopSpots = officeCoords.laptopSpots || [];
    const chars = officeCharacters.getCharacterArray();
    for (let i = 0; i < laptopSpots.length; i++) {
      const spot = laptopSpots[i];
      const seatMap = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.laptopSeatMap) || {};
      const seatId = seatMap[i] !== undefined ? seatMap[i] : i;

      const isAtDesk = chars.some(function (a) {
        return a.deskIndex === seatId &&
          (a.agentState === 'working' || a.agentState === 'thinking' ||
           a.agentState === 'error' || a.agentState === 'help');
      });

      const img = isAtDesk ? this.laptopOpenImages[spot.dir] : this.laptopImages[spot.dir];
      if (img) {
        const ls = OFFICE.MAP_SCALE || 1;
        ctx.drawImage(img, spot.x, spot.y, img.naturalWidth * ls, img.naturalHeight * ls);
      }
    }

    // 4. Characters (Y-sorted)
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

    // 5. Foreground (drawn at native world size to match background)
    if (officeLayers.fgImage && officeLayers.fgImage.complete && officeLayers.fgImage.naturalWidth > 0) {
      ctx.drawImage(officeLayers.fgImage, 0, 0, officeLayers.width, officeLayers.height);
    }

    // 6. Static decor above agents
    this._drawDecorItems(ctx, officeLayers.decorAfter);

    // 7. Effects
    this.renderEffects(ctx);

    // Restore camera transform
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
