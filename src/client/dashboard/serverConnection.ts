interface CentralServerConfig {
  baseUrl: string; healthPath: string; workersPath: string; eventsPath: string; agentsPath: string; agentSyncEnabled: boolean;
  remoteMode?: 'local' | 'host' | 'guest'; roomSecretConfigured?: boolean;
  workerEnabled?: boolean; workerTokenConfigured?: boolean; workerId?: string; workerConnectionStatus?: string;
}

interface CentralServerHealth { status: string; time: string; }
interface CentralWorkersResponse { workers: CentralWorker[]; }
interface CentralServerSnapshot { config: CentralServerConfig | null; health: CentralServerHealth | null; workers: CentralWorker[]; error: string | null; eventsConnected: boolean; }

interface CentralWorker {
  id: string; userId: string; displayName: string; hostname: string; platform: string; capabilities: string[];
  status: string; lastSeenAt: string; protocolVersion: number; runningTasks: number;
}

let eventSource: EventSource | null = null;
let eventsConnected = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function remoteModeLabel(mode?: 'local' | 'host' | 'guest'): string {
  if (mode === 'host') return 'Host';
  if (mode === 'guest') return 'Guest';
  return 'Local Only';
}

function modeUsesWorkerToken(mode?: 'local' | 'host' | 'guest'): boolean {
  return mode === 'host';
}

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
  remoteMode?: 'local' | 'host' | 'guest';
}): Promise<CentralServerConfig> {
  const res = await fetch('/api/server/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload as CentralServerConfig;
}

function workerStatusClass(status?: string): string {
  if (status === 'connected') return 'online';
  if (status === 'connecting' || status === 'reconnecting') return 'starting';
  if (status === 'error') return 'error';
  return 'offline';
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Central server unavailable');
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
  const remoteMode = snapshot.config?.remoteMode || 'local';
  const workerStatus = snapshot.config?.workerConnectionStatus || 'disconnected';
  const workerId = snapshot.config?.workerId || '-';
  const tokenStatus = snapshot.config?.workerTokenConfigured ? 'configured' : 'not configured';
  const roomSecretStatus = snapshot.config?.roomSecretConfigured ? 'configured' : 'not configured';
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error
    ? 'Offline'
    : snapshot.eventsConnected
      ? 'Live'
      : 'Reachable';
  const workerCount = snapshot.workers.length;
  const workerEnabled = !!snapshot.config?.workerEnabled;
  const agentSyncEnabled = !!snapshot.config?.agentSyncEnabled;
  const showWorkerToken = modeUsesWorkerToken(remoteMode);

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
    <form id="centralServerUrlForm">
      <div class="modal-path-field">
        <input type="text" id="centralServerUrlInput" class="modal-input" value="${escapeHtml(targetUrl)}" autocomplete="off" spellcheck="false">
        <button class="btn-secondary modal-browse-btn" id="centralServerUrlSaveBtn" type="submit">Save</button>
      </div>
      <div class="remote-hint">포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
      <div class="remote-hint" style="margin-top:10px">Mode: <strong>${escapeHtml(remoteModeLabel(remoteMode))}</strong> · Worker bridge ${workerEnabled ? 'on' : 'off'} · Character sync ${agentSyncEnabled ? 'on' : 'off'}</div>
      ${showWorkerToken ? `<div style="margin-top:12px">
        <div class="remote-info-label">Worker Token</div>
        <input type="password" id="centralWorkerTokenInput" class="modal-input" value="" placeholder="${snapshot.config?.workerTokenConfigured ? 'Configured; enter a new token to replace' : 'Enter worker token'}" autocomplete="new-password" spellcheck="false">
        <div class="remote-hint">Token is ${escapeHtml(tokenStatus)}. Saved tokens are never shown here.</div>
      </div>` : `<div class="remote-hint" style="margin-top:12px">${remoteMode === 'guest'
        ? 'Guest mode uses the stored room secret for the worker bridge instead of the worker token.'
        : 'Local Only keeps the server URL but leaves the worker bridge and character sync off.'}</div>`}
      <div class="remote-error" id="centralServerUrlError" style="display:none;margin-top:8px;margin-bottom:0"></div>
    </form>
  </div>

  ${snapshot.error ? `<div class="remote-error">${escapeHtml(snapshot.error)}</div>` : ''}

  <div class="server-health-grid">
    ${snapshot.health ? `
    <div><div class="remote-info-label">Health</div><div class="server-health-value">${escapeHtml(snapshot.health.status)}</div></div>
    <div><div class="remote-info-label">Server Time</div><div class="server-health-value">${escapeHtml(formatTimestamp(snapshot.health.time))}</div></div>
    <div><div class="remote-info-label">Event Stream</div><div class="server-health-value">${snapshot.eventsConnected ? 'connected' : 'waiting'}</div></div>
    ` : ''}
    <div><div class="remote-info-label">Remote Mode</div><div class="server-health-value">${escapeHtml(remoteModeLabel(remoteMode))}</div></div>
    <div><div class="remote-info-label">Room Secret</div><div class="server-health-value">${escapeHtml(roomSecretStatus)}</div></div>
    <div><div class="remote-info-label">Character Sync</div><div class="server-health-value">${agentSyncEnabled ? 'enabled' : 'disabled'}</div></div>
    <div><div class="remote-info-label">Worker Connector</div><div class="server-health-value"><span class="server-status-pill ${workerStatusClass(workerStatus)}">${escapeHtml(workerStatus)}</span></div></div>
    <div><div class="remote-info-label">Worker ID</div><div class="server-health-value">${escapeHtml(workerId)}</div></div>
  </div>

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

async function refreshCentralServerCard(force = false): Promise<void> {
  if (!force && document.activeElement?.id === 'centralServerUrlInput') return;
  if (!force && document.activeElement?.id === 'centralWorkerTokenInput') return;
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

  document.getElementById('centralServerUrlForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('centralServerUrlInput') as HTMLInputElement | null;
    const tokenInput = document.getElementById('centralWorkerTokenInput') as HTMLInputElement | null;
    const button = document.getElementById('centralServerUrlSaveBtn') as HTMLButtonElement | null;
    const errorEl = document.getElementById('centralServerUrlError');
    if (!input) return;

    if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    if (button) { button.disabled = true; button.textContent = 'Saving...'; }

    try {
      const workerToken = tokenInput?.value.trim() || '';
      await saveCentralServerConfig({
        baseUrl: input.value,
        ...(workerToken ? { workerToken } : {}),
      });
      stopCentralServerConnection();
      await refreshCentralServerCard(true);
      window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
      startCentralServerConnection();
    } catch (error) {
      if (errorEl) { errorEl.textContent = formatError(error); errorEl.style.display = 'block'; }
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save'; }
    }
  });
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
