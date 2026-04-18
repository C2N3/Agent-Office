import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';

const DEFAULT_CENTRAL_SERVER_URL = 'http://127.0.0.1:47823';
const CONFIG_DIR = path.join(os.homedir(), '.agent-office');
const CENTRAL_SERVER_URL_FILE = path.join(CONFIG_DIR, 'central-server-url.txt');

let configuredBaseUrl: string | null = null;

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  write(data: string | Uint8Array): void;
}

interface RequestLike {
  method?: string;
  on?(event: string, listener: (...args: any[]) => void): void;
}

function normalizeCentralServerBaseUrl(raw: string): { ok: boolean; value?: string; message?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Server URL is required' };

  const candidate = /^\d{1,5}$/.test(trimmed)
    ? `http://127.0.0.1:${trimmed}`
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, message: 'Server URL must use http or https' };
    }
    if (!url.hostname) return { ok: false, message: 'Server URL must include a host' };
    return { ok: true, value: url.origin.replace(/\/+$/, '') };
  } catch {
    return { ok: false, message: 'Server URL is invalid' };
  }
}

function loadConfiguredBaseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl;

  try {
    if (fs.existsSync(CENTRAL_SERVER_URL_FILE)) {
      const saved = fs.readFileSync(CENTRAL_SERVER_URL_FILE, 'utf-8');
      const normalized = normalizeCentralServerBaseUrl(saved);
      if (normalized.ok && normalized.value) {
        configuredBaseUrl = normalized.value;
        return configuredBaseUrl;
      }
    }
  } catch {}

  const envUrl = process.env.AO_CENTRAL_SERVER_URL;
  if (envUrl) {
    const normalized = normalizeCentralServerBaseUrl(envUrl);
    if (normalized.ok && normalized.value) {
      configuredBaseUrl = normalized.value;
      return configuredBaseUrl;
    }
  }

  configuredBaseUrl = DEFAULT_CENTRAL_SERVER_URL;
  return configuredBaseUrl;
}

function getCentralServerBaseUrl(): string {
  return loadConfiguredBaseUrl();
}

function getCentralServerConfig(): { baseUrl: string; healthPath: string; workersPath: string; eventsPath: string } {
  return {
    baseUrl: getCentralServerBaseUrl(),
    healthPath: '/api/server/health',
    workersPath: '/api/server/workers',
    eventsPath: '/api/server/events',
  };
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

function readRequestBody(req: RequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!req.on) {
      resolve('');
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
      if (body.length > 4096) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function updateCentralServerConfig(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    const normalized = normalizeCentralServerBaseUrl(String(parsed.baseUrl || ''));
    if (!normalized.ok || !normalized.value) {
      writeJSON(res, 400, { error: normalized.message || 'Server URL is invalid' });
      return;
    }

    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_SERVER_URL_FILE, `${normalized.value}\n`, 'utf-8');
    configuredBaseUrl = normalized.value;
    writeJSON(res, 200, getCentralServerConfig());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update server URL';
    writeJSON(res, 400, { error: message });
  }
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
