import { isAuthFailureMessage } from './messages.js';
import type { RoomAccessStatus } from '../remote/types.js';

export type RoomAccessFetchStatus = 'ok' | 'auth' | 'unavailable';

type RoomAccessFetchResult = {
  roomAccess: RoomAccessStatus | null;
  status: RoomAccessFetchStatus;
};

export async function fetchRoomAccessStatus(): Promise<RoomAccessFetchResult> {
  try {
    const res = await fetch('/api/server/room-access', { cache: 'no-store' });
    if (res.ok) {
      return {
        roomAccess: await res.json() as RoomAccessStatus,
        status: 'ok',
      };
    }
    const payload = await res.json().catch(() => ({}));
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || `HTTP ${res.status}`;
    return {
      roomAccess: null,
      status: isAuthFailureMessage(message) ? 'auth' : 'unavailable',
    };
  } catch {
    return {
      roomAccess: null,
      status: 'unavailable',
    };
  }
}

export async function fetchRoomAccess(): Promise<RoomAccessStatus | null> {
  const result = await fetchRoomAccessStatus();
  return result.roomAccess;
}

export async function checkHostAccess(): Promise<'ok' | 'auth' | 'unavailable'> {
  return (await fetchRoomAccessStatus()).status;
}
