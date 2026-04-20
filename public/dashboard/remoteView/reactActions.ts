import { parseGuestInviteLink, type RemoteMode } from '../remoteMode.js';
import { formatHostRotateError, hostAddressMismatchMessage } from './messages.js';

type ReactActionContext = {
  applyRemoteSettings: (update: { baseUrl?: string; roomSecret?: string; remoteMode: RemoteMode }) => Promise<void>;
  checkHostAccess: () => Promise<'ok' | 'auth' | 'unavailable'>;
  getGuestInviteDraft: () => string;
  getServerUrlDraft: () => string;
  renderCurrentRemotePanel: () => void;
  renderRemoteView: () => Promise<void>;
  resetCopiedInvite: () => void;
  roomAccessAction: (path: string) => Promise<{ guestSecret?: string; ownerSecret?: string }>;
  setGuestInviteDraft: (value: string) => void;
  setLastIssuedGuestSecret: (value: string) => void;
  setRemoteActionError: (value: string) => void;
  setSelectedRemoteMode: (value: RemoteMode | null) => void;
  setServerUrlDraft: (value: string) => void;
  setStatusDetailsExpanded: (value: boolean) => void;
  setSelectedModeDraft: (value: RemoteMode) => void;
};

export function createRemoteReactActions(context: ReactActionContext) {
  return {
    onGuestInviteChange: (value: string) => {
      context.setGuestInviteDraft(value);
      context.renderCurrentRemotePanel();
    },
    onGuestJoin: async () => {
      try {
        context.setRemoteActionError('');
        const invite = parseGuestInviteLink(context.getGuestInviteDraft());
        await context.applyRemoteSettings({
          baseUrl: invite.baseUrl,
          roomSecret: invite.guestSecret,
          remoteMode: 'guest',
        });
        context.setSelectedRemoteMode(null);
        context.setServerUrlDraft(invite.baseUrl);
        context.setGuestInviteDraft('');
      } catch (error) {
        context.setRemoteActionError(error instanceof Error ? error.message : String(error || 'Invalid invite link'));
      }
      await context.renderRemoteView();
    },
    onHostDisable: async () => {
      try {
        context.setRemoteActionError('');
        await context.roomAccessAction('/api/server/room-access/disable');
        context.setLastIssuedGuestSecret('');
        context.resetCopiedInvite();
      } catch (error) {
        context.setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to disable host mode'));
      }
      await context.renderRemoteView();
    },
    onHostEnable: async () => {
      try {
        context.setRemoteActionError('');
        const response = await context.roomAccessAction('/api/server/room-access/enable');
        context.setLastIssuedGuestSecret(response.guestSecret || '');
        if (response.ownerSecret) {
          await context.applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
        } else {
          await context.applyRemoteSettings({ remoteMode: 'host' });
        }
        context.setSelectedRemoteMode(null);
        context.resetCopiedInvite();
      } catch (error) {
        context.setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to enable host mode'));
      }
      await context.renderRemoteView();
    },
    onHostRotate: async () => {
      try {
        context.setRemoteActionError('');
        const response = await context.roomAccessAction('/api/server/room-access/guest-secret/rotate');
        context.setLastIssuedGuestSecret(response.guestSecret || '');
        context.resetCopiedInvite();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'Failed to rotate guest secret');
        context.setRemoteActionError(formatHostRotateError(message));
      }
      await context.renderRemoteView();
    },
    onHostStart: async (persistedMode: RemoteMode) => {
      try {
        await context.applyRemoteSettings({
          baseUrl: context.getServerUrlDraft(),
          remoteMode: 'host',
        });
        if (persistedMode === 'host') {
          context.setLastIssuedGuestSecret('');
          context.setRemoteActionError(await context.checkHostAccess() === 'auth' ? hostAddressMismatchMessage() : '');
          context.setSelectedRemoteMode(null);
          await context.renderRemoteView();
          return;
        }
        const response = await context.roomAccessAction('/api/server/room-access/enable');
        context.setLastIssuedGuestSecret(response.guestSecret || '');
        if (response.ownerSecret) {
          await context.applyRemoteSettings({ remoteMode: 'host', roomSecret: response.ownerSecret });
        }
        context.setSelectedRemoteMode(null);
        context.setRemoteActionError('');
        context.resetCopiedInvite();
      } catch (error) {
        context.setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to start host mode'));
      }
      await context.renderRemoteView();
    },
    onLocalApply: async () => {
      try {
        await context.applyRemoteSettings({
          baseUrl: context.getServerUrlDraft(),
          remoteMode: 'local',
        });
        context.setSelectedRemoteMode(null);
        context.setRemoteActionError('');
      } catch (error) {
        context.setRemoteActionError(error instanceof Error ? error.message : String(error || 'Failed to save server settings'));
      }
      await context.renderRemoteView();
    },
    onModeSelect: (nextMode: RemoteMode) => {
      context.setSelectedModeDraft(nextMode);
      context.setRemoteActionError('');
      context.renderCurrentRemotePanel();
    },
    onRefreshStatus: () => {
      void context.renderRemoteView();
    },
    onServerUrlChange: (value: string) => {
      context.setServerUrlDraft(value);
      context.renderCurrentRemotePanel();
    },
    onStatusDetailsToggle: (expanded: boolean) => {
      context.setStatusDetailsExpanded(expanded);
    },
  };
}
