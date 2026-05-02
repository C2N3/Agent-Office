import React, { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCloudflareTunnelStatus,
  startCloudflareTunnel,
  stopCloudflareTunnel,
  type TunnelStatus,
} from '../cloudflareView';

function formatStartedAt(value: number | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
}

function formatError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return String(error || fallback);
}

function deriveStatus(status: TunnelStatus | null): { dotClass: string; label: string } {
  if (!status) return { dotClass: 'starting', label: 'Loading' };
  if (!status.running) return { dotClass: 'offline', label: 'Stopped' };
  if (!status.url) return { dotClass: 'starting', label: 'Starting' };
  return { dotClass: 'online', label: 'Public URL ready' };
}

export function CloudflarePanel({ active }: { active: boolean }): ReactElement {
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState<'start' | 'stop' | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<TunnelStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await fetchCloudflareTunnelStatus();
      setStatus(nextStatus);
      setLoadError('');
    } catch (error) {
      setLoadError(formatError(error, 'Failed to load tunnel status'));
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void refreshStatus();
    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [active, refreshStatus]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const statusDisplay = useMemo(() => deriveStatus(status), [status]);

  const runAction = useCallback(async (action: 'start' | 'stop') => {
    setBusyAction(action);
    setActionError('');
    try {
      if (action === 'start') {
        await startCloudflareTunnel();
      } else {
        await stopCloudflareTunnel();
      }
      await refreshStatus();
    } catch (error) {
      setActionError(formatError(error, action === 'start' ? 'Failed to start tunnel' : 'Failed to stop tunnel'));
    } finally {
      setBusyAction(null);
    }
  }, [refreshStatus]);

  const copyPublicUrl = useCallback(() => {
    if (!status?.url) return;
    navigator.clipboard.writeText(status.url).then(() => setCopied(true)).catch(() => {});
  }, [status?.url]);

  return (
    <div className="panel remote-panel">
      <div className="remote-section-title">Cloudflare Tunnel</div>
      <div className="remote-status-row">
        <div className={`remote-dot server-dot ${statusDisplay.dotClass}`} />
        <span className="remote-status-label">{statusDisplay.label}</span>
        <div style={{ flex: 1 }} />
        <button className="btn-secondary remote-action-btn" type="button" onClick={refreshStatus}>Refresh</button>
        <button
          className="btn-primary remote-action-btn"
          disabled={!!busyAction || !status || !!status.running}
          type="button"
          onClick={() => void runAction('start')}
        >
          {busyAction === 'start' ? 'Starting...' : 'Start'}
        </button>
        <button
          className="btn-secondary remote-action-btn"
          disabled={!!busyAction || !status || !status.running}
          type="button"
          onClick={() => void runAction('stop')}
        >
          {busyAction === 'stop' ? 'Stopping...' : 'Stop'}
        </button>
      </div>
      {actionError ? <div className="remote-error">{actionError}</div> : null}
      {loadError ? <div className="remote-error">{loadError}</div> : null}
      {status?.error ? <div className="remote-error">{status.error}</div> : null}
      <div className="server-health-grid">
        <div>
          <div className="remote-info-label">cloudflared</div>
          <div className="server-health-value">{status ? (status.cloudflaredFound ? 'found' : 'missing') : '-'}</div>
        </div>
        <div>
          <div className="remote-info-label">Started</div>
          <div className="server-health-value">{formatStartedAt(status?.startedAt)}</div>
        </div>
        <div>
          <div className="remote-info-label">Remote Token</div>
          <div className="server-health-value">{status ? (status.token ? 'configured' : 'missing') : '-'}</div>
        </div>
      </div>
      {status?.url ? (
        <div className="remote-info-block">
          <div className="remote-info-label">Public URL</div>
          <div className="remote-url-row">
            <span className="remote-url-text">{status.url}</span>
            <button className="remote-copy-btn" type="button" onClick={copyPublicUrl}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <a className="remote-open-link" href={status.url} target="_blank" rel="noreferrer">Open tunnel</a>
        </div>
      ) : (
        <div className="remote-hint">
          Start creates a temporary Cloudflare quick tunnel to <code>http://localhost:3000</code>.
        </div>
      )}
      <div className="remote-hint">
        Use this for quick-tunnel diagnostics; Host and Guest modes remain the primary sharing flow.
      </div>
    </div>
  );
}
