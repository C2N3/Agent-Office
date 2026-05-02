/**
 * Editor Renderer — Canvas overlay for map editor.
 * Draws grid, ghost preview, selection highlight, collision visualization.
 */

/* eslint-disable no-unused-vars */

import type { RoomTilemap, ObjectCatalog, Rotation } from '../../../shared/tilemapSchema';
import { getObjectCatalog } from '../tilemap';
import { editorState, getSelectedObject } from './editorState';

function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number } {
  if (rot === 90 || rot === 270) return { w: h, h: w };
  return { w, h };
}

/**
 * Draw editor overlay on top of the office canvas.
 * Called after Pass 3 in the render loop when editor is active.
 */
export function drawEditorOverlay(
  ctx: CanvasRenderingContext2D,
  tilemap: RoomTilemap,
  originX: number,
  originY: number,
) {
  if (!editorState.active || !tilemap) return;

  const TILE = tilemap.tileSize;
  const catalog = getObjectCatalog();
  if (!catalog) return;

  // ── Grid lines ──
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= tilemap.gridWidth; x++) {
    ctx.moveTo(originX + x * TILE, originY);
    ctx.lineTo(originX + x * TILE, originY + tilemap.gridHeight * TILE);
  }
  for (let y = 0; y <= tilemap.gridHeight; y++) {
    ctx.moveTo(originX, originY + y * TILE);
    ctx.lineTo(originX + tilemap.gridWidth * TILE, originY + y * TILE);
  }
  ctx.stroke();

  // ── Collision visualization (semi-transparent red on blocked tiles) ──
  for (let i = 0; i < tilemap.objects.length; i++) {
    const obj = tilemap.objects[i];
    const def = catalog.objects[obj.objectId];
    if (!def || !def.collision) continue;
    const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, obj.rotation);
    ctx.fillStyle = 'rgba(255, 60, 60, 0.15)';
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        ctx.fillRect(
          originX + (obj.tileX + dx) * TILE + 1,
          originY + (obj.tileY + dy) * TILE + 1,
          TILE - 2,
          TILE - 2,
        );
      }
    }
  }

  // ── Selection highlight ──
  const selected = getSelectedObject(tilemap);
  if (selected) {
    const def = catalog.objects[selected.objectId];
    if (def) {
      const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, selected.rotation);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(
        originX + selected.tileX * TILE,
        originY + selected.tileY * TILE,
        w * TILE,
        h * TILE,
      );
      ctx.setLineDash([]);

      // Object name label
      ctx.fillStyle = 'rgba(59, 130, 246, 0.85)';
      const labelX = originX + selected.tileX * TILE;
      const labelY = originY + selected.tileY * TILE - 4;
      ctx.font = '11px sans-serif';
      const text = def.name || selected.objectId;
      const metrics = ctx.measureText(text);
      ctx.fillRect(labelX, labelY - 13, metrics.width + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, labelX + 4, labelY);
    }
  }

  // ── Ghost preview (placing mode) ──
  if (editorState.ghost) {
    const g = editorState.ghost;
    const def = catalog.objects[g.objectId];
    if (def) {
      const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, g.rotation);
      ctx.fillStyle = g.valid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(
        originX + g.tileX * TILE,
        originY + g.tileY * TILE,
        w * TILE,
        h * TILE,
      );
      ctx.strokeStyle = g.valid ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        originX + g.tileX * TILE,
        originY + g.tileY * TILE,
        w * TILE,
        h * TILE,
      );

      // Object name
      ctx.fillStyle = g.valid ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
      const labelX = originX + g.tileX * TILE;
      const labelY = originY + g.tileY * TILE - 4;
      ctx.font = '11px sans-serif';
      const text = def.name || g.objectId;
      const metrics = ctx.measureText(text);
      ctx.fillRect(labelX, labelY - 13, metrics.width + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, labelX + 4, labelY);
    }
  }

  // ── Delete mode cursor indicator ──
  if (editorState.tool === 'delete' && editorState.ghost) {
    const g = editorState.ghost;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(originX + g.tileX * TILE, originY + g.tileY * TILE, TILE, TILE);
  }

  // ── Room border ──
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, tilemap.gridWidth * TILE, tilemap.gridHeight * TILE);

  ctx.restore();
}
