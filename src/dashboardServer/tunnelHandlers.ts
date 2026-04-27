import { getRemoteToken } from './remoteAuth.js';
import { loadMainTunnelManager } from './tunnelManagerLookup.js';

// tunnelManager is a singleton in the main process
function getTunnelManager(): any {
  try {
    return loadMainTunnelManager(require);
  } catch {
    return null;
  }
}

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
}

const jsonHeader = { 'Content-Type': 'application/json' };

export function handleGetTunnel(_req: any, res: ResponseLike): void {
  const tm = getTunnelManager();
  const status = tm ? tm.getStatus() : { running: false, url: null, error: null, startedAt: null };
  const token = getRemoteToken();
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({ ...status, token }));
}

export function handleStartTunnel(_req: any, res: ResponseLike): void {
  const tm = getTunnelManager();
  if (!tm) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Tunnel manager unavailable' }));
    return;
  }
  const result = tm.start();
  res.writeHead(result.ok ? 200 : 409, jsonHeader);
  res.end(JSON.stringify(result));
}

export function handleStopTunnel(_req: any, res: ResponseLike): void {
  const tm = getTunnelManager();
  if (!tm) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Tunnel manager unavailable' }));
    return;
  }
  const result = tm.stop();
  res.writeHead(result.ok ? 200 : 409, jsonHeader);
  res.end(JSON.stringify(result));
}
