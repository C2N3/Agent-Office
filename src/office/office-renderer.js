/**
 * Office Renderer — Canvas render loop, layer compositing, effects
 * Ported from pixel_office renderer.ts (rendering parts)
 */

/* eslint-disable no-unused-vars */

var officeRenderer = {
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
    canvas.width = officeLayers.width;
    canvas.height = officeLayers.height;

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
      promises.push(new Promise(function (resolve) {
        const img = new Image();
        img.src = cacheBust(states.closed || '');
        img.onload = function () { self.laptopImages[d] = img; resolve(); };
        img.onerror = function () { resolve(); };
      }));
      promises.push(new Promise(function (resolve) {
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

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  },

  _setupCameraControls: function (canvas) {
    const cam = this.camera;

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width * canvas.width;
      const mouseY = (e.clientY - rect.top) / rect.height * canvas.height;

      const oldZoom = cam.zoom;
      const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
      cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * zoomDelta));

      // Zoom towards mouse position
      const zoomRatio = cam.zoom / oldZoom;
      cam.panX = mouseX - (mouseX - cam.panX) * zoomRatio;
      cam.panY = mouseY - (mouseY - cam.panY) * zoomRatio;
    }, { passive: false });

    // Left-click or middle-click drag to pan
    var dragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0, dragMoved = false;

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        dragging = true;
        dragMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = cam.panX;
        panStartY = cam.panY;
        canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      var rect = canvas.getBoundingClientRect();
      cam.panX = panStartX + (dx / rect.width * canvas.width) / cam.zoom;
      cam.panY = panStartY + (dy / rect.height * canvas.height) / cam.zoom;
    });

    window.addEventListener('mouseup', function (e) {
      if ((e.button === 0 || e.button === 1) && dragging) {
        dragging = false;
        canvas.style.cursor = '';
      }
    });

    // Suppress click event if user was dragging (prevent popover on drag release)
    canvas.addEventListener('click', function (e) {
      if (dragMoved) {
        e.stopImmediatePropagation();
        dragMoved = false;
      }
    }, true);

    // Double-click to reset zoom
    canvas.addEventListener('dblclick', function () {
      cam.zoom = 1;
      cam.panX = 0;
      cam.panY = 0;
    });
  },

  /** Convert screen (client) coordinates to world (canvas) coordinates */
  screenToWorld: function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var canvasX = (clientX - rect.left) / rect.width * this.canvas.width;
    var canvasY = (clientY - rect.top) / rect.height * this.canvas.height;
    return {
      x: (canvasX - this.camera.panX) / this.camera.zoom,
      y: (canvasY - this.camera.panY) / this.camera.zoom,
    };
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
    var ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transform
    ctx.save();
    ctx.translate(this.camera.panX, this.camera.panY);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 1. Background (scaled to canvas size)
    ctx.drawImage(officeLayers.bgImage, 0, 0, this.canvas.width, this.canvas.height);

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
        var ls = OFFICE.MAP_SCALE || 1;
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

      var isOffline = agent.agentState === 'offline';
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

    // 5. Foreground (scaled to canvas size)
    if (officeLayers.fgImage && officeLayers.fgImage.complete && officeLayers.fgImage.naturalWidth > 0) {
      ctx.drawImage(officeLayers.fgImage, 0, 0, this.canvas.width, this.canvas.height);
    }

    // 6. Static decor above agents
    this._drawDecorItems(ctx, officeLayers.decorAfter);

    // 7. Effects
    this.renderEffects(ctx);

    // Restore camera transform
    ctx.restore();
  },

  spawnEffect: function (type, x, y) {
    var S = OFFICE.MAP_SCALE || 1;
    const id = Math.random().toString(36).substr(2, 9);
    const now = performance.now();

    if (type === 'confetti') {
      const colors = ['#ff4d4d', '#ffeb3b', '#4caf50', '#2196f3', '#e91e63', '#9c27b0'];
      for (let i = 0; i < 20; i++) {
        this.effects.push({
          id: id + i, type: type,
          x: x + (Math.random() - 0.5) * 10 * S, y: y - 5 * S,
          vx: (Math.random() - 0.5) * 6 * S, vy: (-Math.random() * 8 - 2) * S,
          rotation: Math.random() * Math.PI * 2,
          vRotation: (Math.random() - 0.5) * 0.4,
          startTime: now, duration: 1500 + Math.random() * 1000,
          alpha: 1, scale: (0.6 + Math.random() * 0.8) * S,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    } else if (type === 'warning') {
      this.effects.push({
        id: id, type: type, x: x, y: y,
        vx: 0, vy: -0.2 * S, rotation: 0, vRotation: 0,
        startTime: now, duration: 1200, alpha: 1, scale: S,
      });
    } else if (type === 'focus') {
      this.effects.push({
        id: id, type: type,
        x: x + (Math.random() - 0.5) * 15 * S, y: y + (Math.random() - 0.5) * 10 * S,
        vx: (Math.random() - 0.5) * 0.3 * S, vy: (-0.4 - Math.random() * 0.4) * S,
        rotation: (Math.random() - 0.5) * 0.2,
        vRotation: (Math.random() - 0.5) * 0.05,
        startTime: now, duration: 1000 + Math.random() * 500,
        alpha: 1, scale: (0.8 + Math.random() * 0.4) * S,
        color: Math.random() > 0.5 ? '#00f2ff' : '#00ffaa',
      });
    } else if (type === 'stateChange') {
      this.effects.push({
        id: id, type: type, x: x, y: y,
        vx: 0, vy: 0, rotation: 0, vRotation: 0,
        startTime: now, duration: 600, alpha: 1, scale: 0.3 * S,
        color: arguments[3] || '#f97316', // 4th argument = color
      });
    }
  },

  updateEffects: function (deltaMs) {
    const now = performance.now();
    this.effects = this.effects.filter(function (fx) {
      const elapsed = now - fx.startTime;
      if (elapsed > fx.duration) return false;
      fx.alpha = 1 - (elapsed / fx.duration);
      fx.x += fx.vx * (deltaMs / 16);
      fx.y += fx.vy * (deltaMs / 16);
      fx.rotation += fx.vRotation * (deltaMs / 16);
      if (fx.type === 'confetti') {
        fx.vy += 0.15;
        fx.vx *= 0.98;
      } else if (fx.type === 'focus') {
        fx.vy -= 0.02;
      }
      return true;
    });
  },

  renderEffects: function (ctx) {
    for (let i = 0; i < this.effects.length; i++) {
      const fx = this.effects[i];
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(fx.rotation);
      ctx.scale(fx.scale, fx.scale);
      ctx.globalAlpha = fx.alpha;

      var S = OFFICE.MAP_SCALE || 1;
      if (fx.type === 'confetti') {
        ctx.fillStyle = fx.color || '#fff';
        ctx.fillRect(-2, -3, 4, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-2, -3, 2, 2);
      } else if (fx.type === 'warning') {
        const size = Math.round(24 * S);
        const wobble = Math.sin(performance.now() * 0.02) * 3 * S;
        ctx.translate(wobble, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this._drawTri(ctx, 2, 2, size);
        ctx.fillStyle = '#ffcc00';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.round(2 * S);
        this._drawTri(ctx, 0, 0, size);
        ctx.fill();
        ctx.stroke();
        ctx.font = 'bold ' + Math.round(16 * S) + 'px Arial';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, Math.round(7 * S));
      } else if (fx.type === 'focus') {
        ctx.fillStyle = fx.color || '#fff';
        ctx.font = 'bold ' + Math.round(9 * S) + 'px "Courier New", monospace';
        ctx.textAlign = 'center';
        const chars = ['0', '1', '{', '}', ';', '>', '_'];
        const charIdx = parseInt(fx.id.slice(-1), 36) % chars.length;
        ctx.fillText(chars[charIdx], 0, 0);
        ctx.shadowBlur = Math.round(4 * S);
        ctx.shadowColor = fx.color || '#fff';
        ctx.fillText(chars[charIdx], 0, 0);
      } else if (fx.type === 'stateChange') {
        const elapsed = performance.now() - fx.startTime;
        const t = elapsed / fx.duration;
        const radius = (8 + t * 20) * S;
        ctx.strokeStyle = fx.color || '#f97316';
        ctx.lineWidth = 2 * S * (1 - t);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  },

  _drawTri: function (ctx, x, y, size) {
    const h = size * (Math.sqrt(3) / 2);
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2 - 2);
    ctx.lineTo(x + size / 2 + 2, y + h / 2);
    ctx.lineTo(x - size / 2 - 2, y + h / 2);
    ctx.closePath();
  },

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
