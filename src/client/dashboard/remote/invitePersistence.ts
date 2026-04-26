import { buildGuestInviteLink, parseGuestInviteLink } from '../remoteMode.js';

export const HOST_INVITE_LINK_STORAGE_KEY = 'ao-host-invite-link';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function browserAppOrigin(fallbackBaseUrl: string): string {
  return globalThis.window?.location?.origin || fallbackBaseUrl;
}

export function inviteLinkMatchesBaseUrl(inviteLink: string, baseUrl: string): boolean {
  if (!inviteLink.trim()) return false;
  if (!baseUrl.trim()) return true;
  try {
    const invite = parseGuestInviteLink(inviteLink);
    return normalizeBaseUrl(invite.baseUrl) === normalizeBaseUrl(baseUrl);
  } catch {
    return false;
  }
}

export function readStoredHostInviteLink(baseUrl = ''): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    const inviteLink = localStorage.getItem(HOST_INVITE_LINK_STORAGE_KEY)?.trim() || '';
    if (!inviteLink) return '';
    return inviteLinkMatchesBaseUrl(inviteLink, baseUrl) ? inviteLink : '';
  } catch {
    return '';
  }
}

export function guestSecretFromInviteLink(inviteLink: string): string {
  try {
    return parseGuestInviteLink(inviteLink).guestSecret;
  } catch {
    return '';
  }
}

export function persistHostInviteLink(baseUrl: string, guestSecret: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedGuestSecret = guestSecret.trim();
  if (!normalizedBaseUrl || !normalizedGuestSecret) return '';
  const inviteLink = buildGuestInviteLink(browserAppOrigin(normalizedBaseUrl), normalizedBaseUrl, normalizedGuestSecret);
  try {
    localStorage.setItem(HOST_INVITE_LINK_STORAGE_KEY, inviteLink);
  } catch {}
  return inviteLink;
}

export function clearStoredHostInviteLink(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(HOST_INVITE_LINK_STORAGE_KEY);
  } catch {}
}
