/**
 * Editor State — Manages map editor mode: object placement, selection,
 * rotation, deletion, floor type, and undo.
 */

/* eslint-disable no-unused-vars */

import type { RoomTilemap, PlacedObject, ObjectCatalog, ObjectDef, Rotation } from '../../../shared/tilemapSchema';
import { getObjectCatalog } from '../tilemap';

// ── Editor mode ──

export type EditorTool = 'select' | 'place' | 'delete';

export interface EditorSelection {
  objectInstanceId: string;   // PlacedObject.id
}

export interface GhostPreview {
  objectId: string;           // catalog key
  tileX: number;
  tileY: number;
  rotation: Rotation;
  valid: boolean;             // false if overlapping / out of bounds
}

export const editorState = {
  active: false,
  tool: 'select' as EditorTool,
  roomId: '' as string,
  tilemapId: '' as string,   // key for save/load API

  // Currently selected placed object
  selection: null as EditorSelection | null,

  // Ghost preview while placing
  ghost: null as GhostPreview | null,

  // Object to place (catalog key)
  placingObjectId: null as string | null,
  placingRotation: 0 as Rotation,

  // Floor type for current room
  floorType: 'wood' as string,

  // Undo stack (snapshots of objects array)
  undoStack: [] as PlacedObject[][],
  maxUndo: 30,

  // ── Methods ──

  toggle(roomId: string, tilemapId?: string) {
    this.active = !this.active;
    this.roomId = roomId;
    this.tilemapId = tilemapId || roomId;
    if (!this.active) {
      this.selection = null;
      this.ghost = null;
      this.placingObjectId = null;
      this.tool = 'select';
    }
  },

  setTool(tool: EditorTool) {
    this.tool = tool;
    if (tool !== 'place') {
      this.ghost = null;
      this.placingObjectId = null;
    }
    if (tool !== 'select') {
      this.selection = null;
    }
  },

  startPlacing(objectId: string) {
    this.tool = 'place';
    this.placingObjectId = objectId;
    this.placingRotation = 0;
    this.selection = null;
  },

  rotatePlacing() {
    this.placingRotation = ((this.placingRotation + 90) % 360) as Rotation;
    if (this.ghost) {
      this.ghost.rotation = this.placingRotation;
    }
  },

  rotateSelection(tilemap: RoomTilemap) {
    if (!this.selection) return;
    const obj = findObject(tilemap, this.selection.objectInstanceId);
    if (!obj) return;
    const catalog = getObjectCatalog();
    const def = catalog && catalog.objects[obj.objectId];
    if (def && def.rotatable === false) return;
    this._pushUndo(tilemap);
    obj.rotation = ((obj.rotation + 90) % 360) as Rotation;
  },

  updateGhost(tileX: number, tileY: number, tilemap: RoomTilemap) {
    if (!this.placingObjectId) return;
    const catalog = getObjectCatalog();
    const def = catalog && catalog.objects[this.placingObjectId];
    if (!def) return;

    const valid = canPlace(tilemap, this.placingObjectId, tileX, tileY, this.placingRotation);
    this.ghost = {
      objectId: this.placingObjectId,
      tileX,
      tileY,
      rotation: this.placingRotation,
      valid,
    };
  },

  placeObject(tilemap: RoomTilemap): PlacedObject | null {
    if (!this.ghost || !this.ghost.valid) return null;
    this._pushUndo(tilemap);
    const id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const placed: PlacedObject = {
      id,
      objectId: this.ghost.objectId,
      tileX: this.ghost.tileX,
      tileY: this.ghost.tileY,
      rotation: this.ghost.rotation,
    };
    tilemap.objects.push(placed);
    return placed;
  },

  selectAt(tilemap: RoomTilemap, tileX: number, tileY: number): boolean {
    const catalog = getObjectCatalog();
    if (!catalog) return false;

    // Search in reverse order (top-most first)
    for (let i = tilemap.objects.length - 1; i >= 0; i--) {
      const obj = tilemap.objects[i];
      const def = catalog.objects[obj.objectId];
      if (!def) continue;
      const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, obj.rotation);
      if (tileX >= obj.tileX && tileX < obj.tileX + w &&
          tileY >= obj.tileY && tileY < obj.tileY + h) {
        this.selection = { objectInstanceId: obj.id };
        return true;
      }
    }
    this.selection = null;
    return false;
  },

  deleteSelection(tilemap: RoomTilemap): boolean {
    if (!this.selection) return false;
    const idx = tilemap.objects.findIndex(function (o) { return o.id === editorState.selection!.objectInstanceId; });
    if (idx < 0) return false;
    this._pushUndo(tilemap);
    tilemap.objects.splice(idx, 1);
    this.selection = null;
    return true;
  },

  deleteAt(tilemap: RoomTilemap, tileX: number, tileY: number): boolean {
    const catalog = getObjectCatalog();
    if (!catalog) return false;
    for (let i = tilemap.objects.length - 1; i >= 0; i--) {
      const obj = tilemap.objects[i];
      const def = catalog.objects[obj.objectId];
      if (!def) continue;
      const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, obj.rotation);
      if (tileX >= obj.tileX && tileX < obj.tileX + w &&
          tileY >= obj.tileY && tileY < obj.tileY + h) {
        this._pushUndo(tilemap);
        tilemap.objects.splice(i, 1);
        return true;
      }
    }
    return false;
  },

  setFloorType(tilemap: RoomTilemap, floorType: string) {
    this._pushUndo(tilemap);
    tilemap.floorType = floorType;
    this.floorType = floorType;
  },

  undo(tilemap: RoomTilemap): boolean {
    if (this.undoStack.length === 0) return false;
    const snapshot = this.undoStack.pop()!;
    tilemap.objects = snapshot;
    this.selection = null;
    return true;
  },

  _pushUndo(tilemap: RoomTilemap) {
    const snapshot = tilemap.objects.map(function (o) {
      return { id: o.id, objectId: o.objectId, tileX: o.tileX, tileY: o.tileY, rotation: o.rotation };
    });
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndo) {
      this.undoStack.shift();
    }
  },

  /** Move a selected object by drag. */
  moveSelection(tilemap: RoomTilemap, tileX: number, tileY: number): boolean {
    if (!this.selection) return false;
    const obj = findObject(tilemap, this.selection.objectInstanceId);
    if (!obj) return false;
    if (obj.tileX === tileX && obj.tileY === tileY) return false;
    // Check bounds
    const catalog = getObjectCatalog();
    const def = catalog && catalog.objects[obj.objectId];
    if (!def) return false;
    const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, obj.rotation);
    if (tileX < 0 || tileY < 0 || tileX + w > tilemap.gridWidth || tileY + h > tilemap.gridHeight) return false;
    obj.tileX = tileX;
    obj.tileY = tileY;
    return true;
  },
};

// ── Helpers ──

function findObject(tilemap: RoomTilemap, instanceId: string): PlacedObject | undefined {
  for (let i = 0; i < tilemap.objects.length; i++) {
    if (tilemap.objects[i].id === instanceId) return tilemap.objects[i];
  }
  return undefined;
}

function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number } {
  if (rot === 90 || rot === 270) return { w: h, h: w };
  return { w, h };
}

function canPlace(
  tilemap: RoomTilemap,
  objectId: string,
  tileX: number,
  tileY: number,
  rotation: Rotation,
): boolean {
  const catalog = getObjectCatalog();
  if (!catalog) return false;
  const def = catalog.objects[objectId];
  if (!def) return false;

  const { w, h } = rotatedSize(def.widthTiles, def.heightTiles, rotation);

  // Bounds check
  if (tileX < 0 || tileY < 0 || tileX + w > tilemap.gridWidth || tileY + h > tilemap.gridHeight) {
    return false;
  }

  // Overlap check with existing objects that have collision
  for (let i = 0; i < tilemap.objects.length; i++) {
    const other = tilemap.objects[i];
    const otherDef = catalog.objects[other.objectId];
    if (!otherDef) continue;
    const os = rotatedSize(otherDef.widthTiles, otherDef.heightTiles, other.rotation);

    // AABB overlap
    if (tileX < other.tileX + os.w && tileX + w > other.tileX &&
        tileY < other.tileY + os.h && tileY + h > other.tileY) {
      return false;
    }
  }

  return true;
}

export function getSelectedObject(tilemap: RoomTilemap): PlacedObject | null {
  if (!editorState.selection) return null;
  return findObject(tilemap, editorState.selection.objectInstanceId) || null;
}
