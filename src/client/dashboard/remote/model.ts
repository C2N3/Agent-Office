import { buildGuestInviteLink } from '../remoteMode';
import { inviteLinkMatchesBaseUrl, readStoredHostInviteLink } from './invitePersistence';
import { isLoopbackCentralServer } from './recovery';
import { ownerAccessRequiredMessage, isOwnerAccessErrorMessage } from './messages';
import type { RemoteViewModel, RemoteViewState } from './types';

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
  const issuedInviteLink = inviteLinkMatchesBaseUrl(state.lastIssuedGuestInviteLink, currentBaseUrl)
    ? state.lastIssuedGuestInviteLink
    : '';
  const storedInviteLink = readStoredHostInviteLink(currentBaseUrl);
  const currentInviteSecret = state.lastIssuedGuestSecret || state.roomAccess?.guestSecret || '';
  const hostAccessMissing = persistedMode === 'host'
    && !state.config?.roomSecretConfigured
    && !state.config?.workerTokenConfigured
    && (state.roomAccess?.ownerSecretSet || isOwnerAccessErrorMessage(state.remoteActionError));
  const hostRecoveryAvailable = hostAccessMissing && isLoopbackCentralServer(currentBaseUrl);
  const inviteLink = issuedInviteLink
    || (currentBaseUrl && currentInviteSecret
      ? buildGuestInviteLink(globalThis.window?.location?.origin || currentBaseUrl, currentBaseUrl, currentInviteSecret)
      : '')
    || storedInviteLink;
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
    hostAccessMissing,
    hostOwnerAccessMessage: hostAccessMissing ? ownerAccessRequiredMessage() : '',
    hostRecoveryAvailable,
    hostRecoveryExpanded: state.hostRecoveryExpanded,
    hostRecoveryInProgress: state.hostRecoveryInProgress,
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
