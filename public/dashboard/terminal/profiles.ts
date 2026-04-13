
import { escapeText, getDashboardAPI, termState } from '../shared.js';

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
  newButton.title = defaultProfile ? `New Terminal (${defaultProfile.title})` : 'New Terminal';
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
    <button class="terminal-launch-primary" type="button" data-action="open-profile" data-profile-id="${escapeText(defaultProfile.id)}">
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

async function openNewLocalTerminal(profileId, openTerminalForAgent) {
  await ensureTerminalProfilesLoaded();
  const profile = getTerminalProfile(profileId) || getDefaultTerminalProfile();
  const id = `local-${Date.now()}`;
  return openTerminalForAgent(id, {
    profileId: profile?.id || null,
    label: profile?.title || 'Terminal',
  });
}

export function initTerminalProfileMenu(openTerminalForAgent) {
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
      await openNewLocalTerminal(profileId, openTerminalForAgent);
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
    const target = event.target instanceof Node ? event.target : null;
    if (!menu.contains(target) && !newButton.contains(target)) {
      closeTerminalProfileMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTerminalProfileMenu();
    }
  });
}
