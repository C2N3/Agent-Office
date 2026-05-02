/**
 * Tilemap Schema — Type definitions for JSON-based office map system.
 * Shared between client and server.
 */

/* eslint-disable no-unused-vars */

// ── Placed object instance in a room ──

export type Rotation = 0 | 90 | 180 | 270;

export interface PlacedObject {
  id: string;           // unique instance id
  objectId: string;     // references ObjectCatalog key
  tileX: number;
  tileY: number;
  rotation: Rotation;
}

// ── Room tilemap (one JSON per room) ──

export interface RoomTilemap {
  version: number;
  name: string;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;       // 70
  floorType: string;      // references ObjectCatalog.floors key
  objects: PlacedObject[];
}

// ── Object definition in catalog ──

export interface SeatSlot {
  offsetX: number;        // tile offset from object origin
  offsetY: number;
  dir: string;            // "up" | "down" | "left" | "right"
}

export interface LaptopSlot {
  offsetX: number;
  offsetY: number;
  dir: string;
}

export interface ObjectSprites {
  back: string | null;    // drawn behind characters (Pass 1)
  front: string | null;   // drawn over characters (Pass 3)
}

export interface ObjectDef {
  name: string;
  category: string;       // "wall" | "furniture" | "decoration"
  widthTiles: number;
  heightTiles: number;
  collision: boolean;      // true = auto-block tiles
  sprites: ObjectSprites;
  rotatable: boolean;
  // furniture-specific
  isSeat?: boolean;
  seatType?: 'desk' | 'idle' | 'meeting';
  seatSlots?: SeatSlot[];
  laptopSlots?: LaptopSlot[];
  thumbnail?: string;
}

export interface FloorDef {
  name: string;
  sprite: string;
}

// ── Object catalog (shared across all rooms) ──

export interface ObjectCatalog {
  objects: Record<string, ObjectDef>;
  floors: Record<string, FloorDef>;
  categories?: Array<{ id: string; name: string; icon?: string }>;
}
