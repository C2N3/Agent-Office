import type { RemoteMode } from '../remoteMode';
import type { RemoteSnapshot } from './status';

export type RoomAccessStatus = {
  publicMode: boolean;
  ownerSecretSet: boolean;
  guestSecretSet: boolean;
  ownerSecret?: string;
  guestSecret?: string;
  ownerSecretState?: string;
  guestSecretState?: string;
};

export type RemoteServerConfig = {
  baseUrl?: string;
  remoteMode?: RemoteMode;
  roomSecretConfigured?: boolean;
  workerTokenConfigured?: boolean;
  workerConnectionStatus?: string;
};

export type RemoteViewState = {
  config: RemoteServerConfig | null;
  copiedInvite: boolean;
  guestInviteDraft: string;
  lastConsumedGuestInviteHref: string;
  lastIssuedGuestInviteLink: string;
  lastIssuedGuestSecret: string;
  remoteActionError: string;
  roomAccess: RoomAccessStatus | null;
  selectedRemoteMode: RemoteMode | null;
  serverUrlDraft: string;
  snapshot: RemoteSnapshot | null;
  hostRecoveryExpanded: boolean;
  hostRecoveryInProgress: boolean;
  statusDetailsExpanded: boolean;
};

export type RemoteViewModel = {
  copiedInvite: boolean;
  currentBaseUrl: string;
  guestInviteValue: string;
  hostAccessMissing: boolean;
  hostOwnerAccessMessage: string;
  hostRecoveryAvailable: boolean;
  hostRecoveryExpanded: boolean;
  hostRecoveryInProgress: boolean;
  inviteLink: string;
  mode: RemoteMode;
  persistedMode: RemoteMode;
  remoteActionError: string;
  roomAccess: RoomAccessStatus | null;
  serverUrlValue: string;
  snapshot: RemoteSnapshot;
  statusDetailsExpanded: boolean;
};

export type RemoteViewActions = {
  onCopyInvite: () => void;
  onGuestInviteChange: (value: string) => void;
  onGuestJoin: () => void | Promise<void>;
  onHostDisable: () => void | Promise<void>;
  onHostEnable: () => void | Promise<void>;
  onHostRecoveryToggle: () => void;
  onHostResetAccess: () => void | Promise<void>;
  onHostRotate: () => void | Promise<void>;
  onHostStart: () => void | Promise<void>;
  onLocalApply: () => void | Promise<void>;
  onModeSelect: (mode: RemoteMode) => void;
  onRefreshStatus: () => void;
  onServerUrlChange: (value: string) => void;
  onStatusDetailsToggle: (expanded: boolean) => void;
};
