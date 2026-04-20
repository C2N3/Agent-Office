import { type RemoteMode } from '../remoteMode.js';

type RemoteConfig = {
  baseUrl?: string;
  remoteMode?: RemoteMode;
  workerConnectionStatus?: string;
};

type RemoteHealth = {
  status: string;
  time: string;
};

type RemoteWorker = {
  id: string;
  displayName: string;
  hostname: string;
  platform: string;
  capabilities: string[];
  status: string;
  runningTasks: number;
};

export type RemoteSnapshot = {
  config: RemoteConfig | null;
  health: RemoteHealth | null;
  workers: RemoteWorker[];
  error: string | null;
  eventsConnected: boolean;
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function workerStatusClass(status?: string): string {
  if (status === 'connected') return 'online';
  if (status === 'connecting' || status === 'reconnecting') return 'starting';
  if (status === 'error') return 'error';
  return 'offline';
}

function renderWorkerList(workers: RemoteWorker[]): string {
  if (workers.length === 0) {
    return '<div class="server-empty">No devices connected.</div>';
  }

  return workers.map((worker) => {
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
          <span>${escapeHtml(worker.runningTasks)} active tasks</span>
        </div>
      </div>
    `;
  }).join('');
}

export function renderStatusDetails(snapshot: RemoteSnapshot, expanded = false): string {
  const workerStatus = snapshot.config?.workerConnectionStatus || 'disconnected';
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error
    ? 'Offline'
    : snapshot.eventsConnected
      ? 'Live'
      : 'Reachable';

  return `
  <details class="remote-settings" ${expanded ? 'open' : ''}>
    <summary class="remote-settings-summary">Status</summary>
    <div class="remote-settings-body">
      <div class="remote-status-row">
        <div class="remote-dot server-dot ${dotClass}"></div>
        <span class="remote-status-label">${escapeHtml(statusLabel)}</span>
        <span class="remote-uptime">${escapeHtml(snapshot.workers.length)} devices</span>
        <div style="flex:1"></div>
        <button class="btn-secondary remote-action-btn" id="remoteStatusRefreshBtn" type="button">Refresh</button>
      </div>
      ${snapshot.error ? `<div class="remote-error">${escapeHtml(snapshot.error)}</div>` : ''}
      <div class="server-health-grid">
        <div><div class="remote-info-label">Server</div><div class="server-health-value">${escapeHtml(snapshot.config?.baseUrl || '-')}</div></div>
        <div><div class="remote-info-label">Connection</div><div class="server-health-value"><span class="server-status-pill ${workerStatusClass(workerStatus)}">${escapeHtml(workerStatus)}</span></div></div>
      </div>
      <div class="remote-info-block" style="margin-bottom:0">
        <div class="remote-info-label">Connected devices</div>
        <div class="server-worker-list">${renderWorkerList(snapshot.workers)}</div>
      </div>
    </div>
  </details>`;
}
