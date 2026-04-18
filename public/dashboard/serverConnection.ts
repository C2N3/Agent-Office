interface CentralServerConfig {
  baseUrl: string;
  healthPath: string;
  workersPath: string;
  eventsPath: string;
}

interface CentralServerHealth {
  status: string;
  time: string;
}

interface CentralWorker {
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

interface CentralWorkersResponse {
  workers: CentralWorker[];
}

interface CentralServerSnapshot {
  config: CentralServerConfig | null;
  health: CentralServerHealth | null;
  workers: CentralWorker[];
  error: string | null;
  eventsConnected: boolean;
}

let eventSource: EventSource | null = null;
let eventsConnected = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Central server unavailable');
}

export async function fetchCentralServerSnapshot(): Promise<CentralServerSnapshot> {
  let config: CentralServerConfig | null = null;
  try {
    config = await fetchJSON<CentralServerConfig>('/api/server/config');
  } catch (error) {
    return {
      config: null,
      health: null,
      workers: [],
      error: formatError(error),
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

function renderWorker(worker: CentralWorker): string {
  const caps = (worker.capabilities || []).slice(0, 4).map((cap) =>
    `<span class="server-capability">${escapeHtml(cap)}</span>`
  ).join('');
  const more = worker.capabilities && worker.capabilities.length > 4
    ? `<span class="server-capability">+${worker.capabilities.length - 4}</span>`
    : '';

  return `
    <div class="server-worker-row">
      <div>
        <div class="server-worker-name">${escapeHtml(worker.displayName || worker.id)}</div>
        <div class="server-worker-meta">${escapeHtml(worker.hostname || 'unknown host')} &middot; ${escapeHtml(worker.platform || 'unknown platform')}</div>
        <div class="server-capability-list">${caps}${more}</div>
      </div>
      <div class="server-worker-state">
        <span class="server-status-pill ${worker.status === 'online' ? 'online' : 'offline'}">${escapeHtml(worker.status)}</span>
        <span>${escapeHtml(worker.runningTasks)} running</span>
      </div>
    </div>
  `;
}

export function renderCentralServerCard(snapshot: CentralServerSnapshot): string {
  const targetUrl = snapshot.config?.baseUrl || 'not configured';
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error
    ? 'Offline'
    : snapshot.eventsConnected
      ? 'Live'
      : 'Reachable';
  const workerCount = snapshot.workers.length;

  return `
<div class="panel remote-panel central-server-panel" id="centralServerCard">
  <div class="remote-section-title">Central Server</div>

  <div class="remote-status-row">
    <div class="remote-dot server-dot ${dotClass}"></div>
    <span class="remote-status-label">${statusLabel}</span>
    <span class="remote-uptime">${escapeHtml(workerCount)} workers</span>
    <div style="flex:1"></div>
    <button class="btn-secondary remote-action-btn" id="centralServerRefreshBtn">Refresh</button>
  </div>

  <div class="remote-info-block">
    <div class="remote-info-label">Server URL</div>
    <div class="remote-url-row">
      <span class="remote-url-text">${escapeHtml(targetUrl)}</span>
    </div>
    <div class="remote-hint">Set AO_CENTRAL_SERVER_URL to use a different server.</div>
  </div>

  ${snapshot.error ? `<div class="remote-error">${escapeHtml(snapshot.error)}</div>` : ''}

  ${snapshot.health ? `
  <div class="server-health-grid">
    <div>
      <div class="remote-info-label">Health</div>
      <div class="server-health-value">${escapeHtml(snapshot.health.status)}</div>
    </div>
    <div>
      <div class="remote-info-label">Server Time</div>
      <div class="server-health-value">${escapeHtml(formatTimestamp(snapshot.health.time))}</div>
    </div>
    <div>
      <div class="remote-info-label">Event Stream</div>
      <div class="server-health-value">${snapshot.eventsConnected ? 'connected' : 'waiting'}</div>
    </div>
  </div>
  ` : ''}

  <div class="remote-info-block">
    <div class="remote-info-label">Workers</div>
    <div class="server-worker-list">
      ${snapshot.workers.length > 0
        ? snapshot.workers.map(renderWorker).join('')
        : '<div class="server-empty">No workers connected.</div>'}
    </div>
  </div>
</div>`;
}

async function refreshCentralServerCard(): Promise<void> {
  const card = document.getElementById('centralServerCard');
  if (!card) return;
  const snapshot = await fetchCentralServerSnapshot();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderCentralServerCard(snapshot).trim();
  const next = wrapper.firstElementChild;
  if (next) {
    card.replaceWith(next);
    bindCentralServerControls();
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshCentralServerCard().catch(() => {});
  }, 250);
}

export function bindCentralServerControls(): void {
  document.getElementById('centralServerRefreshBtn')?.addEventListener('click', () => {
    refreshCentralServerCard().catch(() => {});
  });
}

export function startCentralServerConnection(): void {
  if (eventSource) return;

  eventSource = new EventSource('/api/server/events');
  eventSource.onopen = () => {
    eventsConnected = true;
    scheduleRefresh();
  };
  eventSource.onerror = () => {
    eventsConnected = false;
    scheduleRefresh();
  };

  ['worker.connected', 'worker.disconnected', 'worker.heartbeat'].forEach((eventName) => {
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
