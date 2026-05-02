import { useSyncExternalStore } from 'react';
import { getDashboardAPI } from '../shared';

type WindowControlsSnapshot = {
  overlayOpen: boolean;
  pipOpen: boolean;
};

let snapshot: WindowControlsSnapshot = {
  overlayOpen: false,
  pipOpen: false,
};
let pipControlsInitialized = false;
let overlayControlsInitialized = false;

const listeners = new Set<() => void>();

function notifyWindowControls() {
  listeners.forEach((listener) => listener());
}

function setWindowControlsSnapshot(next: Partial<WindowControlsSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.overlayOpen === snapshot.overlayOpen && merged.pipOpen === snapshot.pipOpen) return;
  snapshot = merged;
  notifyWindowControls();
}

export function subscribeWindowControls(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWindowControlsSnapshot(): WindowControlsSnapshot {
  return snapshot;
}

export function useWindowControlsSnapshot(): WindowControlsSnapshot {
  return useSyncExternalStore(
    subscribeWindowControls,
    getWindowControlsSnapshot,
    getWindowControlsSnapshot,
  );
}

export function togglePipWindow(): void {
  void getDashboardAPI()?.togglePip?.();
}

export function toggleOverlayWindow(): void {
  void getDashboardAPI()?.toggleOverlay?.();
}

export function initPipControls() {
  if (pipControlsInitialized) return;
  pipControlsInitialized = true;
  const dashboardAPI = getDashboardAPI();
  dashboardAPI?.onPipStateChanged?.((isOpen: boolean) => {
    setWindowControlsSnapshot({ pipOpen: isOpen });
  });
}

export function initOverlayControls() {
  if (overlayControlsInitialized) return;
  overlayControlsInitialized = true;
  const dashboardAPI = getDashboardAPI();
  dashboardAPI?.onOverlayStateChanged?.((isOpen: boolean) => {
    setWindowControlsSnapshot({ overlayOpen: isOpen });
  });
}
