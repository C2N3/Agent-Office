import { URL } from 'url';

const DEFAULT_CENTRAL_SERVER_URL = 'http://127.0.0.1:47823';

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  write(data: string | Uint8Array): void;
}

interface RequestLike {
  method?: string;
  on?(event: 'close', listener: () => void): void;
}

function getCentralServerBaseUrl(): string {
  const raw = (process.env.AO_CENTRAL_SERVER_URL || DEFAULT_CENTRAL_SERVER_URL).trim();
  return raw.replace(/\/+$/, '');
}

function makeCentralURL(pathname: string): string {
  return new URL(pathname, `${getCentralServerBaseUrl()}/`).toString();
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

async function proxyJSON(req: RequestLike, res: ResponseLike, pathname: string): Promise<void> {
  const controller = new AbortController();
  req.on?.('close', () => controller.abort());

  try {
    const response = await fetch(makeCentralURL(pathname), {
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
  if (req.method !== 'GET') return false;

  if (url.pathname === '/api/server/config') {
    writeJSON(res, 200, {
      baseUrl: getCentralServerBaseUrl(),
      healthPath: '/api/server/health',
      workersPath: '/api/server/workers',
      eventsPath: '/api/server/events',
    });
    return true;
  }

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
