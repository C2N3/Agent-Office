import {
  fetchCentralServerConfig,
  fetchCentralServerSnapshot,
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
import {
  renderRemotePanel,
  type RoomAccessStatus,
} from './remoteView/render.js';
import { type RemoteSnapshot } from './remoteView/status.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastIssuedGuestSecret = '';
let remoteActionError = '';
let pendingRemoteMode: RemoteMode | null = null;

function copyToClipboard(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {});
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

function getDisplayedSnapshot(
  snapshot: Awaited<ReturnType<typeof fetchCentralServerSnapshot>>,
  mode: RemoteMode,
  roomSecretConfigured: boolean,
): RemoteSnapshot {
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

async function applyRemoteModeChange(nextMode: RemoteMode, persistedMode: RemoteMode): Promise<void> {
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
  const currentBaseUrl = config?.baseUrl || snapshot.config?.baseUrl || '';
  const inviteSecret = lastIssuedGuestSecret || roomAccess?.guestSecret || '';
  const inviteLink = currentBaseUrl && inviteSecret ? buildGuestInviteLink(currentBaseUrl, inviteSecret) : '';

  container.innerHTML = renderRemotePanel({
    config,
    currentBaseUrl,
    inviteLink,
    mode,
    remoteActionError,
    roomAccess,
    snapshot: displayedSnapshot,
  });

  container.querySelectorAll<HTMLInputElement>('input[name="remoteMode"]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target?.checked) return;
      await applyRemoteModeChange(target.value as RemoteMode, persistedMode);
    });
  });

  container.querySelectorAll<HTMLElement>('.remote-mode-pill[data-remote-mode]').forEach((pill) => {
    pill.addEventListener('click', async (event) => {
      event.preventDefault();
      await applyRemoteModeChange(pill.dataset.remoteMode as RemoteMode, persistedMode);
    });
    pill.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      await applyRemoteModeChange(pill.dataset.remoteMode as RemoteMode, persistedMode);
    });
  });

  document.getElementById('centralServerUrlForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('centralServerUrlInput') as HTMLInputElement | null;
    const tokenInput = document.getElementById('centralWorkerTokenInput') as HTMLInputElement | null;
    const button = document.getElementById('centralServerUrlSaveBtn') as HTMLButtonElement | null;
    const errorEl = document.getElementById('centralServerUrlError');
    if (!input) return;

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      const workerToken = tokenInput?.value.trim() || '';
      await saveCentralServerConfig({
        baseUrl: input.value,
        ...(workerToken ? { workerToken } : {}),
      });
      remoteActionError = '';
      stopCentralServerConnection();
      window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
      void startCentralServerConnection();
      await renderRemoteView();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Failed to save server settings');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      } else {
        remoteActionError = message;
        await renderRemoteView();
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Save';
      }
    }
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

  document.getElementById('remoteStatusRefreshBtn')?.addEventListener('click', () => {
    void renderRemoteView();
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
