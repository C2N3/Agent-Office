import type { RemoteMode } from './remoteMode';
import { fetchWithTimeout } from './fetchWithTimeout';

export interface CentralServerConfig {
  baseUrl: string;
  healthPath: string;
  workersPath: string;
  eventsPath: string;
  agentsPath: string;
  agentSyncEnabled: boolean;
  remoteMode?: RemoteMode;
  roomSecretConfigured?: boolean;
  workerEnabled?: boolean;
  workerTokenConfigured?: boolean;
  workerId?: string;
  workerConnectionStatus?: string;
}

export interface CentralServerHealth {
  status: string;
  time: string;
}

export interface CentralWorker {
  id: string;
  userId: string;
  displayName: string;
  hostname: string;
  platform: string;
  capabilities: string[];
  status: string;
  lastSeenAt: string;
  protocolVersion: number;
  runningTasks: number;
}

export interface CentralServerSnapshot {
  config: CentralServerConfig | null;
  health: CentralServerHealth | null;
  workers: CentralWorker[];
  error: string | null;
  eventsConnected: boolean;
}

interface CentralWorkersResponse {
  workers: CentralWorker[];
}

type CentralServerConnectionListener = () => void;

let eventSource: EventSource | null = null;
let eventsConnected = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const statusListeners = new Set<CentralServerConnectionListener>();

function formatResponseError(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' && payload.trim() ? payload : fallback;
  }

  const error = (payload as {
    error?: string | { message?: string; targetUrl?: string };
  }).error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const message = typeof error.message === 'string' ? error.message.trim() : '';
  const targetUrl = typeof error.targetUrl === 'string' ? error.targetUrl.trim() : '';
  if (message && targetUrl) {
    return `${message} (target: ${targetUrl})`;
  }
  if (message) {
    return message;
  }
  return fallback;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(path, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {}
    }
    throw new Error(formatResponseError(payload, text || `HTTP ${res.status}`));
  }
  return res.json() as Promise<T>;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Central server unavailable');
}

function scheduleRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    statusListeners.forEach((listener) => listener());
  }, 250);
}

export function subscribeCentralServerConnection(listener: CentralServerConnectionListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export async function fetchCentralServerConfig(): Promise<CentralServerConfig | null> {
  try {
    return await fetchJSON<CentralServerConfig>('/api/server/config');
  } catch {
    return null;
  }
}

export async function saveCentralServerConfig(config: {
  baseUrl?: string;
  workerEnabled?: boolean;
  agentSyncEnabled?: boolean;
  workerToken?: string;
  roomSecret?: string;
  remoteMode?: RemoteMode;
}): Promise<CentralServerConfig> {
  const res = await fetchWithTimeout('/api/server/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatResponseError(payload, `HTTP ${res.status}`));
  }
  return payload as CentralServerConfig;
}

export async function fetchCentralServerSnapshot(): Promise<CentralServerSnapshot> {
  const config = await fetchCentralServerConfig();
  if (!config) {
    return {
      config: null,
      health: null,
      workers: [],
      error: 'Central server unavailable',
      eventsConnected,
    };
  }

  try {
    const [health, workersResponse] = await Promise.all([
      fetchJSON<CentralServerHealth>(config.healthPath),
      fetchJSON<CentralWorkersResponse>(config.workersPath),
    ]);

    return {
      config,
      health,
      workers: workersResponse.workers || [],
      error: null,
      eventsConnected,
    };
  } catch (error) {
    return {
      config,
      health: null,
      workers: [],
      error: formatError(error),
      eventsConnected,
    };
  }
}

export async function startCentralServerConnection(): Promise<void> {
  if (eventSource) return;
  const config = await fetchCentralServerConfig();
  if (config?.remoteMode === 'guest') {
    eventsConnected = false;
    scheduleRefresh();
    return;
  }

  eventSource = new EventSource('/api/server/events');
  eventSource.onopen = () => {
    eventsConnected = true;
    scheduleRefresh();
  };
  eventSource.onerror = () => {
    eventsConnected = false;
    scheduleRefresh();
  };

  ['worker.connected', 'worker.disconnected', 'worker.heartbeat', 'agent.created', 'agent.updated', 'agent.removed'].forEach((eventName) => {
    eventSource?.addEventListener(eventName, () => scheduleRefresh());
  });
}

export function stopCentralServerConnection(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  eventsConnected = false;
}
