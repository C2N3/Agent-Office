export type RemoteMode = 'local' | 'host' | 'guest';

export type GuestInvite = {
  baseUrl: string;
  guestSecret: string;
};

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
