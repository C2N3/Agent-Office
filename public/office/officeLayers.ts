/**
 * Office Layers — Background/foreground image loading
 * Ported from pixel_office layerCache.ts
 */

/* eslint-disable no-unused-vars */

import { OFFICE, OFFICE_LAYOUT } from './officeConfig.js';

export function loadOfficeImage(src) {
  return new Promise<HTMLImageElement>(function (resolve) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () {
      console.warn('[OfficeLayers] Failed to load:', src);
      const blank = new Image();
      blank.width = 800;
      blank.height = 800;
      resolve(blank);
    };
    img.src = src;
  });
}

export const officeLayers: any = {
  bgImage: null,
  fgImage: null,
  decorBefore: [],
  decorAfter: [],
  width: 0,
  height: 0,
};

export async function loadOfficeDecorItems() {
  const decor = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.decor) || [];
  const loaded = await Promise.all(decor.map(async function (item) {
    return {
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      scale: item.scale,
      alpha: item.alpha,
      layer: item.layer || 'bg',
      image: await loadOfficeImage(item.src),
    };
  }));

  officeLayers.decorBefore = loaded.filter(function (item) { return item.layer !== 'fg'; });
  officeLayers.decorAfter = loaded.filter(function (item) { return item.layer === 'fg'; });
}

export async function buildOfficeLayers() {
  const ts = Date.now();
  const assets = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.assets) || {};
  const bgSrc = assets.background || '/public/office/map/office_bg_32.webp';
  const fgSrc = assets.foreground || '/public/office/map/office_fg_32.webp';
  const cacheBust = function (src) {
    const sep = src.indexOf('?') === -1 ? '?' : '&';
    return src + sep + 't=' + ts;
  };

  const loaded = await Promise.all([
    loadOfficeImage(cacheBust(bgSrc)),
    loadOfficeImage(cacheBust(fgSrc)),
    loadOfficeDecorItems(),
  ]);
  const bgImg = loaded[0];
  const fgImg = loaded[1];

  officeLayers.bgImage = bgImg;
  officeLayers.fgImage = fgImg;
  const scale = (typeof OFFICE !== 'undefined' && OFFICE.MAP_SCALE) || 1;
  officeLayers.width = Math.round((bgImg.naturalWidth || 800) * scale);
  officeLayers.height = Math.round((bgImg.naturalHeight || 800) * scale);

  return officeLayers;
}
