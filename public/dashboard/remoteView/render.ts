import { type RemoteMode } from '../remoteMode.js';
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
  workerId?: string;
  workerConnectionStatus?: string;
};

type RenderRemotePanelArgs = {
  config: RemoteConfig | null;
  currentBaseUrl: string;
  inviteLink: string;
  mode: RemoteMode;
  persistedMode: RemoteMode;
  statusDetailsExpanded: boolean;
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

function renderModeSelector(mode: RemoteMode, persistedMode: RemoteMode, roomSecretConfigured = false): string {
  const options: Array<{ value: RemoteMode; label: string; title: string; hint: string }> = [
    {
      value: 'local',
      label: 'Local Only',
      title: 'Local registry only',
      hint: '이 기기에서만 사용합니다.',
    },
    {
      value: 'host',
      label: 'Host',
      title: 'Host room owner',
      hint: '서버 주소만 입력하면 공유를 시작할 수 있습니다.',
    },
    {
      value: 'guest',
      label: 'Guest',
      title: 'Join by invite link',
      hint: '초대 링크를 열면 바로 연결됩니다.',
    },
  ];
  const selected = options.find((option) => option.value === mode) || options[0];
  const hasPendingSelection = mode !== persistedMode;

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
    ${hasPendingSelection ? `<div class="remote-hint">아래 버튼으로 ${escapeHtml(selected.label)} 모드를 적용합니다.</div>` : ''}
  </div>`;
}

function renderServerSettings(
  baseUrl: string,
  buttonId: string,
  buttonLabel: string,
): string {
  return `
  <div class="remote-mode-block">
    <div class="remote-info-block">
      <div class="remote-info-label">Server URL</div>
      <div class="modal-path-field">
        <input type="text" id="centralServerUrlInput" class="modal-input" value="${escapeHtml(baseUrl)}" placeholder="http://127.0.0.1:47824" autocomplete="off" spellcheck="false">
        <button class="btn-primary modal-browse-btn" id="${buttonId}" type="button">${escapeHtml(buttonLabel)}</button>
      </div>
      <div class="remote-hint">포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
    </div>
    <div class="remote-error" id="centralServerUrlError" style="display:none;margin-bottom:0"></div>
  </div>`;
}

function renderLocalContent(_baseUrl: string, isActive: boolean): string {
  return `
  <div class="remote-mode-block">
    ${isActive
      ? '<div class="remote-hint">Using Local Only</div>'
      : '<button class="btn-primary modal-browse-btn" id="localApplyBtn" type="button">Use Local Only</button>'}
  </div>`;
}

function renderHostContent(
  baseUrl: string,
  roomAccess: RoomAccessStatus | null,
  inviteLink: string,
  isActive: boolean,
): string {
  const stateLabel = roomAccess?.publicMode ? 'Public room enabled' : 'Public room disabled';
  return `
  ${isActive ? `
    <div class="remote-status-row remote-mode-block">
      <div class="remote-dot server-dot ${roomAccess?.publicMode ? 'online' : 'offline'}"></div>
      <span class="remote-status-label">${escapeHtml(stateLabel)}</span>
      <div style="flex:1"></div>
      <button class="btn-primary remote-action-btn" id="hostEnableBtn" type="button">${roomAccess?.publicMode ? 'Reopen Public Room' : 'Open Public Room'}</button>
      <button class="btn-secondary remote-action-btn" id="hostRotateBtn" type="button">Rotate Invite</button>
      <button class="btn-secondary remote-action-btn" id="hostDisableBtn" type="button">Close Public Room</button>
    </div>
  ` : `
    <div class="remote-hint">서버 주소를 넣고 <code>Start Host</code>를 누르면 바로 시작됩니다.</div>
  `}
  ${renderServerSettings(baseUrl, 'hostStartBtn', isActive ? 'Save Address' : 'Start Host')}
  ${isActive && inviteLink ? `
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="remote-url-row">
        <a class="remote-url-text" href="${escapeHtml(inviteLink)}">${escapeHtml(inviteLink)}</a>
        <button class="remote-copy-btn" data-copy="${escapeHtml(inviteLink)}" type="button">Copy</button>
      </div>
    </div>
  ` : `
    <div class="remote-hint">${isActive ? '새 초대 링크가 필요하면 <code>Rotate Invite</code>를 누르세요.' : 'Host를 시작하면 초대 링크를 받을 수 있습니다.'}</div>
  `}`;
}

function renderGuestContent(config: RemoteConfig | null): string {
  const joined = config?.remoteMode === 'guest' && config?.roomSecretConfigured;
  return `
  <div class="remote-mode-block">
    <div class="remote-info-block">
      <div class="remote-info-label">Invite Link</div>
      <div class="modal-path-field">
        <input type="text" id="guestInviteInput" class="modal-input" value="" placeholder="https://central.example/#aoGuestSecret=..." autocomplete="off" spellcheck="false">
        <button class="btn-primary modal-browse-btn" id="guestJoinBtn" type="button">${joined ? 'Use New Invite' : 'Join as Guest'}</button>
      </div>
      <div class="remote-hint">${joined
        ? '다른 호스트로 바꾸려면 새 초대 링크를 다시 여세요.'
        : '초대 링크를 열거나 여기에 붙여넣으세요.'}</div>
    </div>
  </div>`;
}

export function renderRemotePanel(args: RenderRemotePanelArgs): string {
  const showCentralServerControls = args.mode !== 'local';
  const isActiveLocal = args.persistedMode === 'local';
  const isActiveHost = args.persistedMode === 'host';
  const modeContent = args.mode === 'host'
    ? renderHostContent(
        args.currentBaseUrl,
        args.roomAccess,
        args.inviteLink,
        isActiveHost,
      )
    : args.mode === 'guest'
      ? renderGuestContent(args.config)
      : renderLocalContent(args.currentBaseUrl, isActiveLocal);

  return `
<div class="panel remote-panel">
  <div class="remote-section-title">Remote Access</div>
  ${renderModeSelector(args.mode, args.persistedMode)}
  ${args.remoteActionError ? `<div class="remote-error" style="margin-top:12px">${escapeHtml(args.remoteActionError)}</div>` : ''}
  ${modeContent}
  ${showCentralServerControls ? renderStatusDetails(args.snapshot, args.statusDetailsExpanded) : ''}
</div>`;
}
