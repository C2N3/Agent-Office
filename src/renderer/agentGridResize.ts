
import { SHEET } from './config.js';
import { getSpriteYOffset } from './animationManager.js';

export function drawFrameOn(el, frameIndex) {
  if (!el) return;
  const col = frameIndex % SHEET.cols;
  const row = Math.floor(frameIndex / SHEET.cols);
  const yOff = getSpriteYOffset(el);
  el.style.backgroundPosition = `${col * -SHEET.width}px ${row * -SHEET.height - yOff}px`;
}

// Window resize — debounce (restarts on each call, uses latest size)
let _resizeTimer = null;
export function requestDynamicResize() {
  if (!window.electronAPI || !window.electronAPI.resizeWindow) return;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    _resizeTimer = null;
    const grid = document.getElementById('agent-grid');
    if (!grid) return;
    const width = grid.scrollWidth;
    const height = grid.scrollHeight;
    if (width < 100 || height < 100) return;
    window.electronAPI.resizeWindow({ width, height });
  }, 100);
}
