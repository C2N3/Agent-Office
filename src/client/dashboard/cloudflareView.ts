export type TunnelStatus = {
  running: boolean;
  url: string | null;
  error: string | null;
  startedAt: number | null;
  cloudflaredFound?: boolean;
  token?: string;
};

export async function fetchCloudflareTunnelStatus(): Promise<TunnelStatus> {
  const response = await fetch('/api/tunnel', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<TunnelStatus>;
}

async function postCloudflareTunnelAction(path: '/api/tunnel/start' | '/api/tunnel/stop'): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : payload?.message || `HTTP ${response.status}`);
  }
}

export function startCloudflareTunnel(): Promise<void> {
  return postCloudflareTunnelAction('/api/tunnel/start');
}

export function stopCloudflareTunnel(): Promise<void> {
  return postCloudflareTunnelAction('/api/tunnel/stop');
}
