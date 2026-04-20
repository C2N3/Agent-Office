/**
 * Office Sprite — Sprite sheet loading, drawing, animation ticking
 * Ported from pixel_office spriteSheet.ts
 * Uses AVATAR_FILES from officeConfig.js (synced with taskbar renderer)
 */

/* eslint-disable no-unused-vars */

import { AVATAR_FILES, IDLE_ANIM_KEYS, OFFICE, SPRITE_FRAMES } from './officeConfig.js';
import { toHttpAssetPath } from '../../shared/assetPaths.js';

export let officeSkinImages: Record<string, HTMLImageElement> = {}; // filename → Image

export function loadAllOfficeSkins() {
  const ts = Date.now();
  officeSkinImages = {};
  const promises: Promise<void>[] = [];
  for (let i = 0; i < AVATAR_FILES.length; i++) {
    (function (filename) {
      const img = new Image();
      img.src = `${toHttpAssetPath(`characters/${filename}`)}?v=${ts}`;
      officeSkinImages[filename] = img;
      promises.push(new Promise<void>(function (resolve) {
        if (img.complete) { resolve(); return; }
        img.onload = function () { resolve(); };
        img.onerror = function () {
          console.error('[OfficeSprite] Failed to load:', img.src);
          resolve();
        };
      }));
    })(AVATAR_FILES[i]);
  }
  return Promise.all(promises);
}

export function getOfficeSkinImage(avatarFile) {
  return officeSkinImages[avatarFile] || officeSkinImages[AVATAR_FILES[0]];
}

export function drawOfficeSprite(ctx, agent) {
  const img = getOfficeSkinImage(agent.avatarFile);
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const frames = SPRITE_FRAMES[agent.currentAnim];
  if (!frames) return;
  const frameIdx = frames[agent.animFrame % frames.length];

  // Auto-correct for AI-generated sheets taller than expected (e.g. 2528 instead of 2520)
  const expectedHeight = OFFICE.SRC_FRAME_H * OFFICE.ROWS;
  const yOffset = Math.max(0, img.naturalHeight - expectedHeight) / 2;

  const sx = (frameIdx % OFFICE.COLS) * OFFICE.SRC_FRAME_W;
  const sy = Math.floor(frameIdx / OFFICE.COLS) * OFFICE.SRC_FRAME_H + yOffset;

  ctx.drawImage(
    img,
    sx, sy, OFFICE.SRC_FRAME_W, OFFICE.SRC_FRAME_H,
    Math.round(agent.x - OFFICE.FRAME_W / 2),
    Math.round(agent.y - OFFICE.FRAME_H),
    OFFICE.FRAME_W, OFFICE.FRAME_H
  );
}

export function isIdleAnim(key) {
  return IDLE_ANIM_KEYS.has(key);
}

export function tickOfficeAnimation(agent, deltaMs) {
  agent.animTimer += deltaMs;
  const interval = isIdleAnim(agent.currentAnim) ? OFFICE.IDLE_ANIM_INTERVAL : OFFICE.ANIM_INTERVAL;
  if (agent.animTimer >= interval) {
    agent.animTimer -= interval;
    const frames = SPRITE_FRAMES[agent.currentAnim];
    if (frames) {
      agent.animFrame = (agent.animFrame + 1) % frames.length;
    }
  }
}

export function animKeyFromDir(dir, moving) {
  if (moving) return 'walk_' + dir;
  return dir + '_idle';
}
