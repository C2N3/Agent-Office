
import { OFFICE } from './officeConfig.js';

export const rendererEffects: any = {
  spawnEffect: function (type, x, y) {
    const S = OFFICE.MAP_SCALE || 1;
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

      const S = OFFICE.MAP_SCALE || 1;
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
};
