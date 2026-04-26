import { type RemoteMode } from '../remoteMode.js';
import { refreshRemoteViewData } from './controller.js';
import { copyInviteText, handleGuestJoin, handleHostDisable, handleHostEnable, handleHostResetAccess, handleHostRotate, handleHostStart, handleLocalApply } from './controller.js';
import { deriveRemoteViewModel } from './model.js';
import { getRemoteViewState, setSelectedRemoteMode, updateRemoteViewState } from './store.js';
import type { RemoteViewActions } from './types.js';

export function createRemoteViewActions(): RemoteViewActions {
  return {
    onCopyInvite: () => {
      copyInviteText(deriveRemoteViewModel(getRemoteViewState()).inviteLink);
    },
    onGuestInviteChange: (value: string) => {
      updateRemoteViewState({ guestInviteDraft: value });
    },
    onGuestJoin: async () => {
      await handleGuestJoin();
      await refreshRemoteViewData();
    },
    onHostDisable: async () => {
      await handleHostDisable();
      await refreshRemoteViewData();
    },
    onHostEnable: async () => {
      await handleHostEnable();
      await refreshRemoteViewData();
    },
    onHostRecoveryToggle: () => {
      updateRemoteViewState((state) => ({ hostRecoveryExpanded: !state.hostRecoveryExpanded, remoteActionError: '' }));
    },
    onHostResetAccess: async () => {
      await handleHostResetAccess();
      await refreshRemoteViewData();
    },
    onHostRotate: async () => {
      await handleHostRotate();
      await refreshRemoteViewData();
    },
    onHostStart: async () => {
      await handleHostStart();
      await refreshRemoteViewData();
    },
    onLocalApply: async () => {
      await handleLocalApply();
      await refreshRemoteViewData();
    },
    onModeSelect: (mode: RemoteMode) => {
      setSelectedRemoteMode(mode);
      updateRemoteViewState({ hostRecoveryExpanded: false, remoteActionError: '' });
    },
    onRefreshStatus: () => {
      void refreshRemoteViewData();
    },
    onServerUrlChange: (value: string) => {
      updateRemoteViewState({ serverUrlDraft: value });
    },
    onStatusDetailsToggle: (expanded: boolean) => {
      updateRemoteViewState({ statusDetailsExpanded: expanded });
    },
  };
}
