import { URL } from 'url';
import { normalizeCentralServerBaseUrl } from './config.js';

export function centralHttpUrlToWorkerWebSocketUrl(baseUrl: string, token = '', roomSecret = ''): string {
  const normalized = normalizeCentralServerBaseUrl(baseUrl);
  if (!normalized.ok || !normalized.value) {
    throw new Error(normalized.message || 'Server URL is invalid');
  }
  const url = new URL('/api/workers/connect', `${normalized.value}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token.trim()) url.searchParams.set('token', token.trim());
  if (!token.trim() && roomSecret.trim()) url.searchParams.set('roomSecret', roomSecret.trim());
  return url.toString();
}
