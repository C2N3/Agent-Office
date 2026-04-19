import { URL } from 'url';
import {
  getAgentSyncEnabled,
  getCentralServerBaseUrl,
  getOrCreateCentralWorkerId,
  getWorkerConnectionStatus,
  getWorkerEnabled,
  isCentralWorkerTokenConfigured,
  saveCentralServerConfig,
} from '../main/centralWorker/config.js';

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  write(data: string | Uint8Array): void;
}

interface RequestLike {
  method?: string;
  on?(event: string, listener: (...args: any[]) => void): void;
}

function getCentralServerConfig(): {
  baseUrl: string;
  healthPath: string;
  workersPath: string;
  eventsPath: string;
  agentsPath: string;
  agentSyncEnabled: boolean;
  workerEnabled: boolean;
  workerTokenConfigured: boolean;
  workerId: string;
  workerConnectionStatus: string;
} {
  return {
    baseUrl: getCentralServerBaseUrl(),
    healthPath: '/api/server/health',
    workersPath: '/api/server/workers',
    eventsPath: '/api/server/events',
    agentsPath: '/api/server/agents',
    agentSyncEnabled: getAgentSyncEnabled(),
    workerEnabled: getWorkerEnabled(),
    workerTokenConfigured: isCentralWorkerTokenConfigured(),
    workerId: getOrCreateCentralWorkerId(),
    workerConnectionStatus: getWorkerConnectionStatus(),
  };
}

function makeCentralURL(pathname: string, search = ''): string {
  const url = new URL(pathname, `${getCentralServerBaseUrl()}/`);
  url.search = search;
  return url.toString();
}

function writeJSON(res: ResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function writeProxyError(res: ResponseLike, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || 'Central server request failed');
  writeJSON(res, 502, {
    error: {
      message,
      targetUrl: getCentralServerBaseUrl(),
    },
  });
}

function readRequestBody(req: RequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!req.on) {
      resolve('');
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
      if (body.length > 1_048_576) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function updateCentralServerConfig(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    saveCentralServerConfig({
      baseUrl: String(parsed.baseUrl || ''),
      agentSyncEnabled: typeof parsed.agentSyncEnabled === 'boolean' ? parsed.agentSyncEnabled : undefined,
      workerEnabled: typeof parsed.workerEnabled === 'boolean' ? parsed.workerEnabled : undefined,
      workerToken: typeof parsed.workerToken === 'string' ? parsed.workerToken : undefined,
    });
    writeJSON(res, 200, getCentralServerConfig());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update server URL';
    writeJSON(res, 400, { error: message });
  }
}

async function proxyJSON(req: RequestLike, res: ResponseLike, pathname: string, search = ''): Promise<void> {
  const controller = new AbortController();
  req.on?.('close', () => controller.abort());

  try {
    const response = await fetch(makeCentralURL(pathname, search), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.text();
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (error) {
    if (controller.signal.aborted) return;
    writeProxyError(res, error);
  }
}

async function proxyRequest(req: RequestLike, res: ResponseLike, pathname: string, search = ''): Promise<void> {
  const controller = new AbortController();
  req.on?.('close', () => controller.abort());

  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readRequestBody(req);
    const response = await fetch(makeCentralURL(pathname, search), {
      method: req.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      signal: controller.signal,
    });
    const responseBody = await response.text();
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(responseBody);
  } catch (error) {
    if (controller.signal.aborted) return;
    writeProxyError(res, error);
  }
}

async function proxyEvents(req: RequestLike, res: ResponseLike): Promise<void> {
  const controller = new AbortController();
  let streamStarted = false;
  req.on?.('close', () => controller.abort());

  try {
    const response = await fetch(makeCentralURL('/api/events'), {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      writeJSON(res, response.status || 502, {
        error: {
          message: `Central event stream returned ${response.status}`,
          targetUrl: getCentralServerBaseUrl(),
        },
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    streamStarted = true;

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) return;
      if (done) {
        res.end();
        return;
      }
      if (value) res.write(value);
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    if (streamStarted) {
      res.end();
      return;
    }
    writeProxyError(res, error);
  }
}

export function handleCentralServerRoute(req: RequestLike, res: ResponseLike, url: URL): boolean {
  if (url.pathname === '/api/server/config') {
    if (req.method === 'GET') {
      writeJSON(res, 200, getCentralServerConfig());
      return true;
    }
    if (req.method === 'POST') {
      void updateCentralServerConfig(req, res);
      return true;
    }
    writeJSON(res, 405, { error: 'Method not allowed' });
    return true;
  }

  if (url.pathname === '/api/server/agents' || url.pathname.startsWith('/api/server/agents/')) {
    const centralPath = url.pathname.replace('/api/server', '/api');
    if (req.method === 'GET') {
      void proxyJSON(req, res, centralPath, url.search);
      return true;
    }
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
      void proxyRequest(req, res, centralPath, url.search);
      return true;
    }
    writeJSON(res, 405, { error: 'Method not allowed' });
    return true;
  }

  if (req.method !== 'GET') return false;

  if (url.pathname === '/api/server/health') {
    void proxyJSON(req, res, '/api/health');
    return true;
  }

  if (url.pathname === '/api/server/workers') {
    void proxyJSON(req, res, '/api/workers');
    return true;
  }

  if (url.pathname === '/api/server/events') {
    void proxyEvents(req, res);
    return true;
  }

  return false;
}
