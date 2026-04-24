import { parseGuestInviteLink, type RemoteMode } from '../remoteMode.js';
import { checkHostAccess, fetchRoomAccessStatus } from './roomAccess.js';
import type { RoomAccessStatus } from './types.js';
import { getRemoteViewState, updateRemoteViewState } from './store.js';
import { fetchCentralServerConfig, fetchCentralServerSnapshot, saveCentralServerConfig, startCentralServerConnection, stopCentralServerConnection } from '../serverConnection.js';
import { formatHostRotateError, hostAddressMismatchMessage, isOwnerAccessErrorMessage, ownerAccessRequiredMessage } from './messages.js';

let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

class RoomAccessActionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoomAccessActionError';
    this.status = status;
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
    throw new RoomAccessActionError(res.status, message);
  }
  return payload as RoomAccessStatus;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : String(error || fallback);
}

function isLegacyInviteFallbackError(error: unknown): boolean {
  return error instanceof RoomAccessActionError && (error.status === 404 || error.status === 405);
}

async function persistOwnerSecret(response: RoomAccessStatus): Promise<void> {
  if (!response.ownerSecret) return;
  await applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
}

function requireGuestSecret(response: RoomAccessStatus): RoomAccessStatus {
  if ((response.guestSecret || '').trim()) return response;
  throw new Error('Server contract error: invite response is missing guestSecret');
}

async function createLegacyHostInvite(): Promise<RoomAccessStatus> {
  const enabled = await roomAccessAction('/api/server/room-access/enable');
  await persistOwnerSecret(enabled);
  if ((enabled.guestSecret || '').trim()) {
    return enabled;
  }
  const rotated = await roomAccessAction('/api/server/room-access/guest-secret/rotate');
  await persistOwnerSecret(rotated);
  return requireGuestSecret(rotated);
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

  const [config, snapshot, roomAccessResult] = await Promise.all([
    fetchCentralServerConfig(),
    fetchCentralServerSnapshot(),
    fetchRoomAccessStatus(),
  ]);

  const currentBaseUrl = config?.baseUrl || snapshot.config?.baseUrl || '';
  const ownerAccessError = config?.remoteMode === 'host'
    && !config.roomSecretConfigured
    && (roomAccessResult.roomAccess?.ownerSecretSet || roomAccessResult.status === 'auth')
    ? ownerAccessRequiredMessage()
    : '';
  updateRemoteViewState((current) => ({
    config,
    roomAccess: roomAccessResult.roomAccess,
    snapshot,
    remoteActionError: ownerAccessError
      ? (current.remoteActionError && !isOwnerAccessErrorMessage(current.remoteActionError)
          ? current.remoteActionError
          : ownerAccessError)
      : (isOwnerAccessErrorMessage(current.remoteActionError) ? '' : current.remoteActionError),
    serverUrlDraft: globalThis.document?.activeElement?.id === 'centralServerUrlInput'
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

  try {
    const response = await createHostInvite();
    updateRemoteViewState({
      lastIssuedGuestSecret: response.guestSecret || '',
      remoteActionError: '',
      selectedRemoteMode: null,
    });
    resetCopiedInvite();
  } catch (error) {
    updateRemoteViewState({
      lastIssuedGuestSecret: '',
      remoteActionError: formatHostRotateError(errorMessage(error, 'Failed to create invite link')),
      selectedRemoteMode: null,
    });
  }
}

export async function handleHostEnable(): Promise<void> {
  updateRemoteViewState({ remoteActionError: '' });
  try {
    const response = await createHostInvite();
    updateRemoteViewState({
      lastIssuedGuestSecret: response.guestSecret || '',
      selectedRemoteMode: null,
    });
    resetCopiedInvite();
  } catch (error) {
    updateRemoteViewState({
      remoteActionError: formatHostRotateError(errorMessage(error, 'Failed to create invite link')),
    });
  }
}

async function createHostInvite(): Promise<RoomAccessStatus> {
  try {
    const invited = await roomAccessAction('/api/server/room-access/invite');
    await persistOwnerSecret(invited);
    return requireGuestSecret(invited);
  } catch (error) {
    if (!isLegacyInviteFallbackError(error)) {
      throw error;
    }
  }
  return createLegacyHostInvite();
}

export async function handleHostRotate(): Promise<void> {
  updateRemoteViewState({ remoteActionError: '' });
  try {
    const response = await createHostInvite();
    updateRemoteViewState({
      lastIssuedGuestSecret: response.guestSecret || '',
    });
    resetCopiedInvite();
  } catch (error) {
    const message = errorMessage(error, 'Failed to create invite link');
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
      remoteActionError: errorMessage(error, 'Failed to disable host mode'),
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
