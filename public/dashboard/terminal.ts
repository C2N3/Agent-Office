// @ts-nocheck

import {
  dashboardResumeUtils,
  escapeText,
  getDashboardAPI,
  state,
  termState,
} from './shared.js';

export function initTerminals() {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI) return;

  if (dashboardAPI.onTerminalData) {
    termState.dataCleanup = dashboardAPI.onTerminalData((agentId, data) => {
      const terminal = termState.terminals.get(agentId);
      if (terminal) terminal.xterm.write(data);
    });
  }

  if (dashboardAPI.onTerminalExit) {
    termState.exitCleanup = dashboardAPI.onTerminalExit((agentId, exitCode) => {
      const terminal = termState.terminals.get(agentId);
      if (terminal) {
        terminal.xterm.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
      }
    });
  }

  if (dashboardAPI.onPsPolicyBlocked) {
    dashboardAPI.onPsPolicyBlocked(() => {
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'flex';
    });
    document.getElementById('psPolicyFixBtn')?.addEventListener('click', () => {
      dashboardAPI.openPsPolicyTerminal();
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
    });
    document.getElementById('psPolicyDismissBtn')?.addEventListener('click', () => {
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
    });
  }
}

function getTerminalProfile(profileId) {
  return termState.profiles.find((profile) => profile.id === profileId) || null;
}

function getDefaultTerminalProfile() {
  return getTerminalProfile(termState.defaultProfileId) || termState.profiles[0] || null;
}

function updateTerminalToolbarTitles() {
  const newButton = document.getElementById('terminalNewBtn');
  if (!newButton) return;
  const defaultProfile = getDefaultTerminalProfile();
  newButton.title = defaultProfile
    ? `New Terminal (${defaultProfile.title})`
    : 'New Terminal';
}

function renderTerminalProfileMenu() {
  const menu = document.getElementById('terminalProfileMenu');
  if (!menu) return;

  const defaultProfile = getDefaultTerminalProfile();
  const profiles = termState.profiles;

  if (profiles.length === 0) {
    menu.innerHTML = `
      <div class="terminal-launch-header">
        <div>
          <div class="terminal-launch-title">New Terminal</div>
          <div class="terminal-launch-subtitle">No shell profiles were detected on this machine.</div>
        </div>
        <button class="terminal-launch-close" type="button" data-action="close-terminal-popover">&times;</button>
      </div>
    `;
    return;
  }

  const openItems = profiles.map((profile) => `
    <button class="terminal-profile-item" data-action="open-profile" data-profile-id="${escapeText(profile.id)}">
      <span class="terminal-profile-item-main">
        <span class="terminal-profile-item-title">${escapeText(profile.title)}</span>
        <span class="terminal-profile-item-hint">Open a one-off terminal with this shell</span>
      </span>
      ${profile.id === defaultProfile?.id ? '<span class="terminal-profile-badge">Default</span>' : ''}
    </button>
  `).join('');

  const defaultItems = profiles.map((profile) => `
    <button class="terminal-profile-item ${profile.id === defaultProfile?.id ? 'selected' : ''}" data-action="set-default-profile" data-profile-id="${escapeText(profile.id)}">
      <span class="terminal-profile-item-main">
        <span class="terminal-profile-item-title">${escapeText(profile.title)}</span>
        <span class="terminal-profile-item-hint">Use when pressing the New Terminal button</span>
      </span>
      <span class="terminal-profile-check">${profile.id === defaultProfile?.id ? '✓' : ''}</span>
    </button>
  `).join('');

  menu.innerHTML = `
    <div class="terminal-launch-header">
      <div>
        <div class="terminal-launch-title">New Terminal</div>
        <div class="terminal-launch-subtitle">Choose a shell for this tab, or change the default profile.</div>
      </div>
      <button class="terminal-launch-close" type="button" data-action="close-terminal-popover">&times;</button>
    </div>
    <button class="terminal-launch-primary" data-action="open-profile" data-profile-id="${escapeText(defaultProfile.id)}">
      <span class="terminal-launch-primary-label">Open default terminal</span>
      <span class="terminal-launch-primary-value">${escapeText(defaultProfile.title)}</span>
    </button>
    <div class="terminal-profile-section-title">Open With</div>
    <div class="terminal-profile-list">${openItems}</div>
    <div class="terminal-profile-divider"></div>
    <div class="terminal-profile-section-title">Default Profile</div>
    <div class="terminal-profile-list">${defaultItems}</div>
  `;
}

function closeTerminalProfileMenu() {
  const menu = document.getElementById('terminalProfileMenu');
  if (menu) menu.style.display = 'none';
}

export async function refreshTerminalProfiles() {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.getTerminalProfiles) return;
  const result = await dashboardAPI.getTerminalProfiles();
  termState.profiles = Array.isArray(result?.profiles) ? result.profiles : [];
  termState.defaultProfileId = result?.defaultProfileId || termState.profiles[0]?.id || null;
  renderTerminalProfileMenu();
  updateTerminalToolbarTitles();
}

async function ensureTerminalProfilesLoaded() {
  if (termState.profiles.length > 0) return;
  await refreshTerminalProfiles();
}

async function openNewLocalTerminal(profileId) {
  await ensureTerminalProfilesLoaded();
  const profile = getTerminalProfile(profileId) || getDefaultTerminalProfile();
  const id = `local-${Date.now()}`;
  return openTerminalForAgent(id, {
    profileId: profile?.id || null,
    label: profile?.title || 'Terminal',
  });
}

export function initTerminalProfileMenu() {
  const newButton = document.getElementById('terminalNewBtn');
  const menu = document.getElementById('terminalProfileMenu');
  if (!newButton || !menu) return;

  newButton.addEventListener('click', async () => {
    const willOpen = menu.style.display === 'none';
    if (willOpen) {
      await refreshTerminalProfiles();
      menu.style.display = '';
    } else {
      closeTerminalProfileMenu();
    }
  });

  menu.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) return;

    const action = item.dataset.action;
    if (action === 'close-terminal-popover') {
      closeTerminalProfileMenu();
      return;
    }

    const profileId = item.dataset.profileId;
    if (!profileId) return;

    if (action === 'open-profile') {
      closeTerminalProfileMenu();
      await openNewLocalTerminal(profileId);
      return;
    }

    const dashboardAPI = getDashboardAPI();
    if (action === 'set-default-profile' && dashboardAPI?.setDefaultTerminalProfile) {
      const result = await dashboardAPI.setDefaultTerminalProfile(profileId);
      if (result?.success) {
        termState.profiles = Array.isArray(result.profiles) ? result.profiles : termState.profiles;
        termState.defaultProfileId = result.defaultProfileId || profileId;
        renderTerminalProfileMenu();
        updateTerminalToolbarTitles();
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && !newButton.contains(event.target)) {
      closeTerminalProfileMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTerminalProfileMenu();
    }
  });
}

export async function openTerminalForAgent(agentId, openOptions = {}) {
  if (termState.terminals.has(agentId)) {
    activateTerminalTab(agentId);
    return;
  }

  const agent = state.agents.get(agentId);
  const cwd = openOptions.cwd || agent?.metadata?.projectPath || agent?.project || '';
  const provider = agent?.metadata?.provider || null;
  const agentStatus = agent?.status || '';
  const registryId = agent?.registryId || null;
  const isRegistered = !!agent?.isRegistered;
  const directResumeSessionId = dashboardResumeUtils.getDirectResumeSessionId
    ? dashboardResumeUtils.getDirectResumeSessionId(agent, openOptions)
    : null;

  const dashboardAPI = getDashboardAPI();
  const isActive = ['working', 'thinking', 'waiting', 'help'].includes(agentStatus);
  let focusResult = null;
  if (isActive) {
    if (!dashboardAPI?.focusAgent) return;
    focusResult = await dashboardAPI.focusAgent(agentId);
    if (focusResult?.success) return;
    if (focusResult?.reason !== 'stale-session') {
      return;
    }
  }

  const shouldAutoResume = dashboardResumeUtils.shouldAutoResumeRegisteredAgent
    ? dashboardResumeUtils.shouldAutoResumeRegisteredAgent(agent, openOptions)
    : (!openOptions.skipAutoResume && isRegistered && registryId && agentStatus === 'offline');
  const shouldRecoverStaleSession = !openOptions.skipAutoResume
    && isRegistered
    && registryId
    && focusResult?.reason === 'stale-session';

  if (shouldAutoResume || shouldRecoverStaleSession) {
    const resumeResult = await resumeLatestRegisteredSession(
      registryId,
      openOptions.label || agent?.nickname || agent?.name || 'Terminal'
    );
    if (resumeResult?.success) return;
    if (resumeResult?.attempted && !directResumeSessionId) {
      console.error('[Terminal] Resume failed:', resumeResult.error || 'unknown');
      alert(`Failed to resume the latest session: ${resumeResult.error || 'unknown'}`);
      return;
    }
  }

  if (!dashboardAPI?.createTerminal) return;

  const result = await dashboardAPI.createTerminal(agentId, {
    cwd,
    profileId: openOptions.profileId || undefined,
  });
  if (!result?.success) {
    console.error('[Terminal] Failed to create:', result?.error);
    return;
  }

  createXtermInstance(agentId, openOptions.label || agent?.nickname || agent?.name || result?.profileLabel || 'Terminal');

  if (provider === 'codex' && dashboardAPI.writeTerminal && !openOptions.skipProviderBoot) {
    setTimeout(() => {
      if (directResumeSessionId) {
        dashboardAPI.writeTerminal(agentId, `codex resume ${directResumeSessionId}\r`);
        return;
      }
      dashboardAPI.writeTerminal(agentId, 'codex\r');
    }, 250);
  }
}

export async function resumeRegisteredSession(registryId, sessionId, label) {
  if (!registryId || !sessionId) return { success: false, error: 'Missing session info' };

  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.resumeSession) {
    return { success: false, error: 'Resume is only available in the Electron app' };
  }

  if (termState.terminals.has(registryId)) {
    closeTerminal(registryId);
  }

  const result = await dashboardAPI.resumeSession(registryId, sessionId);
  if (result?.success) {
    createXtermInstance(registryId, label || 'Terminal');
  }
  return result || { success: false, error: 'unknown' };
}

async function resumeLatestRegisteredSession(registryId, label) {
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
        .sort((left, right) => Math.max(right.startedAt || 0, right.endedAt || 0) - Math.max(left.startedAt || 0, left.endedAt || 0))[0];
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

function createXtermInstance(agentId, label) {
  if (typeof globalThis.Terminal === 'undefined') {
    console.error('[Terminal UI] xterm.js not loaded — Terminal is undefined');
    return;
  }

  const dashboardAPI = getDashboardAPI();
  const container = document.getElementById('terminalContainer');
  const emptyState = document.getElementById('terminalEmptyState');
  if (emptyState) emptyState.style.display = 'none';

  const element = document.createElement('div');
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

  const tab = addTerminalTab(agentId, label);
  termState.terminals.set(agentId, { xterm, fitAddon, element, tab });
  termState.activeId = agentId;

  document.querySelectorAll('.terminal-tab').forEach((entry) => entry.classList.remove('active'));
  tab.classList.add('active');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (fitAddon) {
        try {
          fitAddon.fit();
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
        if (dashboardAPI?.resizeTerminal) {
          dashboardAPI.resizeTerminal(agentId, xterm.cols, xterm.rows);
        }
      } catch {
        // Ignore layout-transition resize errors.
      }
    }
  });
  observer.observe(element);
}

function addTerminalTab(agentId, label) {
  const list = document.getElementById('terminalTabsList');
  const tab = document.createElement('div');
  tab.className = 'terminal-tab';
  tab.dataset.agentId = agentId;
  tab.innerHTML = `
    <span class="terminal-tab-dot"></span>
    <span class="terminal-tab-label">${label}</span>
    <button class="terminal-tab-close" title="Close">&times;</button>
  `;

  tab.addEventListener('click', (event) => {
    if (event.target.classList.contains('terminal-tab-close')) {
      closeTerminal(agentId);
    } else {
      activateTerminalTab(agentId);
    }
  });

  list.appendChild(tab);
  return tab;
}

function activateTerminalTab(agentId) {
  for (const terminal of termState.terminals.values()) {
    terminal.element.classList.remove('active');
    terminal.tab.classList.remove('active');
  }

  const terminal = termState.terminals.get(agentId);
  if (!terminal) return;

  terminal.element.classList.add('active');
  terminal.tab.classList.add('active');
  termState.activeId = agentId;
  requestAnimationFrame(() => {
    terminal.fitAddon?.fit();
    terminal.xterm.focus();
  });
}

function closeTerminal(agentId) {
  const terminal = termState.terminals.get(agentId);
  if (!terminal) return;

  terminal.xterm.dispose();
  terminal.element.remove();
  terminal.tab.remove();
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
  const emptyState = document.getElementById('terminalEmptyState');
  if (emptyState) emptyState.style.display = '';
}

export function initResizableHandles() {
  const resizeVertical = document.getElementById('resizeV');
  const leftCol = document.getElementById('leftCol');
  const mainLayout = document.getElementById('mainLayout');

  if (resizeVertical && leftCol && mainLayout) {
    let startX;
    let startWidth;

    const onMouseMove = (event) => {
      const deltaX = event.clientX - startX;
      const newWidth = Math.max(280, Math.min(startWidth + deltaX, mainLayout.clientWidth - 306));
      leftCol.style.width = `${newWidth}px`;
      fitActiveTerminal();
    };

    const onMouseUp = () => {
      resizeVertical.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizeVertical.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startX = event.clientX;
      startWidth = leftCol.offsetWidth;
      resizeVertical.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  const resizeHorizontal = document.getElementById('resizeH');
  const officePanel = document.getElementById('officePanel');
  const agentListPanel = document.getElementById('agentListPanel');

  if (resizeHorizontal && officePanel && agentListPanel && leftCol) {
    let startY;
    let startOfficeHeight;
    let totalHeight;

    const onMouseMove = (event) => {
      const deltaY = event.clientY - startY;
      const newOfficeHeight = Math.max(150, Math.min(startOfficeHeight + deltaY, totalHeight - 106));
      officePanel.style.flex = 'none';
      officePanel.style.height = `${newOfficeHeight}px`;
      agentListPanel.style.flex = '1';
    };

    const onMouseUp = () => {
      resizeHorizontal.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizeHorizontal.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startY = event.clientY;
      startOfficeHeight = officePanel.offsetHeight;
      totalHeight = leftCol.offsetHeight;
      resizeHorizontal.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
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
  } catch {
    // Ignore fit failures during layout transitions.
  }
}
