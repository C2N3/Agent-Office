import type { RemoteMode } from './config.js';

type WorkerConnectionAuthInput = {
  remoteMode: RemoteMode;
  token: string;
  roomSecret: string;
  baseUrl: string;
};

type WorkerConnectionAuth = {
  token: string;
  roomSecret: string;
  error?: string;
};

export function resolveWorkerConnectionAuth(input: WorkerConnectionAuthInput): WorkerConnectionAuth {
  const token = input.token.trim();
  const roomSecret = input.roomSecret.trim();
  const baseUrl = input.baseUrl.trim();

  if (input.remoteMode === 'guest') {
    return roomSecret
      ? { token: '', roomSecret }
      : { token: '', roomSecret: '', error: 'guest mode requires a room secret' };
  }
  if (input.remoteMode === 'host' && roomSecret) {
    return { token: '', roomSecret };
  }
  if (input.remoteMode === 'host' && !token) {
    return { token: '', roomSecret: '', error: 'host mode requires a room secret or worker token' };
  }
  if (!token && !baseUrl) {
    return { token: '', roomSecret: '', error: 'baseUrl required' };
  }
  return { token, roomSecret: '' };
}
