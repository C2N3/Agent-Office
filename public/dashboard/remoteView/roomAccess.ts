import { isAuthFailureMessage } from './messages.js';
import type { RoomAccessStatus } from './render.js';

export async function fetchRoomAccess(): Promise<RoomAccessStatus | null> {
  try {
    const res = await fetch('/api/server/room-access', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<RoomAccessStatus>;
  } catch {
    return null;
  }
}

export async function checkHostAccess(): Promise<'ok' | 'auth' | 'unavailable'> {
  try {
    const res = await fetch('/api/server/room-access', { cache: 'no-store' });
    if (res.ok) return 'ok';
    const payload = await res.json().catch(() => ({}));
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || `HTTP ${res.status}`;
    return isAuthFailureMessage(message) ? 'auth' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
