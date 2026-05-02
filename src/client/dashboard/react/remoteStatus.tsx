import React, { type ReactElement } from 'react';
import type { RemoteSnapshot } from '../remote/status';

function workerStatusClass(status?: string): string {
  if (status === 'connected') return 'online';
  if (status === 'connecting' || status === 'reconnecting') return 'starting';
  if (status === 'error') return 'error';
  return 'offline';
}

export function RemoteStatusDetails({
  expanded,
  onRefresh,
  onToggle,
  hostAccessMissing,
  snapshot,
}: {
  expanded: boolean;
  hostAccessMissing: boolean;
  onRefresh: () => void;
  onToggle: (expanded: boolean) => void;
  snapshot: RemoteSnapshot;
}): ReactElement {
  const workerStatus = hostAccessMissing ? 'access required' : (snapshot.config?.workerConnectionStatus || 'disconnected');
  const workerStatusClassName = hostAccessMissing ? 'starting' : workerStatusClass(snapshot.config?.workerConnectionStatus);
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error ? 'Offline' : snapshot.eventsConnected ? 'Live' : 'Reachable';

  return (
    <details
      className="remote-settings"
      open={expanded}
      onToggle={(event) => onToggle(!!event.currentTarget.open)}
    >
      <summary className="remote-settings-summary">Status</summary>
      <div className="remote-settings-body">
        <div className="remote-status-row">
          <div className={`remote-dot server-dot ${dotClass}`} />
          <span className="remote-status-label">{statusLabel}</span>
          <span className="remote-uptime">{snapshot.workers.length} devices</span>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary remote-action-btn" id="remoteStatusRefreshBtn" type="button" onClick={onRefresh}>Refresh</button>
        </div>
        {snapshot.error ? <div className="remote-error">{snapshot.error}</div> : null}
        <div className="server-health-grid">
          <div>
            <div className="remote-info-label">Server</div>
            <div className="server-health-value">{snapshot.config?.baseUrl || '-'}</div>
          </div>
          <div>
            <div className="remote-info-label">Worker bridge</div>
            <div className="server-health-value">
              <span className={`server-status-pill ${workerStatusClassName}`}>{workerStatus}</span>
            </div>
          </div>
        </div>
        <div className="remote-info-block" style={{ marginBottom: 0 }}>
          <div className="remote-info-label">Connected devices</div>
          <div className="server-worker-list">
            {snapshot.workers.length === 0 ? (
              <div className="server-empty">No devices connected.</div>
            ) : snapshot.workers.map((worker) => (
              <div key={worker.id} className="server-worker-row">
                <div>
                  <div className="server-worker-name">{worker.displayName || worker.id}</div>
                  <div className="server-worker-meta">{worker.hostname || 'unknown host'} · {worker.platform || 'unknown platform'}</div>
                  <div className="server-capability-list">
                    {(worker.capabilities || []).slice(0, 4).map((capability) => (
                      <span key={capability} className="server-capability">{capability}</span>
                    ))}
                    {worker.capabilities && worker.capabilities.length > 4 ? (
                      <span className="server-capability">+{worker.capabilities.length - 4}</span>
                    ) : null}
                  </div>
                </div>
                <div className="server-worker-state">
                  <span className={`server-status-pill ${worker.status === 'online' ? 'online' : 'offline'}`}>{worker.status}</span>
                  <span>{worker.runningTasks} active tasks</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
