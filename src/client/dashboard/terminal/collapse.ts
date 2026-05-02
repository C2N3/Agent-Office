const TERMINAL_PANEL_COLLAPSED_KEY = 'mc-terminal-panel-collapsed';

type TerminalPanelCollapseListener = () => void;

const terminalPanelCollapseListeners = new Set<TerminalPanelCollapseListener>();

function readStoredTerminalPanelCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    return localStorage.getItem(TERMINAL_PANEL_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistTerminalPanelCollapsed(collapsed: boolean): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(TERMINAL_PANEL_COLLAPSED_KEY, String(collapsed));
  } catch {}
}

function notifyTerminalPanelCollapseListeners(): void {
  for (const listener of terminalPanelCollapseListeners) {
    listener();
  }
}

function scheduleTerminalFit(fitActiveTerminal?: () => void): void {
  if (!fitActiveTerminal) return;

  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback: FrameRequestCallback) => setTimeout(callback, 0);
  schedule(() => fitActiveTerminal());
}

let terminalPanelCollapsed = readStoredTerminalPanelCollapsed();

export function getTerminalPanelCollapsed(): boolean {
  return terminalPanelCollapsed;
}

export function subscribeTerminalPanelCollapse(listener: TerminalPanelCollapseListener): () => void {
  terminalPanelCollapseListeners.add(listener);
  return () => {
    terminalPanelCollapseListeners.delete(listener);
  };
}

export function setTerminalPanelCollapsed(collapsed: boolean, fitActiveTerminal?: () => void, persist = true): void {
  const changed = terminalPanelCollapsed !== collapsed;
  terminalPanelCollapsed = collapsed;

  if (persist) {
    persistTerminalPanelCollapsed(collapsed);
  }

  if (changed) {
    notifyTerminalPanelCollapseListeners();
  }

  if (!collapsed) {
    scheduleTerminalFit(fitActiveTerminal);
  }
}

export function toggleTerminalPanelCollapsed(fitActiveTerminal?: () => void): void {
  setTerminalPanelCollapsed(!terminalPanelCollapsed, fitActiveTerminal);
}

export function revealTerminalPanel(fitActiveTerminal?: () => void): void {
  if (!terminalPanelCollapsed) return;
  setTerminalPanelCollapsed(false, fitActiveTerminal);
}

export function initTerminalPanelCollapse(fitActiveTerminal: () => void): void {
  setTerminalPanelCollapsed(readStoredTerminalPanelCollapsed(), fitActiveTerminal, false);
}
