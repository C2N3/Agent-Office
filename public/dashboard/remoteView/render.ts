import {
  flagsFromRemoteMode,
  type RemoteMode,
} from '../remoteMode.js';
import {
  renderStatusDetails,
  type RemoteSnapshot,
} from './status.js';

export type RoomAccessStatus = {
  publicMode: boolean;
  ownerSecretSet: boolean;
  guestSecretSet: boolean;
  ownerSecret?: string;
  guestSecret?: string;
  ownerSecretState?: string;
  guestSecretState?: string;
};

type RemoteConfig = {
  baseUrl?: string;
  remoteMode?: RemoteMode;
  roomSecretConfigured?: boolean;
  workerEnabled?: boolean;
  agentSyncEnabled?: boolean;
  workerTokenConfigured?: boolean;
  workerId?: string;
  workerConnectionStatus?: string;
};

type RenderRemotePanelArgs = {
  config: RemoteConfig | null;
  currentBaseUrl: string;
  inviteLink: string;
  mode: RemoteMode;
  remoteActionError: string;
  roomAccess: RoomAccessStatus | null;
  snapshot: RemoteSnapshot;
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderModeSelector(mode: RemoteMode, roomSecretConfigured = false): string {
  const options: Array<{ value: RemoteMode; label: string; title: string; hint: string }> = [
    {
      value: 'local',
      label: 'Local Only',
      title: 'Local registry only',
      hint: 'room secret을 보내지 않고 로컬 registry를 source of truth로 유지합니다.',
    },
    {
      value: 'host',
      label: 'Host',
      title: 'Host room owner',
      hint: '중앙 서버에서 owner secret으로 public room을 열고 guest invite를 관리합니다.',
    },
    {
      value: 'guest',
      label: 'Guest',
      title: 'Join by invite link',
      hint: 'invite link의 중앙 서버 origin과 guest secret으로 접속합니다.',
    },
  ];
  const selected = options.find((option) => option.value === mode) || options[0];
  const flags = flagsFromRemoteMode(mode, { roomSecretConfigured });

  return `
  <div class="remote-mode-tabs" role="tablist" aria-label="Remote mode">
    ${options.map((option) => `
      <label
        class="remote-mode-pill ${mode === option.value ? 'active' : ''}"
        data-remote-mode="${option.value}"
        role="radio"
        aria-checked="${mode === option.value ? 'true' : 'false'}"
        tabindex="0"
      >
        <input
          type="radio"
          class="remote-mode-input"
          name="remoteMode"
          value="${option.value}"
          ${mode === option.value ? 'checked' : ''}
        >
        <span>${escapeHtml(option.label)}</span>
      </label>
    `).join('')}
  </div>
  <div class="remote-mode-sheet">
    <div class="remote-mode-title">${escapeHtml(selected.title)}</div>
    <div class="remote-mode-description">${escapeHtml(selected.hint)}</div>
    <div class="remote-hint">Worker bridge: ${flags.workerEnabled ? 'on' : 'off'} · Character sync: ${flags.agentSyncEnabled ? 'on' : 'off'}</div>
  </div>`;
}

function renderServerUrlForm(
  baseUrl: string,
  mode: RemoteMode,
  workerTokenConfigured: boolean,
): string {
  return `
  <form id="centralServerUrlForm" class="remote-mode-block">
    <div class="remote-info-block">
      <div class="remote-info-label">Server URL</div>
      <div class="modal-path-field">
        <input type="text" id="centralServerUrlInput" class="modal-input" value="${escapeHtml(baseUrl)}" placeholder="http://127.0.0.1:47824" autocomplete="off" spellcheck="false">
        <button class="btn-secondary modal-browse-btn" id="centralServerUrlSaveBtn" type="submit">Save</button>
      </div>
      <div class="remote-hint">포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
    </div>
    ${mode === 'host' ? `
      <div class="remote-info-block">
        <div class="remote-info-label">Worker Token</div>
        <input type="password" id="centralWorkerTokenInput" class="modal-input" value="" placeholder="${workerTokenConfigured ? 'Configured; enter a new token to replace' : 'Enter worker token'}" autocomplete="new-password" spellcheck="false">
        <div class="remote-hint">Token is ${workerTokenConfigured ? 'configured' : 'not configured'}. Saved tokens are never shown here.</div>
      </div>
    ` : `
      <div class="remote-hint">Local Only에서는 URL을 저장해도 worker bridge와 character sync는 꺼진 상태로 유지됩니다.</div>
    `}
    <div class="remote-error" id="centralServerUrlError" style="display:none;margin-bottom:0"></div>
  </form>`;
}

function renderLocalContent(baseUrl: string): string {
  return `
  <div class="remote-status-row remote-mode-block">
    <div class="remote-dot server-dot offline"></div>
    <span class="remote-status-label">Central sync disabled</span>
  </div>
  <div class="remote-info-block">
    <div class="remote-info-label">Persistence</div>
    <div class="remote-hint">대시보드에서 만든 agent와 avatar, metadata 변경은 <code>~/.agent-office/agent-registry.json</code> 에만 저장됩니다.</div>
  </div>
  ${renderServerUrlForm(baseUrl, 'local', false)}`;
}

function renderHostContent(
  baseUrl: string,
  roomAccess: RoomAccessStatus | null,
  workerTokenConfigured: boolean,
  inviteLink: string,
): string {
  const stateLabel = roomAccess?.publicMode ? 'Public room enabled' : 'Public room disabled';
  return `
  <div class="remote-status-row remote-mode-block">
    <div class="remote-dot server-dot ${roomAccess?.publicMode ? 'online' : 'offline'}"></div>
    <span class="remote-status-label">${escapeHtml(stateLabel)}</span>
    <div style="flex:1"></div>
    <button class="btn-primary remote-action-btn" id="hostEnableBtn" type="button">Enable</button>
    <button class="btn-secondary remote-action-btn" id="hostRotateBtn" type="button">Rotate Guest</button>
    <button class="btn-secondary remote-action-btn" id="hostDisableBtn" type="button">Disable</button>
  </div>
  <div class="remote-hint">Host mode는 owner secret을 로컬에 저장하고 room-access API를 통해 public room을 관리합니다.</div>
  ${renderServerUrlForm(baseUrl, 'host', workerTokenConfigured)}
  ${inviteLink ? `
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="remote-url-row">
        <span class="remote-url-text">${escapeHtml(inviteLink)}</span>
        <button class="remote-copy-btn" data-copy="${escapeHtml(inviteLink)}" type="button">Copy</button>
      </div>
    </div>
  ` : `
    <div class="remote-hint">새 guest invite가 필요하면 <code>Rotate Guest</code>를 눌러 fresh link를 발급합니다.</div>
  `}
  <div class="remote-info-block">
    <div class="remote-info-label">Secret Status</div>
    <div class="remote-hint">Owner: ${escapeHtml(roomAccess?.ownerSecretState || 'not set')} · Guest: ${escapeHtml(roomAccess?.guestSecretState || 'not set')}</div>
  </div>`;
}

function renderGuestContent(config: RemoteConfig | null): string {
  const joined = config?.remoteMode === 'guest' && config?.roomSecretConfigured;
  return `
  <form id="guestJoinForm" class="remote-mode-block">
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="modal-path-field">
        <input type="text" id="guestInviteInput" class="modal-input" value="" placeholder="https://central.example/#aoGuestSecret=..." autocomplete="off" spellcheck="false">
        <button class="btn-secondary modal-browse-btn" id="guestJoinBtn" type="submit">Join</button>
      </div>
      <div class="remote-hint">fragment의 <code>aoGuestSecret</code>를 읽어서 중앙 서버 origin과 함께 저장합니다.</div>
    </div>
  </form>
  <div class="remote-info-block">
    <div class="remote-info-label">Current Guest Session</div>
    <div class="remote-hint">${joined
      ? `Connected to ${escapeHtml(config?.baseUrl || '')} with stored guest secret.`
      : 'No guest invite is stored.'}</div>
  </div>`;
}

export function renderRemotePanel(args: RenderRemotePanelArgs): string {
  const roomSecretConfigured = !!args.config?.roomSecretConfigured;
  const modeContent = args.mode === 'host'
    ? renderHostContent(
        args.currentBaseUrl,
        args.roomAccess,
        !!args.config?.workerTokenConfigured,
        args.inviteLink,
      )
    : args.mode === 'guest'
      ? renderGuestContent(args.config)
      : renderLocalContent(args.currentBaseUrl);

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Remote Access</div>
  ${renderModeSelector(args.mode, roomSecretConfigured)}
  ${args.remoteActionError ? `<div class="remote-error" style="margin-top:12px">${escapeHtml(args.remoteActionError)}</div>` : ''}
  ${modeContent}
  ${renderStatusDetails(args.snapshot, roomSecretConfigured)}
</div>`;
}
