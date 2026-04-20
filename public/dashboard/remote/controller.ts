import { parseGuestInviteLink, type RemoteMode } from '../remoteMode.js';
import { checkHostAccess } from '../remoteView/roomAccess.js';
import type { RoomAccessStatus } from './types.js';
import { getRemoteViewState, updateRemoteViewState } from './store.js';
import { fetchCentralServerConfig, fetchCentralServerSnapshot, saveCentralServerConfig, startCentralServerConnection, stopCentralServerConnection } from '../serverConnection.js';
import { formatHostRotateError, hostAddressMismatchMessage } from '../remoteView/messages.js';

let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

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

function setCopiedInviteFeedback(value: boolean): void {
  updateRemoteViewState({ copiedInvite: value });
}

export function resetCopiedInvite(): void {
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  }
  setCopiedInviteFeedback(false);
}

export function copyInviteText(text: string): void {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    setCopiedInviteFeedback(true);
    if (copyFeedbackTimer) {
      clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = setTimeout(() => {
      resetCopiedInvite();
    }, 1500);
  }).catch(() => {});
}

export async function applyRemoteSettings(update: {
  baseUrl?: string;
  roomSecret?: string;
  remoteMode: RemoteMode;
}): Promise<void> {
  await saveCentralServerConfig(update);
  stopCentralServerConnection();
  window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
  void startCentralServerConnection();
}

export async function refreshRemoteViewData(): Promise<void> {
  await maybeAutoJoinGuestInvite();

  const [config, snapshot, roomAccess] = await Promise.all([
    fetchCentralServerConfig(),
    fetchCentralServerSnapshot(),
    fetchRoomAccess(),
  ]);

  const currentBaseUrl = config?.baseUrl || snapshot.config?.baseUrl || '';
  updateRemoteViewState((current) => ({
    config,
    roomAccess,
    snapshot,
    serverUrlDraft: document.activeElement?.id === 'centralServerUrlInput'
      ? current.serverUrlDraft
      : currentBaseUrl,
  }));
}

export async function maybeAutoJoinGuestInvite(): Promise<void> {
  const href = globalThis.window?.location?.href || '';
  if (!href || !href.includes('aoGuestSecret=')) return;
  if (href === getRemoteViewState().lastConsumedGuestInviteHref) return;

  updateRemoteViewState({ lastConsumedGuestInviteHref: href });
  try {
    const invite = parseGuestInviteLink(href);
    await applyRemoteSettings({
      baseUrl: invite.baseUrl,
      roomSecret: invite.guestSecret,
      remoteMode: 'guest',
    });
    updateRemoteViewState({
      guestInviteDraft: '',
      remoteActionError: '',
      selectedRemoteMode: null,
      serverUrlDraft: invite.baseUrl,
    });
    globalThis.window?.history?.replaceState?.({}, '', `${window.location.pathname}${window.location.search}`);
  } catch (error) {
    updateRemoteViewState({
      remoteActionError: error instanceof Error ? error.message : String(error || 'Invalid invite link'),
    });
  }
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

export async function handleHostStart(): Promise<void> {
  const { config } = getRemoteViewState();
  const persistedMode = config?.remoteMode || 'local';
  const serverUrl = getRemoteViewState().serverUrlDraft;

  await applyRemoteSettings({
    baseUrl: serverUrl,
    remoteMode: 'host',
  });

  if (persistedMode === 'host') {
    resetCopiedInvite();
    updateRemoteViewState({
      lastIssuedGuestSecret: '',
      remoteActionError: await checkHostAccess() === 'auth' ? hostAddressMismatchMessage() : '',
      selectedRemoteMode: null,
    });
    return;
  }

  const response = await roomAccessAction('/api/server/room-access/enable');
  updateRemoteViewState({
    lastIssuedGuestSecret: response.guestSecret || '',
    remoteActionError: '',
    selectedRemoteMode: null,
  });
  if (response.ownerSecret) {
    await applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
  }
  resetCopiedInvite();
}

export async function handleHostEnable(): Promise<void> {
  updateRemoteViewState({ remoteActionError: '' });
  const response = await roomAccessAction('/api/server/room-access/enable');
  updateRemoteViewState({
    lastIssuedGuestSecret: response.guestSecret || '',
    selectedRemoteMode: null,
  });
  if (response.ownerSecret) {
    await applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
  } else {
    await applyRemoteSettings({ remoteMode: 'host' });
  }
  resetCopiedInvite();
}

export async function handleHostRotate(): Promise<void> {
  updateRemoteViewState({ remoteActionError: '' });
  try {
    const response = await roomAccessAction('/api/server/room-access/guest-secret/rotate');
    updateRemoteViewState({
      lastIssuedGuestSecret: response.guestSecret || '',
    });
    resetCopiedInvite();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Failed to rotate guest secret');
    updateRemoteViewState({ remoteActionError: formatHostRotateError(message) });
  }
}

export async function handleHostDisable(): Promise<void> {
  updateRemoteViewState({ remoteActionError: '' });
  try {
    await roomAccessAction('/api/server/room-access/disable');
    updateRemoteViewState({ lastIssuedGuestSecret: '' });
    resetCopiedInvite();
  } catch (error) {
    updateRemoteViewState({
      remoteActionError: error instanceof Error ? error.message : String(error || 'Failed to disable host mode'),
    });
  }
}

export async function handleGuestJoin(): Promise<void> {
  try {
    updateRemoteViewState({ remoteActionError: '' });
    const invite = parseGuestInviteLink(getRemoteViewState().guestInviteDraft);
    await applyRemoteSettings({
      baseUrl: invite.baseUrl,
      roomSecret: invite.guestSecret,
      remoteMode: 'guest',
    });
    updateRemoteViewState({
      guestInviteDraft: '',
      remoteActionError: '',
      selectedRemoteMode: null,
      serverUrlDraft: invite.baseUrl,
    });
  } catch (error) {
    updateRemoteViewState({
      remoteActionError: error instanceof Error ? error.message : String(error || 'Invalid invite link'),
    });
  }
}

export async function handleLocalApply(): Promise<void> {
  try {
    await applyRemoteSettings({
      baseUrl: getRemoteViewState().serverUrlDraft,
      remoteMode: 'local',
    });
    updateRemoteViewState({
      remoteActionError: '',
      selectedRemoteMode: null,
    });
  } catch (error) {
    updateRemoteViewState({
      remoteActionError: error instanceof Error ? error.message : String(error || 'Failed to save server settings'),
    });
  }
}
