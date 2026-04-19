export type RemoteMode = 'local' | 'host' | 'guest';

export type GuestInvite = {
  baseUrl: string;
  guestSecret: string;
};

export type RemoteModeFlags = {
  workerEnabled: boolean;
  agentSyncEnabled: boolean;
};

export function flagsFromRemoteMode(
  mode: RemoteMode,
  options: { roomSecretConfigured?: boolean } = {},
): RemoteModeFlags {
  switch (mode) {
    case 'host':
      return { workerEnabled: true, agentSyncEnabled: true };
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

export function buildGuestInviteLink(baseUrl: string, guestSecret: string): string {
  const origin = baseUrl.replace(/\/+$/, '');
  return `${origin}/#aoGuestSecret=${encodeURIComponent(guestSecret)}`;
}

export function parseGuestInviteLink(value: string): GuestInvite {
  const url = new URL(value.trim());
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(hash);
  const guestSecret = params.get('aoGuestSecret')?.trim() || '';
  if (!guestSecret) {
    throw new Error('Invite link is missing aoGuestSecret');
  }
  return {
    baseUrl: url.origin,
    guestSecret,
  };
}
