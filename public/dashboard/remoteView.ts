import {
  bindCentralServerControls,
  fetchCentralServerConfig,
  fetchCentralServerSnapshot,
  renderCentralServerCard,
  saveCentralServerConfig,
  startCentralServerConnection,
  stopCentralServerConnection,
} from './serverConnection.js';
import {
  buildGuestInviteLink,
  flagsFromRemoteMode,
  parseGuestInviteLink,
  type RemoteMode,
} from './remoteMode.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastIssuedGuestSecret = '';
let remoteActionError = '';
let pendingRemoteMode: RemoteMode | null = null;

type RoomAccessStatus = {
  publicMode: boolean;
  ownerSecretSet: boolean;
  guestSecretSet: boolean;
  ownerSecret?: string;
  guestSecret?: string;
  ownerSecretState?: string;
  guestSecretState?: string;
};

function copyToClipboard(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {});
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRemoteInputFocused(): boolean {
  const focusedId = document.activeElement?.id;
  const focusedName = (document.activeElement as HTMLInputElement | null)?.name;
  return focusedId === 'centralServerUrlInput'
    || focusedId === 'centralWorkerTokenInput'
    || focusedId === 'guestInviteInput'
    || focusedName === 'remoteMode';
}

async function fetchRoomAccess(): Promise<RoomAccessStatus | null> {
  try {
    const res = await fetch('/api/server/room-access', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<RoomAccessStatus>;
  } catch {
    return null;
  }
}

async function roomAccessAction(path: string): Promise<RoomAccessStatus> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return payload as RoomAccessStatus;
}

function renderModeSelector(mode: RemoteMode, roomSecretConfigured = false): string {
  const options: Array<{ value: RemoteMode; label: string; title: string; hint: string }> = [
    {
      value: 'local',
      label: 'Local Only',
      title: 'Local registry only',
      hint: 'room secret을 보내지 않고 로컬 registry를 source of truth로 유지합니다.',
    },
    {
      value: 'host',
      label: 'Host',
      title: 'Host room owner',
      hint: '중앙 서버에서 owner secret으로 public room을 열고 guest invite를 관리합니다.',
    },
    {
      value: 'guest',
      label: 'Guest',
      title: 'Join by invite link',
      hint: 'invite link의 중앙 서버 origin과 guest secret으로 접속합니다.',
    },
  ];
  const selected = options.find((option) => option.value === mode) || options[0];
  const flags = flagsFromRemoteMode(mode, { roomSecretConfigured });

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Mode</div>
  <div class="remote-mode-tabs" role="tablist" aria-label="Remote mode">
    ${options.map((option) => `
      <label class="remote-mode-pill ${mode === option.value ? 'active' : ''}">
        <input
          type="radio"
          class="remote-mode-input"
          name="remoteMode"
          value="${option.value}"
          ${mode === option.value ? 'checked' : ''}
        >
        <span>${escapeHtml(option.label)}</span>
      </label>
    `).join('')}
  </div>
  <div class="remote-mode-sheet">
    <div class="remote-mode-title">${escapeHtml(selected.title)}</div>
    <div class="remote-mode-description">${escapeHtml(selected.hint)}</div>
    <div class="remote-hint">Worker bridge: ${flags.workerEnabled ? 'on' : 'off'} · Character sync: ${flags.agentSyncEnabled ? 'on' : 'off'}</div>
  </div>
</div>`;
}

function renderLocalCard(): string {
  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Local Only</div>

  <div class="remote-status-row">
    <div class="remote-dot server-dot offline"></div>
    <span class="remote-status-label">Central sync disabled</span>
  </div>

  <div class="remote-hint">원격 invite나 worker bridge 없이 로컬 registry만 사용합니다.</div>

  <div class="remote-info-block">
    <div class="remote-info-label">Persistence</div>
    <div class="remote-hint">대시보드에서 만든 agent와 avatar, metadata 변경은 <code>~/.agent-office/agent-registry.json</code> 에만 저장됩니다.</div>
  </div>
  <div class="remote-info-block">
    <div class="remote-info-label">Server URL</div>
    <div class="remote-hint">Central Server 패널의 URL은 유지할 수 있지만, Local Only에서는 worker bridge와 character sync를 켜지 않습니다.</div>
  </div>
</div>`;
}

function renderHostCard(baseUrl: string, mode: RemoteMode, roomAccess: RoomAccessStatus | null): string {
  const inviteSecret = lastIssuedGuestSecret || roomAccess?.guestSecret || '';
  const inviteLink = inviteSecret ? buildGuestInviteLink(baseUrl, inviteSecret) : '';
  const stateLabel = roomAccess?.publicMode ? 'Public room enabled' : 'Public room disabled';
  const modeHint = mode === 'host'
    ? 'Host mode는 owner secret을 로컬에 저장하고 room-access API를 통해 public room을 관리합니다.'
    : 'Host mode를 선택하면 owner secret이 있는 경우 바로 room을 다시 열 수 있습니다.';

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Host Mode</div>

  <div class="remote-status-row">
    <div class="remote-dot server-dot ${roomAccess?.publicMode ? 'online' : 'offline'}"></div>
    <span class="remote-status-label">${escapeHtml(stateLabel)}</span>
    <div style="flex:1"></div>
    <button class="btn-primary remote-action-btn" id="hostEnableBtn">Enable</button>
    <button class="btn-secondary remote-action-btn" id="hostRotateBtn">Rotate Guest</button>
    <button class="btn-secondary remote-action-btn" id="hostDisableBtn">Disable</button>
  </div>

  <div class="remote-hint">${escapeHtml(modeHint)}</div>

  ${inviteLink ? `
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="remote-url-row">
        <span class="remote-url-text">${escapeHtml(inviteLink)}</span>
        <button class="remote-copy-btn" data-copy="${escapeHtml(inviteLink)}">Copy</button>
      </div>
    </div>
  ` : `
    <div class="remote-hint">새 guest invite가 필요하면 <code>Rotate Guest</code>를 눌러 fresh link를 발급합니다.</div>
  `}

  <div class="remote-info-block">
    <div class="remote-info-label">Secret Status</div>
    <div class="remote-hint">Owner: ${escapeHtml(roomAccess?.ownerSecretState || 'not set')} · Guest: ${escapeHtml(roomAccess?.guestSecretState || 'not set')}</div>
  </div>
</div>`;
}

function renderGuestCard(config: { baseUrl?: string; roomSecretConfigured?: boolean; remoteMode?: RemoteMode }): string {
  const joined = config.remoteMode === 'guest' && config.roomSecretConfigured;
  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Guest Mode</div>

  <form id="guestJoinForm">
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="modal-path-field">
        <input type="text" id="guestInviteInput" class="modal-input" value="" placeholder="https://central.example/#aoGuestSecret=..." autocomplete="off" spellcheck="false">
        <button class="btn-secondary modal-browse-btn" id="guestJoinBtn" type="submit">Join</button>
      </div>
      <div class="remote-hint">fragment의 <code>aoGuestSecret</code>를 읽어서 중앙 서버 origin과 함께 저장합니다.</div>
    </div>
  </form>

  <div class="remote-info-block">
    <div class="remote-info-label">Current Guest Session</div>
    <div class="remote-hint">${joined
      ? `Connected to ${escapeHtml(config.baseUrl || '')} with stored guest secret.`
      : 'No guest invite is stored.'}</div>
  </div>
</div>`;
}

function renderSelectedModeCard(
  mode: RemoteMode,
  config: { baseUrl?: string; roomSecretConfigured?: boolean; remoteMode?: RemoteMode } | null,
  snapshotBaseUrl: string,
  roomAccess: RoomAccessStatus | null,
): string {
  if (mode === 'host') {
    return renderHostCard(config?.baseUrl || snapshotBaseUrl || '', mode, roomAccess);
  }
  if (mode === 'guest') {
    return renderGuestCard(config || {});
  }
  return renderLocalCard();
}

function getDisplayedSnapshot(
  snapshot: Awaited<ReturnType<typeof fetchCentralServerSnapshot>>,
  mode: RemoteMode,
  roomSecretConfigured: boolean,
) {
  if (!snapshot.config) return snapshot;
  const flags = flagsFromRemoteMode(mode, { roomSecretConfigured });
  return {
    ...snapshot,
    config: {
      ...snapshot.config,
      remoteMode: mode,
      workerEnabled: flags.workerEnabled,
      agentSyncEnabled: flags.agentSyncEnabled,
      roomSecretConfigured,
    },
  };
}

export async function renderRemoteView(): Promise<void> {
  const container = document.getElementById('remoteView');
  if (!container) return;

  const [config, snapshot, roomAccess] = await Promise.all([
    fetchCentralServerConfig(),
    fetchCentralServerSnapshot(),
    fetchRoomAccess(),
  ]);
  const persistedMode = (config?.remoteMode || 'local') as RemoteMode;
  const mode = pendingRemoteMode || persistedMode;
  const displayedSnapshot = getDisplayedSnapshot(snapshot, mode, !!config?.roomSecretConfigured);

  container.innerHTML = [
    renderModeSelector(mode, !!config?.roomSecretConfigured),
    remoteActionError ? `<div class="panel remote-panel"><div class="remote-error">${escapeHtml(remoteActionError)}</div></div>` : '',
    renderSelectedModeCard(mode, config, snapshot.config?.baseUrl || '', roomAccess),
    renderCentralServerCard(displayedSnapshot),
  ].join('');

  bindCentralServerControls();

  container.querySelectorAll<HTMLInputElement>('input[name="remoteMode"]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target?.checked) return;
      const nextMode = target.value as RemoteMode;
      if (nextMode === persistedMode && !pendingRemoteMode) return;
      pendingRemoteMode = nextMode;
      remoteActionError = '';
      await renderRemoteView();
      try {
        await saveCentralServerConfig({ remoteMode: nextMode });
        stopCentralServerConnection();
        window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
      } catch (error) {
        remoteActionError = error instanceof Error ? error.message : String(error || 'Failed to change remote mode');
      } finally {
        pendingRemoteMode = null;
      }
      await renderRemoteView();
      if (!remoteActionError) {
        void startCentralServerConnection();
      }
    });
  });

  document.getElementById('hostEnableBtn')?.addEventListener('click', async () => {
    try {
      remoteActionError = '';
      const response = await roomAccessAction('/api/server/room-access/enable');
      lastIssuedGuestSecret = response.guestSecret || lastIssuedGuestSecret;
      if (response.ownerSecret) {
        await saveCentralServerConfig({ remoteMode: 'host', roomSecret: response.ownerSecret });
      } else {
        await saveCentralServerConfig({ remoteMode: 'host' });
      }
      stopCentralServerConnection();
      window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
      void startCentralServerConnection();
    } catch (error) {
      remoteActionError = error instanceof Error ? error.message : String(error || 'Failed to enable host mode');
    }
    await renderRemoteView();
  });

  document.getElementById('hostRotateBtn')?.addEventListener('click', async () => {
    try {
      remoteActionError = '';
      const response = await roomAccessAction('/api/server/room-access/guest-secret/rotate');
      lastIssuedGuestSecret = response.guestSecret || '';
    } catch (error) {
      remoteActionError = error instanceof Error ? error.message : String(error || 'Failed to rotate guest secret');
    }
    await renderRemoteView();
  });

  document.getElementById('hostDisableBtn')?.addEventListener('click', async () => {
    try {
      remoteActionError = '';
      await roomAccessAction('/api/server/room-access/disable');
      lastIssuedGuestSecret = '';
    } catch (error) {
      remoteActionError = error instanceof Error ? error.message : String(error || 'Failed to disable host mode');
    }
    await renderRemoteView();
  });

  document.getElementById('guestJoinForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('guestInviteInput') as HTMLInputElement | null;
    if (!input) return;
    try {
      remoteActionError = '';
      const invite = parseGuestInviteLink(input.value);
      await saveCentralServerConfig({
        baseUrl: invite.baseUrl,
        roomSecret: invite.guestSecret,
        remoteMode: 'guest',
      });
      stopCentralServerConnection();
      window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
      await renderRemoteView();
      void startCentralServerConnection();
    } catch (error) {
      remoteActionError = error instanceof Error ? error.message : String(error || 'Invalid invite link');
      await renderRemoteView();
    }
  });

  container.querySelectorAll<HTMLButtonElement>('.remote-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy ?? '';
      copyToClipboard(text, btn);
    });
  });
}

export function startRemoteViewPolling(): void {
  void startCentralServerConnection();
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (isRemoteInputFocused()) return;
    const remoteView = document.getElementById('remoteView');
    if (remoteView?.classList.contains('active') || remoteView?.closest('.view-section.active')) {
      void renderRemoteView();
    }
  }, 3000);
}

export function stopRemoteViewPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  stopCentralServerConnection();
}
