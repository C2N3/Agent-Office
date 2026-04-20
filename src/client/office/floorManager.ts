/**
 * Floor Manager — Floor CRUD, persistence, event system.
 * A "floor" groups agents visually; each floor uses the same room template.
 * Floor state is persisted in localStorage.
 */

export type Floor = {
  id: string;
  name: string;
  roomId: string;        // internal room id used by officeLayers
  agentIds: string[];    // agents assigned to this floor
};

export type FloorEvent = 'floor-changed' | 'floors-updated';

type FloorListener = (data?: any) => void;

const STORAGE_KEY = 'ao-floors';
const CURRENT_FLOOR_KEY = 'ao-current-floor';

let floors: Floor[] = [];
let currentFloorId: string | null = null;
const listeners: Record<FloorEvent, FloorListener[]> = {
  'floor-changed': [],
  'floors-updated': [],
};

function generateId(): string {
  return 'floor_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(floors));
    if (currentFloorId) localStorage.setItem(CURRENT_FLOOR_KEY, currentFloorId);
  } catch {}
}

function load(): Floor[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

function emit(event: FloorEvent, data?: any) {
  const list = listeners[event];
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    try { list[i](data); } catch (e) { console.error('[FloorManager] listener error:', e); }
  }
}

export const floorManager = {
  /** Initialize floors. Call once at startup. */
  init() {
    const saved = load();
    if (saved && saved.length > 0) {
      floors = saved;
    } else {
      // Default: 1 floor
      floors = [
        { id: generateId(), name: '1F', roomId: 'room1', agentIds: [] },
      ];
    }
    const savedCurrent = localStorage.getItem(CURRENT_FLOOR_KEY);
    if (savedCurrent && floors.some(f => f.id === savedCurrent)) {
      currentFloorId = savedCurrent;
    } else {
      currentFloorId = floors[0].id;
    }
    save();
  },

  getFloors(): Floor[] {
    return floors;
  },

  getCurrentFloor(): Floor | null {
    if (!currentFloorId) return floors[0] || null;
    return floors.find(f => f.id === currentFloorId) || floors[0] || null;
  },

  getCurrentFloorId(): string | null {
    return currentFloorId;
  },

  switchFloor(floorId: string) {
    const floor = floors.find(f => f.id === floorId);
    if (!floor) return;
    currentFloorId = floorId;
    save();
    emit('floor-changed', floor);
  },

  addFloor(name: string): Floor {
    const id = generateId();
    // All floors use room1 template assets
    const roomId = 'room1';
    const floor: Floor = { id, name, roomId, agentIds: [] };
    floors.push(floor);
    save();
    emit('floors-updated', floors);
    return floor;
  },

  removeFloor(floorId: string): boolean {
    if (floors.length <= 1) return false; // keep at least one
    const idx = floors.findIndex(f => f.id === floorId);
    if (idx === -1) return false;
    const removed = floors.splice(idx, 1)[0];
    // If we deleted the current floor, switch to first available
    if (currentFloorId === floorId) {
      currentFloorId = floors[0].id;
      emit('floor-changed', floors[0]);
    }
    save();
    emit('floors-updated', floors);
    return true;
  },

  renameFloor(floorId: string, newName: string) {
    const floor = floors.find(f => f.id === floorId);
    if (!floor) return;
    floor.name = newName;
    save();
    emit('floors-updated', floors);
  },

  /** Assign an agent to a floor */
  assignAgent(agentId: string, floorId: string) {
    // Remove from any other floor first
    for (const f of floors) {
      const idx = f.agentIds.indexOf(agentId);
      if (idx !== -1) f.agentIds.splice(idx, 1);
    }
    const floor = floors.find(f => f.id === floorId);
    if (floor && !floor.agentIds.includes(agentId)) {
      floor.agentIds.push(agentId);
    }
    save();
  },

  /** Remove an agent from all floors */
  unassignAgent(agentId: string) {
    for (const f of floors) {
      const idx = f.agentIds.indexOf(agentId);
      if (idx !== -1) f.agentIds.splice(idx, 1);
    }
    save();
  },

  /** Get the floor an agent belongs to */
  getAgentFloor(agentId: string): Floor | null {
    for (const f of floors) {
      if (f.agentIds.includes(agentId)) return f;
    }
    return null;
  },

  /** Check if an agent belongs to the current floor */
  isAgentOnCurrentFloor(agentId: string): boolean {
    if (!currentFloorId) return true;
    const floor = floors.find(f => f.id === currentFloorId);
    if (!floor) return true;
    return floor.agentIds.includes(agentId);
  },

  /** Get all agent IDs on the current floor */
  getCurrentFloorAgentIds(): string[] {
    const floor = this.getCurrentFloor();
    return floor ? floor.agentIds : [];
  },

  on(event: FloorEvent, fn: FloorListener) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  },

  off(event: FloorEvent, fn: FloorListener) {
    const list = listeners[event];
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  },
};
