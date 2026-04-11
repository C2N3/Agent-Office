// @ts-nocheck
/**
 * Office Coords — Parse office_xy.webp and office_laptop.webp for coordinates
 * Ported from pixel_office coordinateParser.ts
 */

/* eslint-disable no-unused-vars */

import { OFFICE, OFFICE_LAYOUT } from './officeConfig.js';
import { loadOfficeImage } from './officeLayers.js';

export const officeCoords: any = {
  idle: [],
  desk: [],
  laptopSpots: [],
};

export async function parseMapCoordinates(bgW, bgH) {
  const assets = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.assets) || {};
  const src = assets.coordinates || '/public/office/map/office_xy.webp';
  const sep = src.indexOf('?') === -1 ? '?' : '&';
  const img = await loadOfficeImage(src + sep + 't=' + Date.now());
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const scaleX = bgW / canvas.width;
  const scaleY = bgH / canvas.height;

  const THRESHOLD = 80;
  const TILE = OFFICE.TILE_SIZE;
  const tempIdle: any[] = [];
  const tempDesk: any[] = [];
  const tempMeeting: any[] = [];
  const seenGrid: Record<string, boolean> = {};

  function colorMatch(r, g, b, tr, tg, tb) {
    return Math.abs(r - tr) < THRESHOLD && Math.abs(g - tg) < THRESHOLD && Math.abs(b - tb) < THRESHOLD;
  }

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      const mapX = x * scaleX;
      const mapY = y * scaleY;
      const gx = Math.floor(mapX / TILE);
      const gy = Math.floor(mapY / TILE);
      const key = gx + ',' + gy;

      if (seenGrid[key]) continue;
      seenGrid[key] = true;

      const finalX = gx * TILE + Math.floor(TILE / 2);
      const finalY = gy * TILE + TILE;

      if (colorMatch(r, g, b, 0, 255, 0) || colorMatch(r, g, b, 0, 0, 0)) {
        tempIdle.push({ x: finalX, y: finalY });
      } else if (colorMatch(r, g, b, 0, 0, 255)) {
        tempDesk.push({ x: finalX, y: finalY });
      } else if (colorMatch(r, g, b, 255, 255, 0)) {
        tempMeeting.push({ x: finalX, y: finalY });
      }
    }
  }

  let globalId = 0;
  officeCoords.desk = [];
  officeCoords.idle = [];

  tempDesk.forEach(function (p) {
    officeCoords.desk.push({ x: p.x, y: p.y, id: globalId++, type: 'desk' });
  });
  tempMeeting.forEach(function (p) {
    officeCoords.desk.push({ x: p.x, y: p.y, id: globalId++, type: 'meeting' });
  });
  tempIdle.forEach(function (p) {
    officeCoords.idle.push({ x: p.x, y: p.y, id: globalId++, type: 'idle' });
  });

  return officeCoords;
}

export async function parseObjectCoordinates(bgW, bgH) {
  const assets = (typeof OFFICE_LAYOUT !== 'undefined' && OFFICE_LAYOUT.assets) || {};
  const src = assets.laptopSpots || '/public/office/ojects/office_laptop.webp';
  const sep = src.indexOf('?') === -1 ? '?' : '&';
  const img = await loadOfficeImage(src + sep + 't=' + Date.now());
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const scaleX = bgW / canvas.width;
  const scaleY = bgH / canvas.height;

  const THRESHOLD = 80;
  const TILE = OFFICE.TILE_SIZE;
  const spots: any[] = [];
  const seenGrid: Record<string, boolean> = {};

  function colorMatch(r, g, b, tr, tg, tb) {
    return Math.abs(r - tr) < THRESHOLD && Math.abs(g - tg) < THRESHOLD && Math.abs(b - tb) < THRESHOLD;
  }

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      let dir = null;
      if (colorMatch(r, g, b, 255, 128, 0)) dir = 'left';
      else if (colorMatch(r, g, b, 0, 255, 255)) dir = 'down';
      else if (colorMatch(r, g, b, 255, 0, 255)) dir = 'up';
      else if (colorMatch(r, g, b, 0, 0, 255)) dir = 'right';
      else continue;

      const mapX = x * scaleX;
      const mapY = y * scaleY;
      const gx = Math.floor(mapX / TILE);
      const gy = Math.floor(mapY / TILE);
      const key = gx + ',' + gy;
      if (seenGrid[key]) continue;
      seenGrid[key] = true;

      spots.push({ x: gx * TILE, y: gy * TILE, dir: dir });
    }
  }

  officeCoords.laptopSpots = spots;
  return spots;
}
