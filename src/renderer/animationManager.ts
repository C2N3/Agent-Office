/**
 * Animation Manager — rAF loop, drawFrame, playAnimation
 */

import { SHEET, ANIM_SEQUENCES, agentStates } from './config.js';

// Cache sprite sheet Y-offsets for images taller than expected (e.g. AI generates 2528 instead of 2520)
// Offset is stored in CSS display pixels (base scale, not source pixels)
const spriteYOffsetCache = new Map(); // backgroundImage → offset in display px

export function getSpriteYOffset(element) {
  const bg = element.style.backgroundImage;
  if (spriteYOffsetCache.has(bg)) return spriteYOffsetCache.get(bg);

  const match = bg.match(/url\(["']?(.+?)["']?\)/);
  if (!match) return 0;

  const img = new Image();
  img.src = match[1];
  if (img.complete && img.naturalHeight > 0) {
    const expectedSrcHeight = SHEET.srcHeight * SHEET.rows;
    const srcOffset = Math.max(0, img.naturalHeight - expectedSrcHeight) / 2;
    const displayOffset = srcOffset * (SHEET.height / SHEET.srcHeight);
    spriteYOffsetCache.set(bg, displayOffset);
    return displayOffset;
  }

  img.onload = () => {
    const expectedSrcHeight = SHEET.srcHeight * SHEET.rows;
    const srcOffset = Math.max(0, img.naturalHeight - expectedSrcHeight) / 2;
    const displayOffset = srcOffset * (SHEET.height / SHEET.srcHeight);
    spriteYOffsetCache.set(bg, displayOffset);
  };
  return 0;
}

export const animationManager = {
  animations: new Map(), // agentId -> { agentId, element, animName, sequence, frameIdx, lastTime, rafId, scale }

  start(agentId, element, animName, scale = 1.0) {
    // Skip if the same animation is already running (avoid rAF interruption -> flickering)
    const existing = this.animations.get(agentId);
    if (existing && existing.animName === animName && existing.scale === scale) return;

    this.stop(agentId);

    const sequence = ANIM_SEQUENCES[animName];
    if (!sequence) return;

    // Draw first frame immediately
    const firstFrame = sequence.frames[0];
    const col = firstFrame % SHEET.cols;
    const row = Math.floor(firstFrame / SHEET.cols);
    const yOff = getSpriteYOffset(element) * scale;
    const x = col * -SHEET.width * scale;
    const y = row * -SHEET.height * scale - yOff;
    element.style.backgroundPosition = `${x}px ${y}px`;

    const animation = {
      agentId,
      element,
      animName,
      sequence,
      scale,
      frameIdx: 0,
      lastTime: performance.now(),
      rafId: null
    };

    this.animations.set(agentId, animation);
    this.loop(agentId);
  },

  loop(agentId) {
    const animation = this.animations.get(agentId);
    if (!animation) return;

    animation.rafId = requestAnimationFrame((currentTime) => {
      if (!this.animations.has(agentId)) {
        return;
      }

      const targetFPS = animation.sequence.fps;
      const frameDuration = 1000 / targetFPS;

      if (currentTime - animation.lastTime >= frameDuration) {
        animation.frameIdx++;

        if (animation.frameIdx >= animation.sequence.frames.length) {
          if (animation.sequence.loop) {
            animation.frameIdx = 0;
          } else {
            this.stop(agentId);
            return;
          }
        }

        const frameNum = animation.sequence.frames[animation.frameIdx];
        const col = frameNum % SHEET.cols;
        const row = Math.floor(frameNum / SHEET.cols);
        const s = animation.scale;
        const yOff = getSpriteYOffset(animation.element) * s;
        const x = col * -SHEET.width * s;
        const y = row * -SHEET.height * s - yOff;
        animation.element.style.backgroundPosition = `${x}px ${y}px`;

        animation.lastTime = currentTime;
      }

      this.loop(agentId);
    });
  },

  stop(agentId) {
    const animation = this.animations.get(agentId);
    if (animation) {
      if (animation.rafId) {
        cancelAnimationFrame(animation.rafId);
      }
      this.animations.delete(agentId);
    }

    const state = agentStates.get(agentId);
    if (state && state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
  }
};

export function drawFrame(element, frameIndex, scale = 1.0) {
  if (!element) return;
  const col = frameIndex % SHEET.cols;
  const row = Math.floor(frameIndex / SHEET.cols);
  const yOff = getSpriteYOffset(element) * scale;
  const x = col * -SHEET.width * scale;
  const y = row * -SHEET.height * scale - yOff;
  element.style.backgroundPosition = `${x}px ${y}px`;
}

export function playAnimation(agentId, element, animName, scale = 1.0) {
  animationManager.start(agentId, element, animName, scale);

  const state = agentStates.get(agentId) || {};
  state.animName = animName;
  agentStates.set(agentId, state);
}
