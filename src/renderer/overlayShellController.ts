export type OverlayContextMenuState = {
  agentId: string;
  x: number;
  y: number;
};

type OverlayShellController = {
  openContextMenu: (state: OverlayContextMenuState) => void;
  closeContextMenu: () => void;
};

let overlayShellController: OverlayShellController | null = null;

export function registerOverlayShellController(controller: OverlayShellController | null) {
  overlayShellController = controller;
}

export function openOverlayContextMenu(state: OverlayContextMenuState) {
  overlayShellController?.openContextMenu(state);
}

export function closeOverlayContextMenu() {
  overlayShellController?.closeContextMenu();
}
