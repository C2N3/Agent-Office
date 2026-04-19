type TunnelStatus = {
  running: boolean;
  url: string | null;
  error: string | null;
  startedAt: number | null;
  cloudflaredFound?: boolean;
  token?: string;
};

let pollInterval: ReturnType<typeof setInterval> | null = null;
let actionError = '';

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStartedAt(value: number | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
}

async function fetchTunnelStatus(): Promise<TunnelStatus> {
  const response = await fetch('/api/tunnel', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<TunnelStatus>;
}

async function postTunnelAction(path: '/api/tunnel/start' | '/api/tunnel/stop'): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : payload?.message || `HTTP ${response.status}`);
  }
}

function copyToClipboard(text: string, button: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  }).catch(() => {});
}

function renderCloudflareStatus(status: TunnelStatus): string {
  const dotClass = status.running ? (status.url ? 'online' : 'starting') : 'offline';
  const statusLabel = status.running
    ? (status.url ? 'Public URL ready' : 'Starting')
    : 'Stopped';

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Cloudflare Tunnel</div>
  <div class="remote-status-row">
    <div class="remote-dot server-dot ${dotClass}"></div>
    <span class="remote-status-label">${escapeHtml(statusLabel)}</span>
    <div style="flex:1"></div>
    <button class="btn-secondary remote-action-btn" id="cloudflareRefreshBtn">Refresh</button>
    <button class="btn-primary remote-action-btn" id="cloudflareStartBtn" ${status.running ? 'disabled' : ''}>Start</button>
    <button class="btn-secondary remote-action-btn" id="cloudflareStopBtn" ${status.running ? '' : 'disabled'}>Stop</button>
  </div>
  ${actionError ? `<div class="remote-error">${escapeHtml(actionError)}</div>` : ''}
  ${status.error ? `<div class="remote-error">${escapeHtml(status.error)}</div>` : ''}
  <div class="server-health-grid">
    <div><div class="remote-info-label">cloudflared</div><div class="server-health-value">${status.cloudflaredFound ? 'found' : 'missing'}</div></div>
    <div><div class="remote-info-label">Started</div><div class="server-health-value">${escapeHtml(formatStartedAt(status.startedAt))}</div></div>
    <div><div class="remote-info-label">Remote Token</div><div class="server-health-value">${status.token ? 'configured' : 'missing'}</div></div>
  </div>
  ${status.url ? `
    <div class="remote-info-block">
      <div class="remote-info-label">Public URL</div>
      <div class="remote-url-row">
        <span class="remote-url-text">${escapeHtml(status.url)}</span>
        <button class="remote-copy-btn" id="cloudflareCopyBtn" data-copy="${escapeHtml(status.url)}">Copy</button>
      </div>
      <a class="remote-open-link" href="${escapeHtml(status.url)}" target="_blank" rel="noreferrer">Open tunnel</a>
    </div>
  ` : `
    <div class="remote-hint">Start creates a temporary Cloudflare quick tunnel to <code>http://localhost:3000</code>.</div>
  `}
  <div class="remote-hint">This tab is only shown in dev mode so it does not overlap with the Host/Guest product model.</div>
</div>`;
}

export async function renderCloudflareView(): Promise<void> {
  const container = document.getElementById('cloudflareView');
  if (!container) return;

  try {
    const status = await fetchTunnelStatus();
    container.innerHTML = renderCloudflareStatus(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Failed to load tunnel status');
    container.innerHTML = `<div class="panel remote-panel"><div class="remote-error">${escapeHtml(message)}</div></div>`;
    return;
  }

  document.getElementById('cloudflareRefreshBtn')?.addEventListener('click', () => {
    void renderCloudflareView();
  });
  document.getElementById('cloudflareStartBtn')?.addEventListener('click', async () => {
    try {
      actionError = '';
      await postTunnelAction('/api/tunnel/start');
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error || 'Failed to start tunnel');
    }
    await renderCloudflareView();
  });
  document.getElementById('cloudflareStopBtn')?.addEventListener('click', async () => {
    try {
      actionError = '';
      await postTunnelAction('/api/tunnel/stop');
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error || 'Failed to stop tunnel');
    }
    await renderCloudflareView();
  });
  document.getElementById('cloudflareCopyBtn')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLElement | null;
    if (!button) return;
    copyToClipboard(button.dataset.copy || '', button);
  });
}

export function startCloudflareViewPolling(): void {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    const cloudflareView = document.getElementById('cloudflareView');
    if (cloudflareView?.classList.contains('active') || cloudflareView?.closest('.view-section.active')) {
      void renderCloudflareView();
    }
  }, 3000);
}

export function stopCloudflareViewPolling(): void {
  if (!pollInterval) return;
  clearInterval(pollInterval);
  pollInterval = null;
}
