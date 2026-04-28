import { type RemoteMode } from '../remoteMode';
import { refreshRemoteViewData } from './controller';
import { copyInviteText, handleGuestJoin, handleHostDisable, handleHostEnable, handleHostResetAccess, handleHostRotate, handleHostStart, handleLocalApply } from './controller';
import { deriveRemoteViewModel } from './model';
import { getRemoteViewState, setSelectedRemoteMode, updateRemoteViewState } from './store';
import type { RemoteViewActions } from './types';

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
