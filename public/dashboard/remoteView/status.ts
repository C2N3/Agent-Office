import { type RemoteMode } from '../remoteMode.js';

type RemoteConfig = {
  remoteMode?: RemoteMode;
  roomSecretConfigured?: boolean;
  workerEnabled?: boolean;
  agentSyncEnabled?: boolean;
  workerId?: string;
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

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
}

function workerStatusClass(status?: string): string {
  if (status === 'connected') return 'online';
  if (status === 'connecting' || status === 'reconnecting') return 'starting';
  if (status === 'error') return 'error';
  return 'offline';
}

function remoteModeLabel(mode: RemoteMode): string {
  if (mode === 'host') return 'Host';
  if (mode === 'guest') return 'Guest';
  return 'Local Only';
}

function renderWorkerList(workers: RemoteWorker[]): string {
  if (workers.length === 0) {
    return '<div class="server-empty">No workers connected.</div>';
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
          <span>${escapeHtml(worker.runningTasks)} running</span>
        </div>
      </div>
    `;
  }).join('');
}

export function renderStatusDetails(snapshot: RemoteSnapshot, roomSecretConfigured = false): string {
  const remoteMode = snapshot.config?.remoteMode || 'local';
  const workerEnabled = !!snapshot.config?.workerEnabled;
  const agentSyncEnabled = !!snapshot.config?.agentSyncEnabled;
  const workerStatus = snapshot.config?.workerConnectionStatus || 'disconnected';
  const workerId = snapshot.config?.workerId || '-';
  const roomSecretStatus = roomSecretConfigured ? 'configured' : 'not configured';
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error
    ? 'Offline'
    : snapshot.eventsConnected
      ? 'Live'
      : 'Reachable';

  return `
  <details class="remote-settings">
    <summary class="remote-settings-summary">Central Server Status</summary>
    <div class="remote-settings-body">
      <div class="remote-status-row">
        <div class="remote-dot server-dot ${dotClass}"></div>
        <span class="remote-status-label">${escapeHtml(statusLabel)}</span>
        <span class="remote-uptime">${escapeHtml(snapshot.workers.length)} workers</span>
        <div style="flex:1"></div>
        <button class="btn-secondary remote-action-btn" id="remoteStatusRefreshBtn" type="button">Refresh</button>
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
        <div><div class="remote-info-label">Worker Bridge</div><div class="server-health-value">${workerEnabled ? 'enabled' : 'disabled'}</div></div>
        <div><div class="remote-info-label">Worker Connector</div><div class="server-health-value"><span class="server-status-pill ${workerStatusClass(workerStatus)}">${escapeHtml(workerStatus)}</span></div></div>
        <div><div class="remote-info-label">Worker ID</div><div class="server-health-value">${escapeHtml(workerId)}</div></div>
      </div>
      <div class="remote-info-block" style="margin-bottom:0">
        <div class="remote-info-label">Workers</div>
        <div class="server-worker-list">${renderWorkerList(snapshot.workers)}</div>
      </div>
    </div>
  </details>`;
}
