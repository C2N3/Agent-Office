import { type RemoteMode, parseGuestInviteLink } from '../remoteMode.js';
import { formatHostRotateError, hostAddressMismatchMessage } from './messages.js';

type LegacyContext = {
  applyRemoteSettings: (update: { baseUrl?: string; roomSecret?: string; remoteMode: RemoteMode }) => Promise<void>;
  checkHostAccess: () => Promise<'ok' | 'auth' | 'unavailable'>;
  container: any;
  persistedMode: RemoteMode;
  readServerSettingsInputs: () => { baseUrl?: string };
  renderRemoteView: () => Promise<void>;
  roomAccessAction: (path: string) => Promise<{ guestSecret?: string; ownerSecret?: string }>;
  setLastIssuedGuestSecret: (value: string) => void;
  setRemoteActionError: (value: string) => void;
  setSelectedRemoteMode: (value: RemoteMode | null) => void;
  setStatusDetailsExpanded: (value: boolean) => void;
  selectMode: (mode: RemoteMode) => Promise<void>;
};

export function attachLegacyRemoteEvents(context: LegacyContext): void {
  const {
    applyRemoteSettings,
    checkHostAccess,
    container,
    persistedMode,
    readServerSettingsInputs,
    renderRemoteView,
    roomAccessAction,
    setLastIssuedGuestSecret,
    setRemoteActionError,
    setSelectedRemoteMode,
    setStatusDetailsExpanded,
    selectMode,
  } = context;

  container.querySelectorAll?.('input[name="remoteMode"]')?.forEach((input) => {
    input.addEventListener('change', async (event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target?.checked) return;
      await selectMode(target.value as RemoteMode);
    });
  });

  container.querySelectorAll?.('.remote-mode-pill[data-remote-mode]')?.forEach((pill) => {
    pill.addEventListener('click', async (event) => {
      event.preventDefault();
      await selectMode(pill.dataset.remoteMode as RemoteMode);
    });
    pill.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      await selectMode(pill.dataset.remoteMode as RemoteMode);
    });
  });

  document.getElementById('localApplyBtn')?.addEventListener('click', async () => {
    try {
      await applyRemoteSettings({
        ...readServerSettingsInputs(),
        remoteMode: 'local',
      });
      setSelectedRemoteMode(null);
      setRemoteActionError('');
    } catch (error) {
      setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to save server settings'));
    }
    await renderRemoteView();
  });

  document.getElementById('hostStartBtn')?.addEventListener('click', async () => {
    try {
      await applyRemoteSettings({
        ...readServerSettingsInputs(),
        remoteMode: 'host',
      });
      if (persistedMode === 'host') {
        setLastIssuedGuestSecret('');
        setRemoteActionError(await checkHostAccess() === 'auth' ? hostAddressMismatchMessage() : '');
        setSelectedRemoteMode(null);
        await renderRemoteView();
        return;
      }

      const response = await roomAccessAction('/api/server/room-access/enable');
      setLastIssuedGuestSecret(response.guestSecret || '');
      if (response.ownerSecret) {
        await applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
      }
      setSelectedRemoteMode(null);
      setRemoteActionError('');
    } catch (error) {
      setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to start host mode'));
    }
    await renderRemoteView();
  });

  document.getElementById('hostEnableBtn')?.addEventListener('click', async () => {
    try {
      setRemoteActionError('');
      const response = await roomAccessAction('/api/server/room-access/enable');
      setLastIssuedGuestSecret(response.guestSecret || '');
      if (response.ownerSecret) {
        await applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
      } else {
        await applyRemoteSettings({ remoteMode: 'host' });
      }
      setSelectedRemoteMode(null);
    } catch (error) {
      setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to enable host mode'));
    }
    await renderRemoteView();
  });

  document.getElementById('hostRotateBtn')?.addEventListener('click', async () => {
    try {
      setRemoteActionError('');
      const response = await roomAccessAction('/api/server/room-access/guest-secret/rotate');
      setLastIssuedGuestSecret(response.guestSecret || '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Failed to rotate guest secret');
      setRemoteActionError(formatHostRotateError(message));
    }
    await renderRemoteView();
  });

  document.getElementById('hostDisableBtn')?.addEventListener('click', async () => {
    try {
      setRemoteActionError('');
      await roomAccessAction('/api/server/room-access/disable');
      setLastIssuedGuestSecret('');
    } catch (error) {
      setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to disable host mode'));
    }
    await renderRemoteView();
  });

  document.getElementById('guestJoinBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('guestInviteInput') as HTMLInputElement | null;
    if (!input) return;
    try {
      setRemoteActionError('');
      const invite = parseGuestInviteLink(input.value);
      await applyRemoteSettings({
        baseUrl: invite.baseUrl,
        roomSecret: invite.guestSecret,
        remoteMode: 'guest',
      });
      setSelectedRemoteMode(null);
    } catch (error) {
      setRemoteActionError(error instanceof Error ? error.message : String(error || 'Invalid invite link'));
    }
    await renderRemoteView();
  });

  document.getElementById('remoteStatusRefreshBtn')?.addEventListener('click', () => {
    void renderRemoteView();
  });

  container.querySelector?.('.remote-settings')?.addEventListener?.('toggle', (event) => {
    setStatusDetailsExpanded(!!(event.currentTarget as HTMLDetailsElement | null)?.open);
  });
}
