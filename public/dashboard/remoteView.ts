import { fetchCentralServerConfig, fetchCentralServerSnapshot, saveCentralServerConfig, startCentralServerConnection, stopCentralServerConnection } from './serverConnection.js';
import { buildGuestInviteLink, parseGuestInviteLink, type RemoteMode } from './remoteMode.js';
import { checkHostAccess, fetchRoomAccess } from './remoteView/roomAccess.js';
import { renderRemotePanel, type RoomAccessStatus } from './remoteView/render.js';
import { type RemoteSnapshot } from './remoteView/status.js';
import type { RemoteViewRenderState } from './remoteView/renderState.js';
import { attachLegacyRemoteEvents } from './remoteView/legacy.js';
import { renderReactRemotePanel } from './remoteView/reactRenderer.js';
import { createRemoteReactActions } from './remoteView/reactActions.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastIssuedGuestSecret = '';
let remoteActionError = '';
let selectedRemoteMode: RemoteMode | null = null;
let lastConsumedGuestInviteHref = '';
let statusDetailsExpanded = false;
let serverUrlDraft = '';
let guestInviteDraft = '';
let copiedInvite = false;
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
let lastRenderState: RemoteViewRenderState | null = null;
type LegacyRemoteContainer = {
  innerHTML: string;
  classList?: { contains?: (value: string) => boolean };
  closest?: (selector: string) => Element | null;
  querySelector?: (selector: string) => any;
  querySelectorAll?: (selector: string) => any[];
};

function isRemoteInputFocused(): boolean {
  const focusedId = document.activeElement?.id;
  const focusedName = (document.activeElement as HTMLInputElement | null)?.name;
  return focusedId === 'centralServerUrlInput'
    || focusedId === 'guestInviteInput'
    || focusedName === 'remoteMode';
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

function getSelectedRemoteMode(configMode: RemoteMode): RemoteMode {
  return selectedRemoteMode || configMode;
}

function getDisplayedSnapshot(
  snapshot: Awaited<ReturnType<typeof fetchCentralServerSnapshot>>,
  mode: RemoteMode,
  _roomSecretConfigured: boolean,
): RemoteSnapshot {
  if (!snapshot.config) return snapshot;
  return {
    ...snapshot,
    config: {
      ...snapshot.config,
      remoteMode: mode,
    },
  };
}

async function applyRemoteSettings(update: {
  baseUrl?: string;
  roomSecret?: string;
  remoteMode: RemoteMode;
}): Promise<void> {
  await saveCentralServerConfig(update);
  stopCentralServerConnection();
  window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
  void startCentralServerConnection();
}

function readServerSettingsInputs(): { baseUrl?: string } {
  const input = document.getElementById('centralServerUrlInput') as HTMLInputElement | null;
  return { baseUrl: input?.value ?? serverUrlDraft };
}

function resetCopiedInvite(): void {
  copiedInvite = false;
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  }
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    copiedInvite = true;
    renderCurrentRemotePanel();
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copiedInvite = false;
      renderCurrentRemotePanel();
    }, 1500);
  }).catch(() => {});
}

function renderCurrentRemotePanel(): void {
  const container = document.getElementById('remoteView') as HTMLElement | LegacyRemoteContainer | null;
  if (!container || !lastRenderState) return;

  const { config, roomAccess, snapshot } = lastRenderState;
  const persistedMode = (config?.remoteMode || 'local') as RemoteMode;
  const mode = getSelectedRemoteMode(persistedMode);
  const displayedSnapshot = getDisplayedSnapshot(snapshot, mode, !!config?.roomSecretConfigured);
  const currentBaseUrl = config?.baseUrl || snapshot.config?.baseUrl || '';
  const inviteSecret = lastIssuedGuestSecret || roomAccess?.guestSecret || '';
  const inviteLink = currentBaseUrl && inviteSecret
    ? buildGuestInviteLink(globalThis.window?.location?.origin || currentBaseUrl, currentBaseUrl, inviteSecret)
    : '';

  if (document.activeElement?.id !== 'centralServerUrlInput') {
    serverUrlDraft = currentBaseUrl;
  }

  const renderArgs = {
    config,
    currentBaseUrl,
    inviteLink,
    mode,
    persistedMode,
    statusDetailsExpanded,
    remoteActionError,
    roomAccess,
    snapshot: displayedSnapshot,
  };

  if (!isRenderableElement(container)) {
    container.innerHTML = renderRemotePanel(renderArgs);
    attachLegacyRemoteEvents({
      applyRemoteSettings,
      checkHostAccess,
      container,
      persistedMode,
      readServerSettingsInputs,
      renderRemoteView,
      roomAccessAction,
      setLastIssuedGuestSecret: (value: string) => {
        lastIssuedGuestSecret = value;
      },
      setRemoteActionError: (value: string) => {
        remoteActionError = value;
      },
      setSelectedRemoteMode: (value: RemoteMode | null) => {
        selectedRemoteMode = value;
      },
      setStatusDetailsExpanded: (value: boolean) => {
        statusDetailsExpanded = value;
      },
      selectMode: handleModeSelection,
    });
    return;
  }

  const actions = createRemoteReactActions({
    applyRemoteSettings,
    checkHostAccess,
    getGuestInviteDraft: () => guestInviteDraft,
    getServerUrlDraft: () => serverUrlDraft,
    renderCurrentRemotePanel,
    renderRemoteView,
    resetCopiedInvite,
    roomAccessAction,
    setGuestInviteDraft: (value: string) => {
      guestInviteDraft = value;
    },
    setLastIssuedGuestSecret: (value: string) => {
      lastIssuedGuestSecret = value;
    },
    setRemoteActionError: (value: string) => {
      remoteActionError = value;
    },
    setSelectedRemoteMode: (value: RemoteMode | null) => {
      selectedRemoteMode = value;
    },
    setServerUrlDraft: (value: string) => {
      serverUrlDraft = value;
    },
    setSelectedModeDraft: (value: RemoteMode) => {
      selectedRemoteMode = value;
    },
    setStatusDetailsExpanded: (value: boolean) => {
      statusDetailsExpanded = value;
    },
  });

  renderReactRemotePanel({
    container,
    copiedInvite,
    currentBaseUrl,
    guestInviteValue: guestInviteDraft,
    inviteLink,
    mode,
    persistedMode,
    remoteActionError,
    roomAccess,
    serverUrlValue: serverUrlDraft,
    snapshot: displayedSnapshot,
    statusDetailsExpanded,
    onCopyInvite: () => copyToClipboard(inviteLink),
    onGuestInviteChange: actions.onGuestInviteChange,
    onGuestJoin: actions.onGuestJoin,
    onHostDisable: actions.onHostDisable,
    onHostEnable: actions.onHostEnable,
    onHostRotate: actions.onHostRotate,
    onHostStart: () => actions.onHostStart(persistedMode),
    onLocalApply: actions.onLocalApply,
    onModeSelect: actions.onModeSelect,
    onRefreshStatus: actions.onRefreshStatus,
    onServerUrlChange: actions.onServerUrlChange,
    onStatusDetailsToggle: actions.onStatusDetailsToggle,
  });
}

function isRenderableElement(value: unknown): value is HTMLElement {
  return !!value
    && typeof value === 'object'
    && 'nodeType' in (value as Record<string, unknown>)
    && (value as { nodeType?: number }).nodeType === 1;
}

async function handleModeSelection(nextMode: RemoteMode): Promise<void> {
  selectedRemoteMode = nextMode;
  remoteActionError = '';
  renderCurrentRemotePanel();
}

async function maybeAutoJoinGuestInvite(): Promise<void> {
  const href = globalThis.window?.location?.href || '';
  if (!href || !href.includes('aoGuestSecret=')) return;
  if (href === lastConsumedGuestInviteHref) return;
  lastConsumedGuestInviteHref = href;
  try {
    const invite = parseGuestInviteLink(href);
    await applyRemoteSettings({
      baseUrl: invite.baseUrl,
      roomSecret: invite.guestSecret,
      remoteMode: 'guest',
    });
    serverUrlDraft = invite.baseUrl;
    guestInviteDraft = '';
    selectedRemoteMode = null;
    remoteActionError = '';
    globalThis.window?.history?.replaceState?.({}, '', `${window.location.pathname}${window.location.search}`);
  } catch (error) {
    remoteActionError = error instanceof Error ? error.message : String(error || 'Invalid invite link');
  }
}

export async function renderRemoteView(): Promise<void> {
  const container = document.getElementById('remoteView');
  if (!container) return;
  await maybeAutoJoinGuestInvite();

  const [config, snapshot, roomAccess] = await Promise.all([
    fetchCentralServerConfig(),
    fetchCentralServerSnapshot(),
    fetchRoomAccess(),
  ]);
  lastRenderState = { config, roomAccess, snapshot };
  renderCurrentRemotePanel();
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
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  stopCentralServerConnection();
}
