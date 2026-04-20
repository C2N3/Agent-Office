const TERMINAL_PANEL_COLLAPSED_KEY = 'mc-terminal-panel-collapsed';

type CollapseElements = {
  layout: HTMLElement | null;
  button: HTMLButtonElement | null;
};

function getCollapseElements(): CollapseElements {
  return {
    layout: document.getElementById('mainLayout'),
    button: document.getElementById('terminalCollapseBtn') as HTMLButtonElement | null,
  };
}

function updateCollapseButton(button: HTMLButtonElement | null, collapsed: boolean) {
  if (!button) return;

  button.textContent = collapsed ? '<' : '>';
  button.title = collapsed ? 'Expand Terminal' : 'Collapse Terminal';
  button.setAttribute('aria-label', collapsed ? 'Expand Terminal' : 'Collapse Terminal');
  button.setAttribute('aria-expanded', String(!collapsed));
}

function setTerminalPanelCollapsed(collapsed: boolean, fitActiveTerminal?: () => void, persist = true) {
  const { layout, button } = getCollapseElements();
  if (!layout) return;

  layout.classList.toggle('terminal-collapsed', collapsed);
  updateCollapseButton(button, collapsed);

  if (persist) {
    localStorage.setItem(TERMINAL_PANEL_COLLAPSED_KEY, String(collapsed));
  }

  if (!collapsed) {
    requestAnimationFrame(() => fitActiveTerminal?.());
  }
}

export function revealTerminalPanel(fitActiveTerminal?: () => void) {
  const { layout } = getCollapseElements();
  if (!layout?.classList.contains('terminal-collapsed')) return;
  setTerminalPanelCollapsed(false, fitActiveTerminal);
}

export function initTerminalPanelCollapse(fitActiveTerminal: () => void) {
  const { layout, button } = getCollapseElements();
  if (!layout || !button) return;

  const collapsed = localStorage.getItem(TERMINAL_PANEL_COLLAPSED_KEY) === 'true';
  setTerminalPanelCollapsed(collapsed, fitActiveTerminal, false);

  button.addEventListener('click', () => {
    setTerminalPanelCollapsed(!layout.classList.contains('terminal-collapsed'), fitActiveTerminal);
  });
}
