import {
  dashboardResumeUtils,
  getDashboardAPI,
  state,
  termState,
  type DashboardOpenOptions,
} from '../shared.js';
import { initTerminalPanelCollapse, revealTerminalPanel } from './collapse.js';
import { notifyDashboardStore } from '../state/store.js';

let terminalContainerHost: HTMLDivElement | null = null;
let terminalEmptyStateHost: HTMLDivElement | null = null;

export function registerTerminalContainerHost(element: HTMLDivElement | null): void {
  terminalContainerHost = element;
}

export function registerTerminalEmptyStateHost(element: HTMLDivElement | null): void {
  terminalEmptyStateHost = element;
}

export function getTerminalContainerHost(): HTMLDivElement | null {
  return terminalContainerHost;
}

export function getTerminalEmptyStateHost(): HTMLDivElement | null {
  return terminalEmptyStateHost;
}

export async function resumeLatestRegisteredSession(registryId, label, resumeRegisteredSession) {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.getSessionHistory) {
    return { attempted: false, success: false, error: 'Session history is unavailable' };
  }

  try {
    const history = await dashboardAPI.getSessionHistory(registryId);
    if (!Array.isArray(history) || history.length === 0) {
      return { attempted: false, success: false, error: 'No session history found' };
    }

    const latest = dashboardResumeUtils.findLatestResumableSession
      ? dashboardResumeUtils.findLatestResumableSession(history)
      : history
        .filter((entry) => !!entry?.sessionId)
        .sort((left, right) => Math.max(Number(right.startedAt) || 0, Number(right.endedAt) || 0) - Math.max(Number(left.startedAt) || 0, Number(left.endedAt) || 0))[0];
    const latestResumeSessionId = latest?.resumeSessionId || latest?.sessionId;
    if (!latestResumeSessionId) {
      return { attempted: false, success: false, error: 'No resumable session found' };
    }

    const result = await resumeRegisteredSession(registryId, latestResumeSessionId, label);
    return {
      attempted: true,
      success: !!result?.success,
      error: result?.error || null,
      sessionId: latestResumeSessionId,
    };
  } catch (error) {
    console.error('[Terminal] Auto-resume failed:', error);
    return { attempted: true, success: false, error: error?.message || 'unknown' };
  }
}

export function renderTerminalTabs() {
  if (termState.terminals.size > 0) {
    revealTerminalPanel();
  }
  notifyDashboardStore();
}

export function activateTerminalTab(agentId) {
  revealTerminalPanel(fitActiveTerminal);
  for (const terminal of termState.terminals.values()) {
    terminal.element.classList.remove('active');
  }

  const terminal = termState.terminals.get(agentId);
  if (!terminal) return;
  terminal.element.classList.add('active');
  termState.activeId = agentId;
  renderTerminalTabs();
  requestAnimationFrame(() => {
    terminal.fitAddon?.fit();
    terminal.xterm.scrollToBottom();
    terminal.xterm.focus();
  });
}

export function closeTerminal(agentId) {
  const terminal = termState.terminals.get(agentId);
  if (!terminal) return;

  terminal.xterm.dispose();
  terminal.element.remove();
  termState.terminals.delete(agentId);

  const dashboardAPI = getDashboardAPI();
  if (dashboardAPI?.destroyTerminal) {
    dashboardAPI.destroyTerminal(agentId);
  }

  if (termState.terminals.size > 0) {
    const nextId = termState.terminals.keys().next().value;
    activateTerminalTab(nextId);
    return;
  }

  termState.activeId = null;
  renderTerminalTabs();
}

export function createXtermInstance(agentId, label) {
  if (typeof globalThis.Terminal === 'undefined') {
    console.error('[Terminal UI] xterm.js not loaded — Terminal is undefined');
    return;
  }

  const dashboardAPI = getDashboardAPI();
  const container = getTerminalContainerHost();
  if (!container) return;
  const doc = container.ownerDocument;

  const element = doc.createElement('div');
  element.className = 'terminal-instance active';
  element.dataset.agentId = agentId;
  container.appendChild(element);
  container.querySelectorAll('.terminal-instance').forEach((instance) => {
    if (instance !== element) instance.classList.remove('active');
  });

  const xterm = new globalThis.Terminal({
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    theme: {
      background: '#0b0d0f',
      foreground: '#e6edf3',
      cursor: '#e6edf3',
      selectionBackground: 'rgba(47, 129, 247, 0.3)',
      black: '#0b0d0f',
      red: '#f85149',
      green: '#238636',
      yellow: '#d29922',
      blue: '#2f81f7',
      magenta: '#a371f7',
      cyan: '#39c5cf',
      white: '#e6edf3',
    },
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = typeof globalThis.FitAddon !== 'undefined'
    ? new globalThis.FitAddon.FitAddon()
    : null;
  if (fitAddon) xterm.loadAddon(fitAddon);
  if (typeof globalThis.WebLinksAddon !== 'undefined') {
    xterm.loadAddon(new globalThis.WebLinksAddon.WebLinksAddon());
  }
  xterm.open(element);

  const pendingBuf = termState._pendingData;
  if (pendingBuf?.has(agentId)) {
    xterm.write(pendingBuf.get(agentId));
    pendingBuf.delete(agentId);
  }

  termState.terminals.set(agentId, { element, exited: false, fitAddon, label, xterm });
  termState.activeId = agentId;
  renderTerminalTabs();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (fitAddon) {
        try {
          fitAddon.fit();
          xterm.scrollToBottom();
        } catch (error) {
          console.warn('[Terminal UI] fit error:', error);
        }
        if (dashboardAPI?.resizeTerminal) {
          dashboardAPI.resizeTerminal(agentId, xterm.cols, xterm.rows);
        }
      }
      xterm.focus();
    });
  });

  xterm.attachCustomKeyEventHandler((event) => {
    if (event.ctrlKey && event.key === 'c' && xterm.hasSelection()) {
      navigator.clipboard.writeText(xterm.getSelection());
      return false;
    }
    if (event.ctrlKey && event.key === 'v') {
      navigator.clipboard.readText().then((text) => {
        if (text && dashboardAPI?.writeTerminal) {
          dashboardAPI.writeTerminal(agentId, text);
        }
      });
      return false;
    }
    return true;
  });

  xterm.onData((data) => {
    if (dashboardAPI?.writeTerminal) {
      dashboardAPI.writeTerminal(agentId, data);
    }
  });

  const observer = new ResizeObserver(() => {
    if (termState.activeId === agentId && fitAddon) {
      try {
        fitAddon.fit();
        xterm.scrollToBottom();
        if (dashboardAPI?.resizeTerminal) {
          dashboardAPI.resizeTerminal(agentId, xterm.cols, xterm.rows);
        }
      } catch {}
    }
  });
  observer.observe(element);
}

export function fitActiveTerminal() {
  if (!termState.activeId) return;
  const terminal = termState.terminals.get(termState.activeId);
  if (!terminal?.fitAddon) return;

  try {
    terminal.fitAddon.fit();
    const dashboardAPI = getDashboardAPI();
    if (dashboardAPI?.resizeTerminal) {
      dashboardAPI.resizeTerminal(termState.activeId, terminal.xterm.cols, terminal.xterm.rows);
    }
  } catch {}
}

export function initResizableHandles() {
  initTerminalPanelCollapse(fitActiveTerminal);
}

export function getTerminalOpenContext(agentId: string, openOptions: DashboardOpenOptions = {}) {
  const agent = state.agents.get(agentId);
  const cwd = openOptions.cwd || agent?.metadata?.projectPath || agent?.project || '';
  const provider = agent?.metadata?.provider || null;
  const agentStatus = agent?.status || '';
  const registryId = agent?.registryId || null;
  const isRegistered = !!agent?.isRegistered;
  const directResumeSessionId = dashboardResumeUtils.getDirectResumeSessionId
    ? dashboardResumeUtils.getDirectResumeSessionId(agent, openOptions)
    : null;

  return {
    agent,
    cwd,
    provider,
    agentStatus,
    registryId,
    isRegistered,
    directResumeSessionId,
  };
}
