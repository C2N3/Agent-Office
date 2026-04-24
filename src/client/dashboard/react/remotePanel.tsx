import React, { type ReactElement } from 'react';
import type { RemoteMode } from '../remoteMode.js';
import type { RoomAccessStatus } from '../remote/types.js';
import type { RemoteSnapshot } from '../remote/status.js';
import { RemoteStatusDetails } from './remoteStatus.js';
import styles from '../styles/remote/remote-panel.module.scss';

export function RemotePanel({
  currentBaseUrl,
  guestInviteValue,
  hostOwnerAccessMessage,
  hostOwnerAccessRequired,
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
  hostOwnerAccessMessage: string;
  hostOwnerAccessRequired: boolean;
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
    { value: 'local', label: 'Local Only', title: 'Use this device only', hint: '이 기기의 agent만 표시하고 외부 연결은 끕니다.' },
    { value: 'host', label: 'Host', title: 'Share this office', hint: '서버 주소를 정한 뒤 초대 링크를 만들어 다른 기기를 연결합니다.' },
    { value: 'guest', label: 'Guest', title: 'Join a host', hint: '호스트가 보낸 초대 링크로 기존 office에 들어갑니다.' },
  ];
  const selected = options.find((option) => option.value === mode) || options[0];
  const hasPendingSelection = mode !== persistedMode;
  const isActiveLocal = persistedMode === 'local';
  const isActiveHost = persistedMode === 'host';
  const hostGuestAccessEnabled = isActiveHost && !!roomAccess?.publicMode;
  const showOwnerAccessState = isActiveHost && hostOwnerAccessRequired;
  const hostStatusLabel = !isActiveHost
    ? 'Hosting is not active'
    : showOwnerAccessState
      ? 'Owner access required'
      : hostGuestAccessEnabled
      ? 'Guests can join with the current invite'
      : 'Guests cannot join yet';
  const hostStatusHint = !isActiveHost
    ? 'Enter the server address and start hosting first.'
    : showOwnerAccessState
      ? hostOwnerAccessMessage
    : hostGuestAccessEnabled
      ? 'Share the invite link below. Create a new one whenever the old link should stop working.'
      : 'Create an invite link when you are ready to accept guests.';

  return (
    <div className={`panel remote-panel ${styles.panelRoot}`}>
      <div className={`remote-section-title ${styles.sectionTitle}`}>Remote Access</div>
      <div className={`remote-mode-tabs ${styles.modeTabs}`} role="tablist" aria-label="Remote mode">
        {options.map((option) => (
          <label
            key={option.value}
            className={`remote-mode-pill ${styles.modePill} ${mode === option.value ? `active ${styles.modePillActive}` : ''}`}
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
              className={`remote-mode-input ${styles.modeInput}`}
              name="remoteMode"
              type="radio"
              value={option.value}
              onChange={() => onModeSelect(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <div className={`remote-mode-sheet ${styles.modeSheet}`}>
        <div className={`remote-mode-title ${styles.modeTitle}`}>{selected.title}</div>
        <div className={`remote-mode-description ${styles.modeDescription}`}>{selected.hint}</div>
        {hasPendingSelection ? <div className={`remote-hint ${styles.modeHint}`}>아래 버튼으로 {selected.label} 모드를 적용합니다.</div> : null}
      </div>
      {remoteActionError ? <div className={`remote-error ${styles.error}`}>{remoteActionError}</div> : null}
      {mode === 'local' ? (
        <div className={`remote-mode-block ${styles.modeBlock}`}>
          {isActiveLocal
            ? <div className={`remote-hint ${styles.modeHint}`}>Local Only is active. Remote worker sync and shared agent visibility are off.</div>
            : <button className="btn-primary modal-browse-btn" id="localApplyBtn" type="button" onClick={onLocalApply}>Switch to Local Only</button>}
        </div>
      ) : null}
      {mode === 'host' ? (
        <>
          <div className={`${styles.hostSummary} ${styles.modeBlock}`}>
            <div className={`remote-dot server-dot ${styles.statusDot} ${hostGuestAccessEnabled ? 'online' : 'offline'}`} />
            <div>
              <div className={styles.hostSummaryTitle}>{hostStatusLabel}</div>
              <div className={styles.hostSummaryHint}>{hostStatusHint}</div>
            </div>
          </div>
          <div className={`remote-mode-block ${styles.modeBlock}`}>
            <div className={`remote-info-block ${styles.infoBlock}`}>
              <div className={`remote-info-label ${styles.infoLabel}`}>Host server</div>
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
                  {isActiveHost ? 'Update Server' : 'Start Hosting'}
                </button>
              </div>
              <div className={`remote-hint ${styles.modeHint}`}>포트만 입력해도 됩니다. 예: <code>47824</code> 또는 <code>http://127.0.0.1:47824</code></div>
            </div>
            <div className="remote-error" id="centralServerUrlError" hidden />
          </div>
          {isActiveHost ? (
            <div className={`remote-info-block ${styles.infoBlock}`}>
              <div className={`remote-info-label ${styles.infoLabel}`}>Guest invite</div>
              {showOwnerAccessState ? (
                <div className={styles.emptyInvite}>{hostOwnerAccessMessage}</div>
              ) : hostGuestAccessEnabled && inviteLink ? (
                <div className={`remote-url-row ${styles.urlRow}`}>
                  <a className={`remote-url-text ${styles.urlText}`} href={inviteLink}>{inviteLink}</a>
                  <button className={`remote-copy-btn ${styles.copyButton}`} type="button" onClick={onCopyInvite}>{copiedInvite ? 'Copied' : 'Copy'}</button>
                </div>
              ) : (
                <div className={styles.emptyInvite}>
                  {hostGuestAccessEnabled
                    ? 'Guest access is on, but this client does not have a current invite link.'
                    : 'No one can join until you create an invite link.'}
                </div>
              )}
              <div className={styles.hostActionRow}>
                {showOwnerAccessState ? null : hostGuestAccessEnabled ? (
                  <>
                    <button className="btn-secondary remote-action-btn" id="hostRotateBtn" type="button" onClick={onHostRotate}>New Invite Link</button>
                    <button className="btn-secondary remote-action-btn" id="hostDisableBtn" type="button" onClick={onHostDisable}>Stop Sharing</button>
                  </>
                ) : (
                  <button className="btn-primary remote-action-btn" id="hostEnableBtn" type="button" onClick={onHostEnable}>Create Invite Link</button>
                )}
              </div>
            </div>
          ) : (
            <div className={`remote-hint ${styles.modeHint}`}>Start hosting first. The invite controls appear after this device owns the host session.</div>
          )}
        </>
      ) : null}
      {mode === 'guest' ? (
        <div className={`remote-mode-block ${styles.modeBlock}`}>
          <div className={`remote-info-block ${styles.infoBlock}`}>
            <div className={`remote-info-label ${styles.infoLabel}`}>Host invite link</div>
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
                {persistedMode === 'guest' ? 'Switch Invite' : 'Join Host'}
              </button>
            </div>
            <div className={`remote-hint ${styles.modeHint}`}>{persistedMode === 'guest' ? '다른 호스트로 바꾸려면 새 초대 링크를 붙여넣으세요.' : '초대 링크를 열거나 여기에 붙여넣으세요.'}</div>
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
