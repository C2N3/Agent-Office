import React, { type ReactElement } from 'react';
import type { RemoteMode } from '../remoteMode.js';
import type { RoomAccessStatus } from '../remoteView/render.js';
import type { RemoteSnapshot } from '../remoteView/status.js';
import { RemoteStatusDetails } from './remoteStatus.js';

export function RemotePanel({
  currentBaseUrl,
  guestInviteValue,
  inviteLink,
  mode,
  persistedMode,
  remoteActionError,
  roomAccess,
  serverUrlValue,
  snapshot,
  statusDetailsExpanded,
  copiedInvite,
  onCopyInvite,
  onGuestInviteChange,
  onGuestJoin,
  onHostDisable,
  onHostEnable,
  onHostRotate,
  onHostStart,
  onLocalApply,
  onModeSelect,
  onRefreshStatus,
  onServerUrlChange,
  onStatusDetailsToggle,
}: {
  copiedInvite: boolean;
  currentBaseUrl: string;
  guestInviteValue: string;
  inviteLink: string;
  mode: RemoteMode;
  persistedMode: RemoteMode;
  remoteActionError: string;
  roomAccess: RoomAccessStatus | null;
  serverUrlValue: string;
  snapshot: RemoteSnapshot;
  statusDetailsExpanded: boolean;
  onCopyInvite: () => void;
  onGuestInviteChange: (value: string) => void;
  onGuestJoin: () => void;
  onHostDisable: () => void;
  onHostEnable: () => void;
  onHostRotate: () => void;
  onHostStart: () => void;
  onLocalApply: () => void;
  onModeSelect: (mode: RemoteMode) => void;
  onRefreshStatus: () => void;
  onServerUrlChange: (value: string) => void;
  onStatusDetailsToggle: (expanded: boolean) => void;
}): ReactElement {
  const options: Array<{ value: RemoteMode; label: string; title: string; hint: string }> = [
    { value: 'local', label: 'Local Only', title: 'Local registry only', hint: '이 기기에서만 사용합니다.' },
    { value: 'host', label: 'Host', title: 'Host room owner', hint: '서버 주소만 입력하면 공유를 시작할 수 있습니다.' },
    { value: 'guest', label: 'Guest', title: 'Join by invite link', hint: '초대 링크를 열면 바로 연결됩니다.' },
  ];
  const selected = options.find((option) => option.value === mode) || options[0];
  const hasPendingSelection = mode !== persistedMode;
  const isActiveLocal = persistedMode === 'local';
  const isActiveHost = persistedMode === 'host';

  return (
    <div className="panel remote-panel">
      <div className="remote-section-title">Remote Access</div>
      <div className="remote-mode-tabs" role="tablist" aria-label="Remote mode">
        {options.map((option) => (
          <label
            key={option.value}
            className={`remote-mode-pill ${mode === option.value ? 'active' : ''}`}
            data-remote-mode={option.value}
            role="radio"
            aria-checked={mode === option.value ? 'true' : 'false'}
            tabIndex={0}
            onClick={() => onModeSelect(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onModeSelect(option.value);
              }
            }}
          >
            <input
              checked={mode === option.value}
              className="remote-mode-input"
              name="remoteMode"
              type="radio"
              value={option.value}
              onChange={() => onModeSelect(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <div className="remote-mode-sheet">
        <div className="remote-mode-title">{selected.title}</div>
        <div className="remote-mode-description">{selected.hint}</div>
        {hasPendingSelection ? <div className="remote-hint">아래 버튼으로 {selected.label} 모드를 적용합니다.</div> : null}
      </div>
      {remoteActionError ? <div className="remote-error" style={{ marginTop: '12px' }}>{remoteActionError}</div> : null}
      {mode === 'local' ? (
        <div className="remote-mode-block">
          {isActiveLocal
            ? <div className="remote-hint">Using Local Only</div>
            : <button className="btn-primary modal-browse-btn" id="localApplyBtn" type="button" onClick={onLocalApply}>Use Local Only</button>}
        </div>
      ) : null}
      {mode === 'host' ? (
        <>
          {isActiveHost ? (
            <div className="remote-status-row remote-mode-block">
              <div className={`remote-dot server-dot ${roomAccess?.publicMode ? 'online' : 'offline'}`} />
              <span className="remote-status-label">{roomAccess?.publicMode ? 'Public room enabled' : 'Public room disabled'}</span>
              <div style={{ flex: 1 }} />
              <button className="btn-primary remote-action-btn" id="hostEnableBtn" type="button" onClick={onHostEnable}>
                {roomAccess?.publicMode ? 'Reopen Public Room' : 'Open Public Room'}
              </button>
              <button className="btn-secondary remote-action-btn" id="hostRotateBtn" type="button" onClick={onHostRotate}>Rotate Invite</button>
              <button className="btn-secondary remote-action-btn" id="hostDisableBtn" type="button" onClick={onHostDisable}>Close Public Room</button>
            </div>
          ) : (
            <div className="remote-hint">서버 주소를 넣고 <code>Start Host</code>를 누르면 바로 시작됩니다.</div>
          )}
          <div className="remote-mode-block">
            <div className="remote-info-block">
              <div className="remote-info-label">Server URL</div>
              <div className="modal-path-field">
                <input
                  autoComplete="off"
                  className="modal-input"
                  id="centralServerUrlInput"
                  placeholder="http://127.0.0.1:47824"
                  spellCheck={false}
                  type="text"
                  value={serverUrlValue}
                  onChange={(event) => onServerUrlChange(event.currentTarget.value)}
                />
                <button className="btn-primary modal-browse-btn" id="hostStartBtn" type="button" onClick={onHostStart}>
                  {isActiveHost ? 'Save Address' : 'Start Host'}
                </button>
              </div>
              <div className="remote-hint">포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
            </div>
            <div className="remote-error" id="centralServerUrlError" style={{ display: 'none', marginBottom: 0 }} />
          </div>
          {isActiveHost && inviteLink ? (
            <div className="remote-info-block">
              <div className="remote-info-label">Invite Link</div>
              <div className="remote-url-row">
                <a className="remote-url-text" href={inviteLink}>{inviteLink}</a>
                <button className="remote-copy-btn" type="button" onClick={onCopyInvite}>{copiedInvite ? '복사됨!' : 'Copy'}</button>
              </div>
            </div>
          ) : (
            <div className="remote-hint">{isActiveHost ? '새 초대 링크가 필요하면 <code>Rotate Invite</code>를 누르세요.' : 'Host를 시작하면 초대 링크를 받을 수 있습니다.'}</div>
          )}
        </>
      ) : null}
      {mode === 'guest' ? (
        <div className="remote-mode-block">
          <div className="remote-info-block">
            <div className="remote-info-label">Invite Link</div>
            <div className="modal-path-field">
              <input
                autoComplete="off"
                className="modal-input"
                id="guestInviteInput"
                placeholder="https://central.example/#aoGuestSecret=..."
                spellCheck={false}
                type="text"
                value={guestInviteValue}
                onChange={(event) => onGuestInviteChange(event.currentTarget.value)}
              />
              <button className="btn-primary modal-browse-btn" id="guestJoinBtn" type="button" onClick={onGuestJoin}>
                {persistedMode === 'guest' ? 'Use New Invite' : 'Join as Guest'}
              </button>
            </div>
            <div className="remote-hint">{persistedMode === 'guest' ? '다른 호스트로 바꾸려면 새 초대 링크를 다시 여세요.' : '초대 링크를 열거나 여기에 붙여넣으세요.'}</div>
          </div>
        </div>
      ) : null}
      {mode !== 'local' ? (
        <RemoteStatusDetails
          expanded={statusDetailsExpanded}
          snapshot={{
            ...snapshot,
            config: snapshot.config
              ? { ...snapshot.config, baseUrl: currentBaseUrl || snapshot.config.baseUrl }
              : snapshot.config,
          }}
          onRefresh={onRefreshStatus}
          onToggle={onStatusDetailsToggle}
        />
      ) : null}
    </div>
  );
}
