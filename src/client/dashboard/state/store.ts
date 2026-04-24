import { useSyncExternalStore } from 'react';
import { floorManager } from '../../office/floorManager.js';
import { getVisibleAgents } from '../agentFilters.js';
import {
  type DashboardAgent,
  type DashboardAgentHistoryEntry,
  type DashboardTerminalEntry,
  type DashboardTerminalProfile,
  state,
  termState,
} from '../shared.js';

export const DASHBOARD_VIEWS = [
  'office',
  'terminal',
  'heatmap',
  'archive',
  'remote',
  'cloudflare',
  'usage',
] as const;

export type DashboardView = typeof DASHBOARD_VIEWS[number];

export type DashboardStoreSnapshot = {
  activeTerminalId: string | null;
  agentHistory: Map<string, DashboardAgentHistoryEntry[]>;
  connected: boolean;
  currentFloorId: string | null;
  currentFloorName: string;
  currentView: DashboardView;
  focusedAgentId: string | null;
  floors: Array<{ id: string; name: string }>;
  registeredOnly: boolean;
  stats: {
    active: number;
    completed: number;
    errorCount: number;
    total: number;
  };
  terminalDefaultProfileId: string | null;
  terminalProfileMenuOpen: boolean;
  terminalProfiles: DashboardTerminalProfile[];
  psPolicyBlocked: boolean;
  terminals: Array<[string, DashboardTerminalEntry]>;
  visibleAgents: DashboardAgent[];
};

const listeners = new Set<() => void>();
let cachedSnapshot: DashboardStoreSnapshot | null = null;

export function normalizeDashboardView(value?: string | null): DashboardView {
  const candidate = String(value || '').trim().toLowerCase();
  return DASHBOARD_VIEWS.find((entry) => entry === candidate) || 'office';
}

export function subscribeDashboardStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDashboardStore(): void {
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

export function getDashboardSnapshot(): DashboardStoreSnapshot {
  if (cachedSnapshot) return cachedSnapshot;

  const currentFloor = floorManager.getCurrentFloor();
  cachedSnapshot = {
    activeTerminalId: termState.activeId,
    agentHistory: new Map(state.agentHistory),
    connected: !!state.connected,
    currentFloorId: floorManager.getCurrentFloorId(),
    currentFloorName: currentFloor?.name || 'Office',
    currentView: normalizeDashboardView(state.currentView),
    focusedAgentId: state.focusedAgentId,
    floors: floorManager.getFloors().map((floor) => ({ id: floor.id, name: floor.name })),
    registeredOnly: !!state.filters.registeredOnly,
    stats: { ...state.stats },
    terminalDefaultProfileId: termState.defaultProfileId,
    terminalProfileMenuOpen: !!termState.profileMenuOpen,
    terminalProfiles: termState.profiles.slice(),
    psPolicyBlocked: !!termState.psPolicyBlocked,
    terminals: Array.from(termState.terminals.entries()),
    visibleAgents: getVisibleAgents(),
  };
  return cachedSnapshot;
}

export function useDashboardSnapshot(): DashboardStoreSnapshot {
  return useSyncExternalStore(subscribeDashboardStore, getDashboardSnapshot, getDashboardSnapshot);
}

export function setDashboardView(nextView: DashboardView): void {
  const normalized = normalizeDashboardView(nextView);
  if (state.currentView === normalized) return;
  state.currentView = normalized;
  localStorage.setItem('mc-view', normalized);
  notifyDashboardStore();
}

export function setTerminalProfileMenuOpen(open: boolean): void {
  if (termState.profileMenuOpen === open) return;
  termState.profileMenuOpen = open;
  notifyDashboardStore();
}

export function setPsPolicyBlocked(blocked: boolean): void {
  if (termState.psPolicyBlocked === blocked) return;
  termState.psPolicyBlocked = blocked;
  notifyDashboardStore();
}
