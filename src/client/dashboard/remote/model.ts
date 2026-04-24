import { buildGuestInviteLink } from '../remoteMode.js';
import { ownerAccessRequiredMessage, isOwnerAccessErrorMessage } from './messages.js';
import type { RemoteViewModel, RemoteViewState } from './types.js';

function createEmptySnapshot() {
  return {
    config: null,
    error: null,
    eventsConnected: false,
    health: null,
    workers: [],
  };
}

export function deriveRemoteViewModel(state: RemoteViewState): RemoteViewModel {
  const snapshot = state.snapshot || createEmptySnapshot();
  const persistedMode = state.config?.remoteMode || 'local';
  const mode = state.selectedRemoteMode || persistedMode;
  const currentBaseUrl = state.config?.baseUrl || snapshot.config?.baseUrl || '';
  const inviteSecret = state.lastIssuedGuestSecret || state.roomAccess?.guestSecret || '';
  const hostOwnerAccessRequired = persistedMode === 'host'
    && !state.config?.roomSecretConfigured
    && (state.roomAccess?.ownerSecretSet || isOwnerAccessErrorMessage(state.remoteActionError));
  const inviteLink = currentBaseUrl && inviteSecret
    ? buildGuestInviteLink(globalThis.window?.location?.origin || currentBaseUrl, currentBaseUrl, inviteSecret)
    : '';
  const adjustedSnapshot = snapshot.config
    ? {
        ...snapshot,
        config: {
          ...snapshot.config,
          baseUrl: currentBaseUrl || snapshot.config.baseUrl,
        },
      }
    : snapshot;

  return {
    copiedInvite: state.copiedInvite,
    currentBaseUrl,
    guestInviteValue: state.guestInviteDraft,
    hostOwnerAccessMessage: hostOwnerAccessRequired ? ownerAccessRequiredMessage() : '',
    hostOwnerAccessRequired,
    inviteLink,
    mode,
    persistedMode,
    remoteActionError: state.remoteActionError,
    roomAccess: state.roomAccess,
    serverUrlValue: state.serverUrlDraft,
    snapshot: adjustedSnapshot,
    statusDetailsExpanded: state.statusDetailsExpanded,
  };
}
