import { URL } from 'url';
import { normalizeCentralServerBaseUrl } from './config.js';

export function centralHttpUrlToWorkerWebSocketUrl(baseUrl: string, token = ''): string {
  const normalized = normalizeCentralServerBaseUrl(baseUrl);
  if (!normalized.ok || !normalized.value) {
    throw new Error(normalized.message || 'Server URL is invalid');
  }
  const url = new URL('/api/workers/connect', `${normalized.value}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token.trim()) url.searchParams.set('token', token.trim());
  return url.toString();
}
