import {
  bindCentralServerControls,
  fetchCentralServerSnapshot,
  renderCentralServerCard,
  startCentralServerConnection,
  stopCentralServerConnection,
} from './serverConnection.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;

interface TunnelStatus {
  running: boolean;
  url: string | null;
  error: string | null;
  startedAt: number | null;
  token: string;
  cloudflaredFound: boolean;
}

async function fetchTunnelStatus(): Promise<TunnelStatus | null> {
  try {
    const res = await fetch('/api/tunnel');
    if (!res.ok) return null;
    return res.json() as Promise<TunnelStatus>;
  } catch {
    return null;
  }
}

async function tunnelAction(action: 'start' | 'stop'): Promise<void> {
  try {
    await fetch(`/api/tunnel/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${await getLocalToken()}` },
    });
  } catch {}
  await renderRemoteView();
}

async function getLocalToken(): Promise<string> {
  const status = await fetchTunnelStatus();
  return status?.token ?? '';
}

function copyToClipboard(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {});
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return '';
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function isRemoteInputFocused(): boolean {
  const active = document.activeElement as HTMLInputElement | null;
  return ['centralServerUrlInput', 'centralWorkerTokenInput'].includes(active?.id || '') || active?.name === 'centralConnectionMode';
}

function renderTunnelCard(status: TunnelStatus): string {
  const dotColor = status.running ? (status.url ? '#4ade80' : '#fbbf24') : '#888';
  const dotShadow = status.running && status.url ? '0 0 6px #4ade80' : 'none';
  const statusLabel = status.running
    ? (status.url ? 'Connected' : 'Starting…')
    : 'Stopped';

  const remoteUrl = status.url
    ? `${status.url}/remote?token=${encodeURIComponent(status.token)}`
    : null;

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Cloudflare Tunnel</div>

  <div class="remote-status-row">
    <div class="remote-dot" style="background:${dotColor};box-shadow:${dotShadow}"></div>
    <span class="remote-status-label">${statusLabel}</span>
    ${status.running && status.url ? `<span class="remote-uptime">${formatUptime(status.startedAt)}</span>` : ''}
    <div style="flex:1"></div>
    ${status.running
      ? `<button class="btn-secondary remote-action-btn" id="tunnelStopBtn">Stop</button>`
      : `<button class="btn-primary remote-action-btn" id="tunnelStartBtn">Start Tunnel</button>`
    }
  </div>

  ${status.error ? `<div class="remote-error">${status.error}</div>` : ''}

  ${status.url ? `
  <div class="remote-info-block">
    <div class="remote-info-label">Public URL</div>
    <div class="remote-url-row">
      <span class="remote-url-text">${status.url}</span>
      <button class="remote-copy-btn" data-copy="${status.url}">Copy</button>
    </div>
  </div>
  ` : ''}

  <div class="remote-info-block">
    <div class="remote-info-label">Access Token</div>
    <div class="remote-url-row">
      <span class="remote-url-text remote-token-text">${status.token}</span>
      <button class="remote-copy-btn" data-copy="${status.token}">Copy</button>
    </div>
    <div class="remote-hint">~/.agent-office/remote-token.txt · 앱을 재시작해도 유지됩니다</div>
  </div>

  ${remoteUrl ? `
  <div class="remote-info-block">
    <div class="remote-info-label">모바일 접속 URL</div>
    <div class="remote-url-row">
      <span class="remote-url-text" style="font-size:11px;word-break:break-all">${remoteUrl}</span>
      <button class="remote-copy-btn" data-copy="${remoteUrl}">Copy</button>
    </div>
    <a class="remote-open-link" href="${remoteUrl}" target="_blank">브라우저에서 열기 ↗</a>
  </div>
  ` : ''}
</div>

<div class="panel remote-panel" style="margin-top:12px">
  <div class="remote-section-title">사용 방법</div>
  <ol class="remote-guide">
    <li>위 <strong>Start Tunnel</strong> 버튼을 눌러 터널을 시작합니다</li>
    <li>Public URL이 생성되면 모바일 접속 URL을 복사합니다</li>
    <li>핸드폰 브라우저에서 해당 URL을 엽니다 (토큰이 자동 포함됩니다)</li>
    <li>Agent 작업 제출, 취소, 상태 확인을 어디서든 할 수 있습니다</li>
  </ol>
</div>`;
}

export async function renderRemoteView(): Promise<void> {
  const container = document.getElementById('remoteView');
  if (!container) return;

  const [status, centralServer] = await Promise.all([
    fetchTunnelStatus(),
    fetchCentralServerSnapshot(),
  ]);

  container.innerHTML = renderCentralServerCard(centralServer)
    + (status
      ? renderTunnelCard(status)
      : '<div class="panel remote-panel"><div class="standby-state">Tunnel API unavailable</div></div>');
  bindCentralServerControls();

  document.getElementById('tunnelStartBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('tunnelStartBtn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    await tunnelAction('start');
  });

  document.getElementById('tunnelStopBtn')?.addEventListener('click', async () => {
    await tunnelAction('stop');
  });

  container.querySelectorAll<HTMLButtonElement>('.remote-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy ?? '';
      copyToClipboard(text, btn);
    });
  });
}

export function startRemoteViewPolling(): void {
  startCentralServerConnection();
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (isRemoteInputFocused()) return;
    const remoteView = document.getElementById('remoteView');
    if (remoteView?.classList.contains('active') || remoteView?.closest('.view-section.active')) {
      renderRemoteView();
    }
  }, 3000);
}

export function stopRemoteViewPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  stopCentralServerConnection();
}
