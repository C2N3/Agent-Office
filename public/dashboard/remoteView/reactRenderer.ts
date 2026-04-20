import { createElement } from 'react';
import { renderInto } from '../react/root.js';
import { type RemoteMode } from '../remoteMode.js';
import { RemotePanel } from '../react/remotePanel.js';
import type { RoomAccessStatus } from './render.js';
import type { RemoteSnapshot } from './status.js';

export function renderReactRemotePanel({
  container,
  copiedInvite,
  currentBaseUrl,
  guestInviteValue,
  inviteLink,
  mode,
  persistedMode,
  remoteActionError,
  roomAccess,
  serverUrlValue,
  snapshot,
  statusDetailsExpanded,
  onCopyInvite,
  onGuestInviteChange,
  onGuestJoin,
  onHostDisable,
  onHostEnable,
  onHostRotate,
  onHostStart,
  onLocalApply,
  onModeSelect,
  onRefreshStatus,
  onServerUrlChange,
  onStatusDetailsToggle,
}: {
  container: HTMLElement;
  copiedInvite: boolean;
  currentBaseUrl: string;
  guestInviteValue: string;
  inviteLink: string;
  mode: RemoteMode;
  persistedMode: RemoteMode;
  remoteActionError: string;
  roomAccess: RoomAccessStatus | null;
  serverUrlValue: string;
  snapshot: RemoteSnapshot;
  statusDetailsExpanded: boolean;
  onCopyInvite: () => void;
  onGuestInviteChange: (value: string) => void;
  onGuestJoin: () => void | Promise<void>;
  onHostDisable: () => void | Promise<void>;
  onHostEnable: () => void | Promise<void>;
  onHostRotate: () => void | Promise<void>;
  onHostStart: () => void | Promise<void>;
  onLocalApply: () => void | Promise<void>;
  onModeSelect: (mode: RemoteMode) => void;
  onRefreshStatus: () => void;
  onServerUrlChange: (value: string) => void;
  onStatusDetailsToggle: (expanded: boolean) => void;
}): void {
  renderInto(
    container,
    createElement(RemotePanel, {
      copiedInvite,
      currentBaseUrl,
      guestInviteValue,
      inviteLink,
      mode,
      persistedMode,
      remoteActionError,
      roomAccess,
      serverUrlValue,
      snapshot,
      statusDetailsExpanded,
      onCopyInvite,
      onGuestInviteChange,
      onGuestJoin,
      onHostDisable,
      onHostEnable,
      onHostRotate,
      onHostStart,
      onLocalApply,
      onModeSelect,
      onRefreshStatus,
      onServerUrlChange,
      onStatusDetailsToggle,
    }),
  );
}
