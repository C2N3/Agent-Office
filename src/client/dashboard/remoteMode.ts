export type RemoteMode = 'local' | 'host' | 'guest';

export type GuestInvite = {
  baseUrl: string;
  guestSecret: string;
};

export type RemoteModeFlags = {
  workerEnabled: boolean;
  agentSyncEnabled: boolean;
};

type RemoteModeFlagOptions = {
  roomSecretConfigured?: boolean;
  workerTokenConfigured?: boolean;
};

function hasWorkerBridgeAuth(options: RemoteModeFlagOptions): boolean {
  return !!options.roomSecretConfigured || !!options.workerTokenConfigured;
}

export function flagsFromRemoteMode(
  mode: RemoteMode,
  options: RemoteModeFlagOptions = {},
): RemoteModeFlags {
  switch (mode) {
    case 'host':
      return hasWorkerBridgeAuth(options)
        ? { workerEnabled: true, agentSyncEnabled: true }
        : { workerEnabled: false, agentSyncEnabled: false };
    case 'guest':
      return options.roomSecretConfigured
        ? { workerEnabled: true, agentSyncEnabled: true }
        : { workerEnabled: false, agentSyncEnabled: false };
    default:
      return { workerEnabled: false, agentSyncEnabled: false };
  }
}

export function remoteModeLabel(mode: RemoteMode): string {
  switch (mode) {
    case 'host':
      return 'Host';
    case 'guest':
      return 'Guest';
    default:
      return 'Local Only';
  }
}

export function modeUsesWorkerToken(mode: RemoteMode): boolean {
  return mode === 'host';
}

export function buildGuestInviteLink(appOrigin: string, baseUrl: string, guestSecret: string): string {
  const origin = appOrigin.replace(/\/+$/, '');
  const hash = new URLSearchParams({
    aoGuestSecret: guestSecret,
    aoBaseUrl: baseUrl.replace(/\/+$/, ''),
  });
  return `${origin}/#${hash.toString()}`;
}

export function parseGuestInviteLink(value: string): GuestInvite {
  const url = new URL(value.trim());
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(hash);
  const guestSecret = params.get('aoGuestSecret')?.trim() || '';
  const baseUrl = params.get('aoBaseUrl')?.trim() || url.origin;
  if (!guestSecret) {
    throw new Error('Invite link is missing aoGuestSecret');
  }
  return {
    baseUrl,
    guestSecret,
  };
}
