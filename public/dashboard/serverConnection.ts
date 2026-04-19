import {
  CENTRAL_CONNECTION_MODES,
  type CentralConnectionMode,
  configFromConnectionMode,
  connectionModeFromConfig,
  getConnectionModeMeta,
} from './centralServerMode.js';

interface CentralServerConfig {
  baseUrl: string; healthPath: string; workersPath: string; eventsPath: string; agentsPath: string; agentSyncEnabled: boolean;
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
let serverSettingsOpen = false;

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try { return new Date(value).toLocaleString(); } catch { return '-'; }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function saveCentralServerConfig(config: {
  baseUrl: string;
  workerEnabled: boolean;
  agentSyncEnabled: boolean;
  workerToken?: string;
}): Promise<CentralServerConfig> {
  const res = await fetch('/api/server/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload as CentralServerConfig;
}

function workerStatusClass(status?: string): string {
  if (status === 'connected') return 'online';
  if (status === 'connecting' || status === 'reconnecting') return 'starting';
  if (status === 'error') return 'error';
  return 'offline';
}

function formatWorkerConnectionStatus(status?: string): string {
  return ({ connected: '연결됨', connecting: '연결 중', reconnecting: '다시 연결 중', error: '오류' } as Record<string, string>)[status || ''] || '연결 안 됨';
}

function formatWorkerPresenceStatus(status?: string): string {
  return ({ online: '온라인', offline: '오프라인' } as Record<string, string>)[status || ''] || (status || '오프라인');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '중앙 서버에 연결할 수 없습니다');
}

export async function fetchCentralServerSnapshot(): Promise<CentralServerSnapshot> {
  let config: CentralServerConfig | null = null;
  try {
    config = await fetchJSON<CentralServerConfig>('/api/server/config');
  } catch (error) {
    return { config: null, health: null, workers: [], error: formatError(error), eventsConnected };
  }

  try {
    const [health, workersResponse] = await Promise.all([
      fetchJSON<CentralServerHealth>(config.healthPath),
      fetchJSON<CentralWorkersResponse>(config.workersPath),
    ]);
    return { config, health, workers: workersResponse.workers || [], error: null, eventsConnected };
  } catch (error) {
    return { config, health: null, workers: [], error: formatError(error), eventsConnected };
  }
}

function renderWorker(worker: CentralWorker): string {
  const caps = (worker.capabilities || []).slice(0, 4).map((cap) => `<span class="server-capability">${escapeHtml(cap)}</span>`).join('');
  const more = worker.capabilities && worker.capabilities.length > 4 ? `<span class="server-capability">+${worker.capabilities.length - 4}</span>` : '';
  return `
    <div class="server-worker-row">
      <div>
        <div class="server-worker-name">${escapeHtml(worker.displayName || worker.id)}</div>
        <div class="server-worker-meta">${escapeHtml(worker.hostname || '알 수 없는 호스트')} &middot; ${escapeHtml(worker.platform || '알 수 없는 플랫폼')}</div>
        <div class="server-capability-list">${caps}${more}</div>
      </div>
      <div class="server-worker-state">
        <span class="server-status-pill ${worker.status === 'online' ? 'online' : 'offline'}">${escapeHtml(formatWorkerPresenceStatus(worker.status))}</span>
        <span>${escapeHtml(worker.runningTasks)}개 실행 중</span>
      </div>
    </div>
  `;
}

function renderModeTabs(mode: CentralConnectionMode): string {
  return CENTRAL_CONNECTION_MODES.map((candidate) => {
    const meta = getConnectionModeMeta(candidate);
    return `<label class="remote-mode-pill ${candidate === mode ? 'active' : ''}"><input type="radio" class="remote-mode-input" name="centralConnectionMode" value="${candidate}" ${candidate === mode ? 'checked' : ''}><span>${escapeHtml(meta.label)}</span></label>`;
  }).join('');
}

export function renderCentralServerCard(snapshot: CentralServerSnapshot): string {
  const mode = connectionModeFromConfig(snapshot.config);
  const modeMeta = getConnectionModeMeta(mode);
  const targetUrl = snapshot.config?.baseUrl || '';
  const workerStatus = snapshot.config?.workerConnectionStatus || 'disconnected';
  const workerId = snapshot.config?.workerId || '-';
  const tokenStatus = snapshot.config?.workerTokenConfigured ? '저장됨' : '저장 안 됨';
  const isOnline = !!snapshot.health && !snapshot.error;
  const dotClass = isOnline ? (snapshot.eventsConnected ? 'online' : 'starting') : 'offline';
  const statusLabel = snapshot.error ? '오프라인' : snapshot.eventsConnected ? '실시간' : '접속 가능';

  return `
<div class="panel remote-panel central-server-panel" id="centralServerCard">
  <div class="remote-section-title">중앙 서버</div>

  <div class="remote-status-row">
    <div class="remote-dot server-dot ${dotClass}"></div>
    <span class="remote-status-label">${statusLabel}</span>
    <span class="remote-uptime">워커 ${escapeHtml(snapshot.workers.length)}대</span>
    <div style="flex:1"></div>
    <button class="btn-secondary remote-action-btn" id="centralServerRefreshBtn">새로고침</button>
  </div>

  <div class="remote-info-block">
    <form id="centralServerUrlForm">
      <div class="remote-mode-block">
        <div class="remote-info-label">연결 모드</div>
        <div class="remote-mode-tabs" role="tablist" aria-label="중앙 서버 연결 모드">${renderModeTabs(mode)}</div>
        <div class="remote-mode-sheet">
          <div class="remote-mode-title">${escapeHtml(modeMeta.title)}</div>
          <div class="remote-mode-description">${escapeHtml(modeMeta.description)}</div>
          ${modeMeta.usesWorkerToken ? `
          <div class="remote-mode-field">
            <div class="remote-info-label">워커 토큰</div>
            <input type="password" id="centralWorkerTokenInput" class="modal-input" value="" placeholder="${snapshot.config?.workerTokenConfigured ? '저장된 토큰이 있습니다. 교체하려면 새 값을 입력하세요' : '워커 토큰을 입력하세요'}" autocomplete="new-password" spellcheck="false">
            <div class="remote-hint">토큰 상태: ${escapeHtml(tokenStatus)}. 저장된 토큰 값은 다시 표시하지 않습니다.</div>
          </div>` : `
          <div class="remote-hint" style="margin-top:10px">서버 주소 변경은 아래 <code>서버 설정</code>에서 할 수 있습니다.</div>`}
        </div>
      </div>
      <details class="remote-settings" ${serverSettingsOpen || !targetUrl ? 'open' : ''}>
        <summary class="remote-settings-summary">서버 설정</summary>
        <div class="remote-settings-body">
          <div class="remote-info-label">서버 주소</div>
          <div class="modal-path-field">
            <input type="text" id="centralServerUrlInput" class="modal-input" value="${escapeHtml(targetUrl)}" autocomplete="off" spellcheck="false">
            <button class="btn-secondary modal-browse-btn" id="centralServerUrlSaveBtn" type="submit">저장</button>
          </div>
          <div class="remote-hint">포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
        </div>
      </details>
      <div class="remote-error" id="centralServerUrlError" style="display:none;margin-top:8px;margin-bottom:0"></div>
    </form>
  </div>

  ${snapshot.error ? `<div class="remote-error">${escapeHtml(snapshot.error)}</div>` : ''}

  <div class="server-health-grid">
    ${snapshot.health ? `
    <div><div class="remote-info-label">상태</div><div class="server-health-value">${snapshot.health.status === 'ok' ? '정상' : escapeHtml(snapshot.health.status)}</div></div>
    <div><div class="remote-info-label">서버 시간</div><div class="server-health-value">${escapeHtml(formatTimestamp(snapshot.health.time))}</div></div>
    <div><div class="remote-info-label">이벤트 스트림</div><div class="server-health-value">${snapshot.eventsConnected ? '연결됨' : '대기 중'}</div></div>` : ''}
    <div><div class="remote-info-label">워커 연결</div><div class="server-health-value"><span class="server-status-pill ${workerStatusClass(workerStatus)}">${escapeHtml(formatWorkerConnectionStatus(workerStatus))}</span></div></div>
    <div><div class="remote-info-label">워커 ID</div><div class="server-health-value">${escapeHtml(workerId)}</div></div>
  </div>

  <div class="remote-info-block">
    <div class="remote-info-label">연결된 워커</div>
    <div class="server-worker-list">
      ${snapshot.workers.length > 0 ? snapshot.workers.map(renderWorker).join('') : '<div class="server-empty">연결된 워커가 없습니다.</div>'}
    </div>
  </div>
</div>`;
}

async function refreshCentralServerCard(force = false): Promise<void> {
  const active = document.activeElement as HTMLInputElement | null;
  if (!force && (active?.id === 'centralServerUrlInput' || active?.id === 'centralWorkerTokenInput' || active?.name === 'centralConnectionMode')) return;
  const card = document.getElementById('centralServerCard');
  if (!card) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderCentralServerCard(await fetchCentralServerSnapshot()).trim();
  const next = wrapper.firstElementChild;
  if (next) { card.replaceWith(next); bindCentralServerControls(); }
}

function scheduleRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshCentralServerCard().catch(() => {});
  }, 250);
}

async function persistCentralServerConfig(includeToken: boolean): Promise<void> {
  const input = document.getElementById('centralServerUrlInput') as HTMLInputElement | null;
  const modeInput = document.querySelector('input[name="centralConnectionMode"]:checked') as HTMLInputElement | null;
  const tokenInput = document.getElementById('centralWorkerTokenInput') as HTMLInputElement | null;
  const button = document.getElementById('centralServerUrlSaveBtn') as HTMLButtonElement | null;
  const errorEl = document.getElementById('centralServerUrlError');
  if (!input) return;
  serverSettingsOpen = !!document.querySelector<HTMLDetailsElement>('.remote-settings')?.open;
  if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
  if (button) { button.disabled = true; button.textContent = '저장 중...'; }
  try {
    const workerToken = includeToken ? (tokenInput?.value.trim() || '') : '';
    const selectedMode = (modeInput?.value || 'local') as CentralConnectionMode;
    await saveCentralServerConfig({ baseUrl: input.value, ...configFromConnectionMode(selectedMode), ...(workerToken ? { workerToken } : {}) });
    stopCentralServerConnection();
    await refreshCentralServerCard(true);
    window.dispatchEvent(new CustomEvent('central-agent-sync-config-changed'));
    startCentralServerConnection();
  } catch (error) {
    if (errorEl) { errorEl.textContent = formatError(error); errorEl.style.display = 'block'; }
  } finally {
    if (button) { button.disabled = false; button.textContent = '저장'; }
  }
}

export function bindCentralServerControls(): void {
  document.getElementById('centralServerRefreshBtn')?.addEventListener('click', () => { refreshCentralServerCard().catch(() => {}); });
  document.querySelector<HTMLDetailsElement>('.remote-settings')?.addEventListener('toggle', (event) => {
    serverSettingsOpen = !!(event.currentTarget as HTMLDetailsElement).open;
  });
  document.getElementById('centralServerUrlForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await persistCentralServerConfig(true);
  });
  document.querySelectorAll('input[name="centralConnectionMode"]').forEach((element) => {
    element.addEventListener('change', () => { void persistCentralServerConfig(false); });
  });
}

export function startCentralServerConnection(): void {
  if (eventSource) return;
  eventSource = new EventSource('/api/server/events');
  eventSource.onopen = () => { eventsConnected = true; scheduleRefresh(); };
  eventSource.onerror = () => { eventsConnected = false; scheduleRefresh(); };
  ['worker.connected', 'worker.disconnected', 'worker.heartbeat', 'agent.created', 'agent.updated', 'agent.removed']
    .forEach((eventName) => eventSource?.addEventListener(eventName, () => scheduleRefresh()));
}

export function stopCentralServerConnection(): void {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (eventSource) { eventSource.close(); eventSource = null; }
  eventsConnected = false;
}
