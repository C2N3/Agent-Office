import { useSyncExternalStore } from 'react';
import { floorManager } from '../../office/floorManager.js';
import { state, termState } from '../shared.js';

export const DASHBOARD_VIEWS = [
  'office',
  'heatmap',
  'archive',
  'remote',
  'cloudflare',
  'usage',
] as const;

export type DashboardView = typeof DASHBOARD_VIEWS[number];

export type DashboardStoreSnapshot = {
  activeTerminalId: string | null;
  connected: boolean;
  currentFloorId: string | null;
  currentView: DashboardView;
  floors: Array<{ id: string; name: string }>;
  registeredOnly: boolean;
  stats: {
    active: number;
    completed: number;
    errorCount: number;
    total: number;
  };
  terminalIds: string[];
};

const listeners = new Set<() => void>();

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
  listeners.forEach((listener) => listener());
}

export function getDashboardSnapshot(): DashboardStoreSnapshot {
  return {
    activeTerminalId: termState.activeId,
    connected: !!state.connected,
    currentFloorId: floorManager.getCurrentFloorId(),
    currentView: normalizeDashboardView(state.currentView),
    floors: floorManager.getFloors().map((floor) => ({ id: floor.id, name: floor.name })),
    registeredOnly: !!state.filters.registeredOnly,
    stats: { ...state.stats },
    terminalIds: Array.from(termState.terminals.keys()),
  };
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
